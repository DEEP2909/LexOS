/**
 * EvidentIS Security Hardening
 * Helmet, CORS, input validation, and security headers
 */

import { FastifyInstance, type FastifyPluginCallback, type FastifyRequest, type FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import { config } from './config.js';
import { logger } from './logger.js';

// =============================================================================
// Security Headers (Helmet-like)
// =============================================================================

interface SecurityHeadersConfig {
  contentSecurityPolicy?: boolean | object;
  crossOriginEmbedderPolicy?: boolean;
  crossOriginOpenerPolicy?: boolean | { policy: string };
  crossOriginResourcePolicy?: boolean | { policy: string };
  dnsPrefetchControl?: boolean | { allow: boolean };
  frameguard?: boolean | { action: string };
  hidePoweredBy?: boolean;
  hsts?: boolean | { maxAge: number; includeSubDomains?: boolean; preload?: boolean };
  ieNoOpen?: boolean;
  noSniff?: boolean;
  originAgentCluster?: boolean;
  permittedCrossDomainPolicies?: boolean | { permittedPolicies: string };
  referrerPolicy?: boolean | { policy: string | string[] };
  xssFilter?: boolean;
}

const DEFAULT_SECURITY_CONFIG: SecurityHeadersConfig = {
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: false, // Can break legitimate embeds
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  crossOriginResourcePolicy: { policy: 'same-origin' },
  dnsPrefetchControl: { allow: false },
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  ieNoOpen: true,
  noSniff: true,
  originAgentCluster: true,
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true,
};

function applySecurityHeaders(reply: FastifyReply, cfg: SecurityHeadersConfig): void {
  // Content Security Policy
  if (cfg.contentSecurityPolicy) {
    const csp = typeof cfg.contentSecurityPolicy === 'object' 
      ? cfg.contentSecurityPolicy 
      : {
          'default-src': ["'self'"],
          'script-src': ["'self'"],
          'style-src': ["'self'", "'unsafe-inline'"],
          'img-src': ["'self'", 'data:', 'https:'],
          'font-src': ["'self'"],
          'connect-src': ["'self'"],
          'frame-ancestors': ["'none'"],
          'base-uri': ["'self'"],
          'form-action': ["'self'"],
        };
    
    const cspString = Object.entries(csp as Record<string, string[]>)
      .map(([key, values]) => `${key} ${values.join(' ')}`)
      .join('; ');
    
    reply.header('Content-Security-Policy', cspString);
  }

  // Cross-Origin-Opener-Policy
  if (cfg.crossOriginOpenerPolicy) {
    const policy = typeof cfg.crossOriginOpenerPolicy === 'object' 
      ? cfg.crossOriginOpenerPolicy.policy 
      : 'same-origin';
    reply.header('Cross-Origin-Opener-Policy', policy);
  }

  // Cross-Origin-Resource-Policy
  if (cfg.crossOriginResourcePolicy) {
    const policy = typeof cfg.crossOriginResourcePolicy === 'object'
      ? cfg.crossOriginResourcePolicy.policy
      : 'same-origin';
    reply.header('Cross-Origin-Resource-Policy', policy);
  }

  // DNS Prefetch Control
  if (cfg.dnsPrefetchControl !== undefined) {
    const allow = typeof cfg.dnsPrefetchControl === 'object' 
      ? cfg.dnsPrefetchControl.allow 
      : false;
    reply.header('X-DNS-Prefetch-Control', allow ? 'on' : 'off');
  }

  // X-Frame-Options
  if (cfg.frameguard) {
    const action = typeof cfg.frameguard === 'object' 
      ? cfg.frameguard.action.toUpperCase() 
      : 'DENY';
    reply.header('X-Frame-Options', action);
  }

  // Hide X-Powered-By
  if (cfg.hidePoweredBy) {
    reply.removeHeader('X-Powered-By');
  }

  // Strict-Transport-Security
  if (cfg.hsts) {
    const hstsConfig = typeof cfg.hsts === 'object' ? cfg.hsts : { maxAge: 31536000 };
    let hsts = `max-age=${hstsConfig.maxAge}`;
    if (hstsConfig.includeSubDomains) hsts += '; includeSubDomains';
    if (hstsConfig.preload) hsts += '; preload';
    reply.header('Strict-Transport-Security', hsts);
  }

  // X-Download-Options
  if (cfg.ieNoOpen) {
    reply.header('X-Download-Options', 'noopen');
  }

  // X-Content-Type-Options
  if (cfg.noSniff) {
    reply.header('X-Content-Type-Options', 'nosniff');
  }

  // Origin-Agent-Cluster
  if (cfg.originAgentCluster) {
    reply.header('Origin-Agent-Cluster', '?1');
  }

  // X-Permitted-Cross-Domain-Policies
  if (cfg.permittedCrossDomainPolicies) {
    const policy = typeof cfg.permittedCrossDomainPolicies === 'object'
      ? cfg.permittedCrossDomainPolicies.permittedPolicies
      : 'none';
    reply.header('X-Permitted-Cross-Domain-Policies', policy);
  }

  // Referrer-Policy
  if (cfg.referrerPolicy) {
    const policy = typeof cfg.referrerPolicy === 'object'
      ? (Array.isArray(cfg.referrerPolicy.policy) 
          ? cfg.referrerPolicy.policy.join(', ')
          : cfg.referrerPolicy.policy)
      : 'strict-origin-when-cross-origin';
    reply.header('Referrer-Policy', policy);
  }

  // X-XSS-Protection (legacy but still useful)
  if (cfg.xssFilter) {
    reply.header('X-XSS-Protection', '1; mode=block');
  }
}

// =============================================================================
// CORS Configuration
// =============================================================================

interface CorsConfig {
  origins: string[];
  methods: string[];
  allowedHeaders: string[];
  exposedHeaders: string[];
  credentials: boolean;
  maxAge: number;
}

function getCorsConfig(): CorsConfig {
  const isProduction = config.NODE_ENV === 'production';
  
  return {
    origins: isProduction
      ? [config.FRONTEND_URL].filter(Boolean) as string[]
      : ['http://localhost:3000', 'http://localhost:4000'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Request-ID',
      'X-Tenant-ID',
    ],
    exposedHeaders: [
      'X-Request-ID',
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset',
    ],
    credentials: true,
    maxAge: 86400, // 24 hours
  };
}

// =============================================================================
// Input Validation
// =============================================================================

// File upload validation
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/tiff',
]);

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB

