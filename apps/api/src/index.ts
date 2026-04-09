/**
 * LexOS API Server
 * Main entry point for the Fastify API server
 */

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import websocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import { Redis } from 'ioredis';

import { initializeAuth } from './auth.js';
import { addVersionNegotiation } from './api-versioning.js';
import { checkDatabaseHealth, closeDatabasePool, pool } from './database.js';
import { config, corsOrigins, isProduction, rateLimits } from './config.js';
import { registerRoutes } from './routes.js';
import { logger } from './logger.js';
import { checkClamAVHealth } from './malware.js';
import { closeOrchestrator } from './orchestrator.js';
import { scimRoutes } from './scim.js';
import { registerSecurityHardening } from './security-hardening.js';
import { registerSamlRoutes } from './saml.js';
import { registerSsoRoutes } from './sso.js';
import { registerTenantIsolation } from './tenant-isolation.js';
import { registerWebAuthnRoutes } from './webauthn.js';
import { initializeWebSocket } from './websocket.js';

export async function build(): Promise<FastifyInstance> {
  const fastify = Fastify({
    logger: {
      level: isProduction ? 'info' : 'debug',
    },
    trustProxy: isProduction,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  }) as FastifyInstance;

  const redis = config.NODE_ENV === 'test' ? null : new Redis(config.REDIS_URL);

  await fastify.register(cors, {
    origin: corsOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  });

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

  const cookieSecret = config.APP_ENCRYPTION_KEY?.slice(0, 32) ?? crypto.randomBytes(16).toString('hex');
  if (!config.APP_ENCRYPTION_KEY) {
    logger.warn('APP_ENCRYPTION_KEY not set, using an ephemeral cookie secret');
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

  await fastify.register(rateLimit, {
    global: true,
    max: rateLimits.general.requests,
    timeWindow: rateLimits.general.windowMs,
    ...(redis ? { redis } : {}),
    keyGenerator: (request) => {
      const tenantId = (request as unknown as { tenantId?: string }).tenantId;
      return tenantId || request.ip;
    },
  });

  await fastify.register(multipart, {
    limits: {
      fileSize: config.MAX_FILE_SIZE_BYTES,
      files: 10,
    },
  });

  await fastify.register(websocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  await fastify.register(registerTenantIsolation);
  logger.info('Tenant isolation middleware registered');

  await fastify.register(registerSecurityHardening);
  logger.info('Security hardening middleware registered');

  fastify.decorateRequest('tenantId', null);
  fastify.decorateRequest('attorneyId', null);
  fastify.decorateRequest('attorneyRole', null);

  fastify.addHook('onRequest', async (request) => {
    request.log.info({ method: request.method, url: request.url }, 'Request started');
  });

  fastify.addHook('onResponse', async (request, reply) => {
    request.log.info(
      { method: request.method, url: request.url, statusCode: reply.statusCode },
      'Request completed'
    );
  });

  fastify.addHook('onClose', async () => {
    if (!redis) {
      return;
    }

    try {
      await redis.quit();
    } catch {
      redis.disconnect();
    }
  });

  fastify.setErrorHandler(async (error, request, reply) => {
    request.log.error({ err: error }, 'Request error');

    if (
      isProduction &&
      error.statusCode !== 400 &&
      error.statusCode !== 401 &&
      error.statusCode !== 403 &&
      error.statusCode !== 404
    ) {
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

  fastify.get('/health/live', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  fastify.get('/health/ready', async (_request, reply) => {
    const checks = {
      database: await checkDatabaseHealth(),
      redis: redis ? redis.status === 'ready' : true,
      clamav: await checkClamAVHealth(),
    };

    const healthy = Object.values(checks).every(Boolean);

    return reply.status(healthy ? 200 : 503).send({
      status: healthy ? 'ok' : 'degraded',
      checks,
      timestamp: new Date().toISOString(),
    });
  });

  fastify.addContentTypeParser('application/json', { parseAs: 'buffer', bodyLimit: 1048576 }, (req, body, done) => {
    if (req.url === '/billing/webhook') {
      done(null, body);
      return;
    }

    try {
      done(null, JSON.parse(body.toString()));
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  addVersionNegotiation(fastify);

  await registerRoutes(fastify);
  await fastify.register(scimRoutes);
  await registerSsoRoutes(fastify);
  registerWebAuthnRoutes(fastify, pool);
  await registerSamlRoutes(fastify);
  if (config.NODE_ENV !== 'test') {
    await initializeWebSocket(fastify.server, config.REDIS_URL, config.JWT_PUBLIC_KEY_PATH);
  }

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

  await initializeAuth();
  logger.info('Auth initialized');

  return fastify;
}

function registerSignalHandlers(fastify: FastifyInstance) {
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];

  for (const signal of signals) {
    process.once(signal, async () => {
      logger.info({ signal }, 'Received shutdown signal');

      await fastify.close();
      logger.info('Server closed');

      await closeOrchestrator();
      logger.info('Orchestrator closed');

      await closeDatabasePool();
      logger.info('Database pool closed');

      process.exit(0);
    });
  }
}

async function start() {
  try {
    const fastify = await build();

    const dbHealthy = await checkDatabaseHealth();
    if (!dbHealthy) {
      throw new Error('Database health check failed');
    }
    logger.info('Database connection verified');

    registerSignalHandlers(fastify);

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

const isMainModule = process.argv[1]
  ? fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
  : false;

if (isMainModule) {
  void start();
}
