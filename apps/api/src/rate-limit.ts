/**
 * EvidentIS Rate Limiting & Abuse Protection
 * Redis-based rate limiter with per-user and per-tenant quotas
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

// Rate limit configurations by endpoint category
export interface RateLimitConfig {
  windowMs: number;      // Time window in milliseconds
  maxRequests: number;   // Max requests per window
  keyPrefix: string;     // Redis key prefix
  message?: string;      // Custom error message
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  auth: {
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 10,
    keyPrefix: 'rl:auth',
    message: 'Too many authentication attempts. Please try again later.',
  },
  upload: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 20,
    keyPrefix: 'rl:upload',
    message: 'Upload limit reached. Please try again later.',
  },
  research: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 100,
    keyPrefix: 'rl:research',
    message: 'Research query limit reached. Please try again later.',
  },
  ai: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 200,
    keyPrefix: 'rl:ai',
    message: 'AI request limit reached. Please try again later.',
  },
  api: {
    windowMs: 60 * 60 * 1000,  // 1 hour
    maxRequests: 1000,
    keyPrefix: 'rl:api',
    message: 'API rate limit exceeded. Please try again later.',
  },
  webhook: {
    windowMs: 60 * 1000,       // 1 minute
    maxRequests: 100,
    keyPrefix: 'rl:webhook',
    message: 'Webhook rate limit exceeded.',
  },
};

let redis: Redis | null = null;

function getRedis(): Redis | null {
  if (!redis && config.REDIS_URL) {
    try {
      redis = new Redis(config.REDIS_URL, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });
      
      redis.on('error', (err) => {
        logger.error({ err }, 'Redis rate limiter error');
      });
    } catch (err) {
      logger.warn({ err }, 'Failed to initialize Redis for rate limiting');
    }
  }
  return redis;
}

/**
 * Check rate limit for a given key
 */
async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetAt: number }> {
  const redisClient = getRedis();
  
  if (!redisClient) {
    // If Redis is not available, allow request but log warning
    logger.warn('Rate limiter: Redis not available, allowing request');
    return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
  }

  const now = Date.now();
  const windowKey = `${config.keyPrefix}:${key}:${Math.floor(now / config.windowMs)}`;
  
  try {
    const multi = redisClient.multi();
    multi.incr(windowKey);
    multi.pexpire(windowKey, config.windowMs);
    const results = await multi.exec();
    
    const count = results?.[0]?.[1] as number || 0;
    const remaining = Math.max(0, config.maxRequests - count);
    const resetAt = Math.ceil(now / config.windowMs) * config.windowMs;
    
    return {
      allowed: count <= config.maxRequests,
      remaining,
      resetAt,
    };
  } catch (err) {
    logger.error({ err }, 'Rate limit check failed');
    // On error, allow request
    return { allowed: true, remaining: config.maxRequests, resetAt: Date.now() + config.windowMs };
  }
}

/**
 * Create a rate limiting preHandler for Fastify
 */
export function createRateLimiter(limitType: keyof typeof RATE_LIMITS) {
  const limitConfig = RATE_LIMITS[limitType];
  
  return async function rateLimitHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ) {
    // Build rate limit key from user/tenant info
    const userId = (request as any).userId;
    const tenantId = (request as any).tenantId;
    const ip = request.ip;
    
    // Use user ID if authenticated, otherwise use IP
    const identifier = userId ? `user:${userId}` : `ip:${ip}`;
    const key = tenantId ? `${tenantId}:${identifier}` : identifier;
    
    const result = await checkRateLimit(key, limitConfig);
    
    // Set rate limit headers
    reply.header('X-RateLimit-Limit', limitConfig.maxRequests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));
    
    if (!result.allowed) {
      reply.header('Retry-After', Math.ceil((result.resetAt - Date.now()) / 1000));
      reply.status(429).send({
        success: false,
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: limitConfig.message || 'Too many requests',
          retryAfter: Math.ceil((result.resetAt - Date.now()) / 1000),
        },
      });
      return reply;
    }
  };
}

/**
 * Tenant usage tracking for billing/quotas
 */
export interface UsageRecord {
  documents: number;
  storage: number;      // bytes
  aiQueries: number;
  apiCalls: number;
}

/**
 * Track usage for a tenant
 */
export async function trackUsage(
  tenantId: string,
  type: keyof UsageRecord,
  amount = 1
): Promise<void> {
  const redisClient = getRedis();
  if (!redisClient) return;

  const month = new Date().toISOString().slice(0, 7); // YYYY-MM
  const key = `usage:${tenantId}:${month}`;
  
  try {
    await redisClient.hincrby(key, type, amount);
    // Set expiry to 90 days for usage data retention
    await redisClient.expire(key, 90 * 24 * 60 * 60);
  } catch (err) {
    logger.error({ err }, 'Failed to track usage');
  }
}

/**
 * Get usage for a tenant
 */
export async function getUsage(tenantId: string, month?: string): Promise<UsageRecord> {
  const redisClient = getRedis();
  const targetMonth = month || new Date().toISOString().slice(0, 7);
  
  const defaults: UsageRecord = {
    documents: 0,
    storage: 0,
    aiQueries: 0,
    apiCalls: 0,
  };
  
  if (!redisClient) return defaults;

  const key = `usage:${tenantId}:${targetMonth}`;
  
  try {
    const data = await redisClient.hgetall(key);
    return {
      documents: Number.parseInt(data.documents || '0', 10),
      storage: Number.parseInt(data.storage || '0', 10),
      aiQueries: Number.parseInt(data.aiQueries || '0', 10),
      apiCalls: Number.parseInt(data.apiCalls || '0', 10),
    };
  } catch (err) {
    logger.error({ err }, 'Failed to get usage');
    return defaults;
  }
}

/**
 * Check if tenant is within quota limits
 */
export async function checkQuota(
  tenantId: string,
  quotaType: keyof UsageRecord,
  limit: number
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const usage = await getUsage(tenantId);
  const current = usage[quotaType];
  
  return {
    allowed: current < limit,
    current,
    limit,
  };
}

/**
 * Register rate limiting plugin with Fastify
 */
export async function registerRateLimiting(fastify: FastifyInstance): Promise<void> {
  // Add global rate limiting for API routes
  fastify.addHook('onRequest', async (request, reply) => {
    // Skip rate limiting for health checks
    if (request.url === '/health' || request.url === '/ready') {
      return;
    }
    
    // Apply general API rate limit
    const handler = createRateLimiter('api');
    await handler(request, reply);
  });
  
  logger.info('Rate limiting middleware registered');
}

/**
 * Cleanup Redis connection on shutdown
 */
export async function closeRateLimiter(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
