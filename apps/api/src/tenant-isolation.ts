/**
 * EvidentIS Tenant Isolation Middleware
 * Enforces strict tenant separation at the middleware level
 * CRITICAL: Every database query MUST be filtered by tenant_id
 */

import { FastifyInstance, type FastifyRequest, type FastifyReply, type FastifyPluginCallback } from 'fastify';
import fp from 'fastify-plugin';
import { logger } from './logger.js';
import { pool } from './database.js';

// Extend FastifyRequest to include tenant context
declare module 'fastify' {
  interface FastifyRequest {
    tenantId: string;
    tenantContext: TenantContext;
  }
}

export interface TenantContext {
  tenantId: string;
  tenantName: string;
  tier: 'starter' | 'growth' | 'professional' | 'enterprise';
  features: string[];
  limits: TenantLimits;
}

export interface TenantLimits {
  maxDocuments: number;
  maxMatters: number;
  maxUsers: number;
  maxStorageBytes: number;
  aiQueriesPerMonth: number;
  documentsPerMonth: number;
}

// Default limits by tier
const TIER_LIMITS: Record<string, TenantLimits> = {
  starter: {
    maxDocuments: 1000,
    maxMatters: 50,
    maxUsers: 5,
    maxStorageBytes: 10 * 1024 * 1024 * 1024, // 10 GB
    aiQueriesPerMonth: 500,
    documentsPerMonth: 100,
  },
  growth: {
    maxDocuments: 10000,
    maxMatters: 250,
    maxUsers: 25,
    maxStorageBytes: 100 * 1024 * 1024 * 1024, // 100 GB
    aiQueriesPerMonth: 2500,
    documentsPerMonth: 500,
  },
  professional: {
    maxDocuments: 100000,
    maxMatters: 1000,
    maxUsers: 100,
    maxStorageBytes: 1024 * 1024 * 1024 * 1024, // 1 TB
    aiQueriesPerMonth: 10000,
    documentsPerMonth: 2000,
  },
  enterprise: {
    maxDocuments: -1, // unlimited
    maxMatters: -1,
    maxUsers: -1,
    maxStorageBytes: -1,
    aiQueriesPerMonth: -1,
    documentsPerMonth: -1,
  },
};

/**
 * Load tenant context from database
 */
async function loadTenantContext(tenantId: string): Promise<TenantContext | null> {
  try {
    const result = await pool.query(
      `SELECT id, name, subscription_tier, features, created_at 
       FROM tenants 
       WHERE id = $1 AND deleted_at IS NULL`,
      [tenantId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const tenant = result.rows[0];
    const tier = tenant.subscription_tier || 'starter';

    return {
      tenantId: tenant.id,
      tenantName: tenant.name,
      tier,
      features: tenant.features || [],
      limits: TIER_LIMITS[tier] || TIER_LIMITS.starter,
    };
  } catch (error) {
    logger.error({ error, tenantId }, 'Failed to load tenant context');
    return null;
  }
}

/**
 * Validate that a resource belongs to the requesting tenant
 */
export async function validateTenantOwnership(
  tenantId: string,
  table: string,
  resourceId: string
): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT 1 FROM ${table} WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [resourceId, tenantId]
    );
    return result.rows.length > 0;
  } catch (error) {
    logger.error({ error, tenantId, table, resourceId }, 'Tenant ownership check failed');
    return false;
  }
}

/**
 * Create a scoped query helper that automatically adds tenant_id filter
 */
