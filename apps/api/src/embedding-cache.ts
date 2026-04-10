/**
 * EvidentIS Embedding Cache
 * Redis-based caching for embeddings and search results
 */

import { Redis } from 'ioredis';
import crypto from 'crypto';
import { config } from './config.js';
import { logger } from './logger.js';

// ============================================================================
// Redis Client
// ============================================================================

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    redis.on('error', (err: Error) => {
      logger.warn({ error: err.message }, 'Redis cache error (non-fatal)');
    });
  }
  return redis;
}

// ============================================================================
// Cache Key Generation
// ============================================================================

const CACHE_VERSION = 'v1';
const EMBEDDING_PREFIX = `evidentis:${CACHE_VERSION}:embedding`;
const SEARCH_PREFIX = `evidentis:${CACHE_VERSION}:search`;
const DOCUMENT_PREFIX = `evidentis:${CACHE_VERSION}:doc`;

function hashText(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

// ============================================================================
// Embedding Cache
// ============================================================================

interface CachedEmbedding {
  vector: number[];
  model: string;
  cachedAt: string;
}

const EMBEDDING_TTL_SECONDS = 86400 * 30; // 30 days (embeddings rarely change)

/**
 * Get cached embedding for text
 */
export async function getCachedEmbedding(
  text: string,
  model: string
): Promise<number[] | null> {
  try {
    const client = getRedis();
    const key = `${EMBEDDING_PREFIX}:${model}:${hashText(text)}`;
    
    const cached = await client.get(key);
    if (!cached) return null;
    
    const parsed: CachedEmbedding = JSON.parse(cached);
    logger.debug({ key, model }, 'Embedding cache hit');
    return parsed.vector;
  } catch (error) {
    logger.warn({ error }, 'Embedding cache read error');
    return null;
  }
}

/**
 * Cache embedding for text
 */
export async function cacheEmbedding(
  text: string,
  model: string,
  vector: number[]
): Promise<void> {
  try {
    const client = getRedis();
    const key = `${EMBEDDING_PREFIX}:${model}:${hashText(text)}`;
    
    const data: CachedEmbedding = {
      vector,
      model,
      cachedAt: new Date().toISOString(),
    };
    
    await client.setex(key, EMBEDDING_TTL_SECONDS, JSON.stringify(data));
    logger.debug({ key, model, dimensions: vector.length }, 'Embedding cached');
  } catch (error) {
    logger.warn({ error }, 'Embedding cache write error');
  }
}

// ============================================================================
// Search Results Cache
// ============================================================================

interface CachedSearchResult {
  results: Array<{
    documentId: string;
    chunkId: string;
    score: number;
    text: string;
    metadata?: Record<string, any>;
  }>;
  query: string;
  filters: Record<string, any>;
  cachedAt: string;
}

const SEARCH_TTL_SECONDS = 300; // 5 minutes (search results change more often)

/**
 * Get cached search results
 */
export async function getCachedSearch(
  tenantId: string,
  query: string,
  filters: Record<string, any> = {}
): Promise<CachedSearchResult['results'] | null> {
  try {
    const client = getRedis();
    const filterHash = hashText(JSON.stringify(filters));
    const key = `${SEARCH_PREFIX}:${tenantId}:${hashText(query)}:${filterHash}`;
    
    const cached = await client.get(key);
    if (!cached) return null;
    
    const parsed: CachedSearchResult = JSON.parse(cached);
    logger.debug({ key, query: query.slice(0, 50) }, 'Search cache hit');
    return parsed.results;
  } catch (error) {
    logger.warn({ error }, 'Search cache read error');
    return null;
  }
}

/**
 * Cache search results
 */
export async function cacheSearchResults(
  tenantId: string,
  query: string,
  filters: Record<string, any>,
  results: CachedSearchResult['results']
): Promise<void> {
  try {
    const client = getRedis();
    const filterHash = hashText(JSON.stringify(filters));
    const key = `${SEARCH_PREFIX}:${tenantId}:${hashText(query)}:${filterHash}`;
    
    const data: CachedSearchResult = {
      results,
      query,
      filters,
      cachedAt: new Date().toISOString(),
    };
    
    await client.setex(key, SEARCH_TTL_SECONDS, JSON.stringify(data));
    logger.debug({ key, resultCount: results.length }, 'Search results cached');
  } catch (error) {
    logger.warn({ error }, 'Search cache write error');
  }
}

// ============================================================================
// Document Cache (for frequently accessed docs)
// ============================================================================

const DOCUMENT_TTL_SECONDS = 3600; // 1 hour

/**
 * Get cached document metadata
 */
export async function getCachedDocument<T>(
  tenantId: string,
  documentId: string
): Promise<T | null> {
  try {
    const client = getRedis();
    const key = `${DOCUMENT_PREFIX}:${tenantId}:${documentId}`;
    
    const cached = await client.get(key);
    if (!cached) return null;
    
    return JSON.parse(cached);
  } catch (error) {
    logger.warn({ error }, 'Document cache read error');
    return null;
  }
}

/**
 * Cache document metadata
 */
export async function cacheDocument(
  tenantId: string,
  documentId: string,
  data: any
): Promise<void> {
  try {
    const client = getRedis();
    const key = `${DOCUMENT_PREFIX}:${tenantId}:${documentId}`;
    
    await client.setex(key, DOCUMENT_TTL_SECONDS, JSON.stringify(data));
  } catch (error) {
    logger.warn({ error }, 'Document cache write error');
  }
}

/**
 * Invalidate document cache (call on update/delete)
 */
export async function invalidateDocumentCache(
  tenantId: string,
  documentId: string
): Promise<void> {
  try {
    const client = getRedis();
    const key = `${DOCUMENT_PREFIX}:${tenantId}:${documentId}`;
    await client.del(key);
  } catch (error) {
    logger.warn({ error }, 'Document cache invalidation error');
  }
}

/**
 * Invalidate all search caches for tenant (call when documents change)
 */
export async function invalidateTenantSearchCache(tenantId: string): Promise<void> {
  try {
    const client = getRedis();
    const pattern = `${SEARCH_PREFIX}:${tenantId}:*`;
    
    const keys = await client.keys(pattern);
    if (keys.length > 0) {
      await client.del(...keys);
      logger.debug({ tenantId, keysDeleted: keys.length }, 'Search cache invalidated');
    }
  } catch (error) {
    logger.warn({ error }, 'Search cache invalidation error');
  }
}

// ============================================================================
// Rate Limit Helper (per-tenant AI quota)
// ============================================================================

const AI_QUOTA_PREFIX = `evidentis:${CACHE_VERSION}:aiquota`;

interface AIQuotaUsage {
  tokensUsed: number;
  requestCount: number;
  windowStart: string;
}

/**
 * Get current AI usage for tenant
 */
export async function getAIQuotaUsage(tenantId: string): Promise<AIQuotaUsage | null> {
  try {
    const client = getRedis();
    const key = `${AI_QUOTA_PREFIX}:${tenantId}`;
    
    const cached = await client.get(key);
    if (!cached) return null;
    
    return JSON.parse(cached);
  } catch (error) {
    logger.warn({ error }, 'AI quota read error');
    return null;
  }
}

/**
 * Increment AI usage for tenant
 */
export async function incrementAIQuota(
  tenantId: string,
  tokensUsed: number
): Promise<AIQuotaUsage> {
  try {
    const client = getRedis();
    const key = `${AI_QUOTA_PREFIX}:${tenantId}`;
    
    const existing = await getAIQuotaUsage(tenantId);
    const now = new Date();
    
    // Reset window at start of month
    const windowStart = existing?.windowStart
      ? new Date(existing.windowStart)
      : now;
    
    const isNewMonth = 
      now.getUTCMonth() !== windowStart.getUTCMonth() ||
      now.getUTCFullYear() !== windowStart.getUTCFullYear();
    
    const usage: AIQuotaUsage = isNewMonth
      ? {
          tokensUsed,
          requestCount: 1,
          windowStart: now.toISOString(),
        }
      : {
          tokensUsed: (existing?.tokensUsed || 0) + tokensUsed,
          requestCount: (existing?.requestCount || 0) + 1,
          windowStart: existing?.windowStart || now.toISOString(),
        };
    
    // Set TTL to end of month + 1 day buffer
    const daysInMonth = new Date(now.getUTCFullYear(), now.getUTCMonth() + 1, 0).getUTCDate();
    const daysRemaining = daysInMonth - now.getUTCDate() + 1;
    const ttl = daysRemaining * 86400;
    
    await client.setex(key, ttl, JSON.stringify(usage));
    return usage;
  } catch (error) {
    logger.warn({ error }, 'AI quota increment error');
    // Return empty usage on error to avoid blocking requests
    return { tokensUsed, requestCount: 1, windowStart: new Date().toISOString() };
  }
}

// ============================================================================
// Cleanup
// ============================================================================

export async function closeCache(): Promise<void> {
  if (redis) {
    await redis.quit();
    redis = null;
  }
}
