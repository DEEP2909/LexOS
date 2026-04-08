/**
 * LexOS API Server
 * Main entry point for the Fastify API server
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import websocket from '@fastify/websocket';
import { Redis } from 'ioredis';

import { config, corsOrigins, rateLimits, isProduction } from './config.js';
import { logger } from './logger.js';
import { pool, checkDatabaseHealth, closeDatabasePool } from './database.js';
import { initializeAuth } from './auth.js';
import { checkClamAVHealth } from './malware.js';
import { registerRoutes } from './routes.js';
import { scimRoutes } from './scim.js';
import { registerSsoRoutes } from './sso.js';
import { registerWebAuthnRoutes } from './webauthn.js';
import { registerSamlRoutes } from './saml.js';
import { initializeWebSocket } from './websocket.js';
import { registerTenantIsolation } from './tenant-isolation.js';
import { registerSecurityHardening } from './security-hardening.js';
import { closeOrchestrator } from './orchestrator.js';
import { addVersionNegotiation } from './api-versioning.js';
import crypto from 'crypto';

// ============================================================
// SERVER SETUP
// ============================================================

const fastify = Fastify({
  logger: {
    level: isProduction ? 'info' : 'debug',
    transport: !isProduction
      ? {
          target: 'pino-pretty',
          options: { colorize: true },
        }
      : undefined,
  },
  trustProxy: isProduction,
  requestIdHeader: 'x-request-id',
  requestIdLogLabel: 'requestId',
});

// ============================================================
// PLUGINS
// ============================================================

// CORS
await fastify.register(cors, {
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
});

// Security headers
await fastify.register(helmet, {
  contentSecurityPolicy: isProduction
    ? {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
        },
      }
    : false,
  hsts: isProduction
    ? {
        maxAge: 31536000,
        includeSubDomains: true,
      }
    : false,
});

// Cookies - Issue #9 fix: use random key in dev instead of hardcoded string
const cookieSecret = config.APP_ENCRYPTION_KEY?.slice(0, 32) 
  ?? crypto.randomBytes(16).toString('hex');
if (!config.APP_ENCRYPTION_KEY) {
  logger.warn('⚠️  APP_ENCRYPTION_KEY not set — using ephemeral cookie secret (not for production!)');
}
await fastify.register(cookie, {
  secret: cookieSecret,
  parseOptions: {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'strict',
    path: '/',
  },
});

// Rate limiting with Redis
const redis = new Redis(config.REDIS_URL);
await fastify.register(rateLimit, {
  global: true,
  max: rateLimits.general.requests,
  timeWindow: rateLimits.general.windowMs,
  redis,
  keyGenerator: (request) => {
    // Use tenant ID for authenticated requests, IP for others
    const tenantId = (request as unknown as { tenantId?: string }).tenantId;
    return tenantId || request.ip;
  },
});

// Multipart file uploads
await fastify.register(multipart, {
  limits: {
    fileSize: config.MAX_FILE_SIZE_BYTES,
    files: 10,
  },
});

// WebSocket support
await fastify.register(websocket, {
  options: {
    maxPayload: 1048576,
  },
});

// ============================================================
// CUSTOM PLUGINS
// ============================================================

// Tenant isolation middleware - enforces tenant_id on all queries
await fastify.register(registerTenantIsolation);
logger.info('Tenant isolation middleware registered');

// Additional security hardening (beyond @fastify/helmet)
await fastify.register(registerSecurityHardening);
logger.info('Security hardening middleware registered');

// ============================================================
// DECORATORS
// ============================================================

// Add tenant context to requests
fastify.decorateRequest('tenantId', null);
fastify.decorateRequest('attorneyId', null);
fastify.decorateRequest('attorneyRole', null);

// ============================================================
// HOOKS
// ============================================================

// Request logging
fastify.addHook('onRequest', async (request) => {
  request.log.info({ method: request.method, url: request.url }, 'Request started');
});

// Response logging
fastify.addHook('onResponse', async (request, reply) => {
  request.log.info(
    { method: request.method, url: request.url, statusCode: reply.statusCode },
    'Request completed'
  );
});

// Error handling
fastify.setErrorHandler(async (error, request, reply) => {
  request.log.error({ err: error }, 'Request error');

  // Don't expose internal errors in production
  if (isProduction && error.statusCode !== 400 && error.statusCode !== 401 && error.statusCode !== 403 && error.statusCode !== 404) {
    return reply.status(500).send({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
      },
    });
  }

  return reply.status(error.statusCode || 500).send({
    success: false,
    error: {
      code: error.code || 'ERROR',
      message: error.message,
    },
  });
});

// ============================================================
// HEALTH ENDPOINTS
// ============================================================

fastify.get('/health/live', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

fastify.get('/health/ready', async (request, reply) => {
  const checks = {
    database: await checkDatabaseHealth(),
    redis: redis.status === 'ready',
    clamav: await checkClamAVHealth(),
  };

  const healthy = Object.values(checks).every(Boolean);

  return reply.status(healthy ? 200 : 503).send({
    status: healthy ? 'ok' : 'degraded',
    checks,
    timestamp: new Date().toISOString(),
  });
});

// ============================================================
// ROUTES
// ============================================================

// IMPORTANT: Content type parser MUST be registered BEFORE routes (Fastify requirement)
// This custom parser keeps raw buffer for Stripe webhook while parsing JSON for others
fastify.addContentTypeParser(
  'application/json',
  { parseAs: 'buffer', bodyLimit: 1048576 },
  (req, body, done) => {
    // For Stripe webhook endpoint, keep raw buffer for signature verification
    if (req.url === '/billing/webhook') {
      done(null, body);
    } else {
      // For all other endpoints, parse as JSON
      try {
        const json = JSON.parse(body.toString());
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  }
);

// Add version negotiation before routes (Issue #6 fix)
addVersionNegotiation(fastify);

await registerRoutes(fastify);

// Register SSO/SCIM/WebAuthn/SAML routes (Issue #1 fix)
await fastify.register(scimRoutes);
await registerSsoRoutes(fastify);
registerWebAuthnRoutes(fastify, pool);
await registerSamlRoutes(fastify);

// Initialize WebSocket server for real-time events (await to ensure Redis adapter connects)
await initializeWebSocket(fastify.server, config.REDIS_URL, config.JWT_PUBLIC_KEY_PATH);

// ============================================================
// STRIPE WEBHOOK ROUTE
// ============================================================

// POST /billing/webhook - Stripe webhook handler
fastify.post('/billing/webhook', async (request, reply) => {
  const signature = request.headers['stripe-signature'] as string;
  
  if (!signature) {
    return reply.status(400).send({ success: false, error: { message: 'Missing stripe-signature header' } });
  }

  try {
    const { handleStripeWebhook } = await import('./billing.js');
    const result = await handleStripeWebhook(request.body as Buffer, signature);
    return reply.status(200).send(result);
  } catch (error) {
    logger.error({ error }, 'Stripe webhook error');
    return reply.status(400).send({ success: false, error: { message: 'Webhook verification failed' } });
  }
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

for (const signal of signals) {
  process.on(signal, async () => {
    logger.info({ signal }, 'Received shutdown signal');

    // Close server
    await fastify.close();
    logger.info('Server closed');

    // Close orchestrator (FlowProducer Redis connection)
    await closeOrchestrator();
    logger.info('Orchestrator closed');

    // Close Redis
    await redis.quit();
    logger.info('Redis connection closed');

    // Close database pool
    await closeDatabasePool();

    process.exit(0);
  });
}

// ============================================================
// START SERVER
// ============================================================

async function start() {
  try {
    // Initialize auth (load JWT keys)
    await initializeAuth();
    logger.info('Auth initialized');

    // Verify database connection
    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    logger.info('Database connection verified');

    // Start server
    await fastify.listen({
      port: config.PORT,
      host: config.HOST,
    });

    logger.info(`Server listening on http://${config.HOST}:${config.PORT}`);
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

start();