export function createTenantScopedQuery(tenantId: string) {
  return {
    /**
     * Execute a query with automatic tenant_id filtering
     */
    async query<T = any>(
      sql: string,
      params: any[] = []
    ): Promise<T[]> {
      // Verify the query includes tenant_id filter
      if (!sql.toLowerCase().includes('tenant_id')) {
        throw new Error('Query must include tenant_id filter for tenant isolation');
      }

      const result = await pool.query(sql, params);
      return result.rows as T[];
    },

    /**
     * Find by ID with tenant scope
     */
    async findById<T = any>(table: string, id: string): Promise<T | null> {
      const result = await pool.query(
        `SELECT * FROM ${table} WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL`,
        [id, tenantId]
      );
      return result.rows[0] || null;
    },

    /**
     * Find many with tenant scope
     */
    async findMany<T = any>(
      table: string,
      conditions: Record<string, any> = {},
      options: { limit?: number; offset?: number; orderBy?: string } = {}
    ): Promise<T[]> {
      const whereConditions = ['tenant_id = $1', 'deleted_at IS NULL'];
      const params: any[] = [tenantId];
      let paramIndex = 2;

      for (const [key, value] of Object.entries(conditions)) {
        whereConditions.push(`${key} = $${paramIndex}`);
        params.push(value);
        paramIndex++;
      }

      let sql = `SELECT * FROM ${table} WHERE ${whereConditions.join(' AND ')}`;
      
      if (options.orderBy) {
        sql += ` ORDER BY ${options.orderBy}`;
      }
      if (options.limit) {
        sql += ` LIMIT ${options.limit}`;
      }
      if (options.offset) {
        sql += ` OFFSET ${options.offset}`;
      }

      const result = await pool.query(sql, params);
      return result.rows as T[];
    },

    /**
     * Insert with tenant scope
     */
    async insert<T = any>(table: string, data: Record<string, any>): Promise<T> {
      const dataWithTenant = { ...data, tenant_id: tenantId };
      const columns = Object.keys(dataWithTenant);
      const values = Object.values(dataWithTenant);
      const placeholders = columns.map((_, i) => `$${i + 1}`);

      const result = await pool.query(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
        values
      );
      return result.rows[0] as T;
    },

    /**
     * Update with tenant scope
     */
    async update<T = any>(
      table: string,
      id: string,
      data: Record<string, any>
    ): Promise<T | null> {
      const updates = Object.entries(data)
        .map(([key], i) => `${key} = $${i + 3}`)
        .join(', ');
      const values = [id, tenantId, ...Object.values(data)];

      const result = await pool.query(
        `UPDATE ${table} SET ${updates}, updated_at = NOW() WHERE id = $1 AND tenant_id = $2 RETURNING *`,
        values
      );
      return result.rows[0] || null;
    },

    /**
     * Soft delete with tenant scope
     */
    async softDelete(table: string, id: string): Promise<boolean> {
      const result = await pool.query(
        `UPDATE ${table} SET deleted_at = NOW() WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId]
      );
      return (result.rowCount || 0) > 0;
    },
  };
}

/**
 * Fastify plugin for tenant isolation
 */
const tenantIsolationPlugin: FastifyPluginCallback = (fastify, opts, done) => {
  // Add hook to inject tenant context
  fastify.addHook('preHandler', async (request: FastifyRequest, reply: FastifyReply) => {
    // Skip for public routes
    const publicPaths = ['/health', '/ready', '/metrics', '/auth/login', '/auth/register'];
    if (publicPaths.some(p => request.url.startsWith(p))) {
      return;
    }

    const tenantId = request.tenantId;
    
    if (!tenantId) {
      // tenantId should be set by auth middleware
      return;
    }

    // Load full tenant context
    const context = await loadTenantContext(tenantId);
    
    if (!context) {
      logger.warn({ tenantId }, 'Tenant not found or deleted');
      return reply.status(403).send({
        success: false,
        error: { code: 'TENANT_NOT_FOUND', message: 'Tenant account not found' },
      });
    }

    request.tenantContext = context;
  });

  // Add decorator for tenant-scoped queries
  fastify.decorateRequest('getTenantQuery', function (this: FastifyRequest) {
    return createTenantScopedQuery(this.tenantId);
  });

  done();
};

export const registerTenantIsolation = fp(tenantIsolationPlugin, {
  name: 'tenant-isolation',
  dependencies: [],
});

/**
 * Middleware to check tenant resource limits
 */
export async function checkTenantLimits(
  tenantId: string,
  resourceType: 'documents' | 'matters' | 'users' | 'storage'
): Promise<{ allowed: boolean; current: number; limit: number }> {
  const context = await loadTenantContext(tenantId);
  
  if (!context) {
    return { allowed: false, current: 0, limit: 0 };
  }

  let current = 0;
  let limit = 0;

  switch (resourceType) {
    case 'documents': {
      limit = context.limits.maxDocuments;
      const docResult = await pool.query(
        'SELECT COUNT(*) FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL',
        [tenantId]
      );
      current = Number.parseInt(docResult.rows[0].count, 10);
      break;
    }

    case 'matters': {
      limit = context.limits.maxMatters;
      const matterResult = await pool.query(
        'SELECT COUNT(*) FROM matters WHERE tenant_id = $1 AND deleted_at IS NULL',
        [tenantId]
      );
      current = Number.parseInt(matterResult.rows[0].count, 10);
      break;
    }

    case 'users': {
      limit = context.limits.maxUsers;
      const userResult = await pool.query(
        'SELECT COUNT(*) FROM attorneys WHERE tenant_id = $1 AND deleted_at IS NULL',
        [tenantId]
      );
      current = Number.parseInt(userResult.rows[0].count, 10);
      break;
    }

    case 'storage': {
      limit = context.limits.maxStorageBytes;
      const storageResult = await pool.query(
        'SELECT COALESCE(SUM(file_size_bytes), 0) FROM documents WHERE tenant_id = $1 AND deleted_at IS NULL',
        [tenantId]
      );
      current = Number.parseInt(storageResult.rows[0].coalesce, 10);
      break;
    }
  }

  // -1 means unlimited
  const allowed = limit === -1 || current < limit;

  return { allowed, current, limit };
}