export function validateFileUpload(
  mimeType: string,
  fileSize: number,
  filename: string
): { valid: boolean; error?: string } {
  // Check MIME type
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return { valid: false, error: `File type '${mimeType}' is not allowed` };
  }

  // Check file size
  if (fileSize > MAX_FILE_SIZE) {
    return { valid: false, error: `File size exceeds maximum allowed (${MAX_FILE_SIZE / 1024 / 1024} MB)` };
  }

  // Check filename for path traversal
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return { valid: false, error: 'Invalid filename' };
  }

  // Check for null bytes
  if (filename.includes('\x00')) {
    return { valid: false, error: 'Invalid filename' };
  }

  return { valid: true };
}

// SQL injection patterns
const SQL_INJECTION_PATTERNS = [
  /(\%27)|(\')|(\-\-)|(\%23)|(#)/i,
  /\b(union|select|insert|update|delete|drop|truncate|exec|execute)\b/i,
  /(\%00)/i,
  /\bor\b\s*\d+\s*=\s*\d+/i,
  /\band\b\s*\d+\s*=\s*\d+/i,
];

export function detectSqlInjection(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  
  return SQL_INJECTION_PATTERNS.some(pattern => pattern.test(input));
}

// XSS patterns
const XSS_PATTERNS = [
  /<script\b[^>]*>/i,
  /javascript:/i,
  /on\w+\s*=/i,
  /<iframe\b/i,
  /<object\b/i,
  /<embed\b/i,
];

export function detectXss(input: string): boolean {
  if (!input || typeof input !== 'string') return false;
  
  return XSS_PATTERNS.some(pattern => pattern.test(input));
}

// =============================================================================
// Security Plugin
// =============================================================================

const securityHardeningPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  const securityConfig = { ...DEFAULT_SECURITY_CONFIG, ...opts };
  const corsConfig = getCorsConfig();

  // Apply security headers to all responses
  fastify.addHook('onSend', async (request, reply) => {
    applySecurityHeaders(reply, securityConfig);
  });

  // Handle CORS preflight
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    const origin = request.headers.origin;

    if (origin && corsConfig.origins.includes(origin)) {
      // nosemgrep: javascript.express.security.cors-misconfiguration.cors-misconfiguration -- origin is allowlisted above
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Access-Control-Allow-Credentials', String(corsConfig.credentials));
      
      if (request.method === 'OPTIONS') {
        reply.header('Access-Control-Allow-Methods', corsConfig.methods.join(', '));
        reply.header('Access-Control-Allow-Headers', corsConfig.allowedHeaders.join(', '));
        reply.header('Access-Control-Max-Age', String(corsConfig.maxAge));
        return reply.status(204).send();
      }
      
      reply.header('Access-Control-Expose-Headers', corsConfig.exposedHeaders.join(', '));
    }
  });

  // Input validation for all requests
  fastify.addHook('preValidation', async (request: FastifyRequest, reply: FastifyReply) => {
    // Check query params for injection
    if (request.query && typeof request.query === 'object') {
      for (const [key, value] of Object.entries(request.query)) {
        if (typeof value === 'string') {
          if (detectSqlInjection(value)) {
            logger.warn({ key, ip: request.ip }, 'SQL injection attempt detected');
            return reply.status(400).send({
              success: false,
              error: { code: 'INVALID_INPUT', message: 'Invalid input detected' },
            });
          }
          if (detectXss(value)) {
            logger.warn({ key, ip: request.ip }, 'XSS attempt detected');
            return reply.status(400).send({
              success: false,
              error: { code: 'INVALID_INPUT', message: 'Invalid input detected' },
            });
          }
        }
      }
    }
  });

  // Request ID for tracing
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = request.headers['x-request-id'] || 
      `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    reply.header('X-Request-ID', requestId);
  });

  done();
};

export const registerSecurityHardening = fp(securityHardeningPlugin, {
  name: 'security-hardening',
  dependencies: [],
});

// =============================================================================
// Sanitization Utilities
// =============================================================================

/**
 * Sanitize string input by removing potentially dangerous characters
 */
export function sanitizeString(input: string, maxLength = 10000): string {
  if (!input || typeof input !== 'string') return '';
  
  return input
    .slice(0, maxLength)
    .replace(/[<>]/g, '') // Remove angle brackets
    .replaceAll('\0', '') // Remove null bytes
    .trim();
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/\.{2,}/g, '.')
    .slice(0, 255);
}

/**
 * Validate UUID format
 */
export function isValidUuid(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Validate email format
 */
export function isValidEmail(value: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(value) && value.length <= 254;
}
