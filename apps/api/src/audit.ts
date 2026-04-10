/**
 * EvidentIS Audit Logging
 * Comprehensive audit trail for compliance and security
 */

import type { FastifyRequest } from 'fastify';
import { pool } from './database.js';
import { logger } from './logger.js';

export type AuditAction = 
  // Authentication
  | 'auth.login'
  | 'auth.logout'
  | 'auth.login_failed'
  | 'auth.mfa_enabled'
  | 'auth.mfa_disabled'
  | 'auth.password_changed'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'auth.session_revoked'
  // User Management
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'user.role_changed'
  | 'user.invited'
  | 'user.invitation_accepted'
  // Documents
  | 'document.uploaded'
  | 'document.viewed'
  | 'document.downloaded'
  | 'document.deleted'
  | 'document.processed'
  | 'document.shared'
  | 'document.exported'
  // Matters
  | 'matter.created'
  | 'matter.updated'
  | 'matter.deleted'
  | 'matter.archived'
  | 'matter.shared'
  // AI Operations
  | 'ai.research_query'
  | 'ai.clause_extraction'
  | 'ai.risk_assessment'
  | 'ai.redline_suggestion'
  // Admin
  | 'admin.settings_changed'
  | 'admin.billing_updated'
  | 'admin.api_key_created'
  | 'admin.api_key_revoked'
  | 'admin.sso_configured'
  | 'admin.scim_configured'
  // Data Access
  | 'data.export'
  | 'data.bulk_download'
  | 'data.search'
  // Security
  | 'security.permission_denied'
  | 'security.suspicious_activity'
  | 'security.rate_limit_exceeded';

export type AuditSeverity = 'info' | 'warning' | 'critical';

export interface AuditContext {
  request?: FastifyRequest;
  userId?: string;
  tenantId?: string;
  matterId?: string;
  documentId?: string;
  targetUserId?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, unknown>;
}

interface AuditEntry {
  tenant_id: string;
  user_id: string | null;
  action: AuditAction;
  severity: AuditSeverity;
  resource_type: string | null;
  resource_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown>;
  created_at: Date;
}

/**
 * Determine severity based on action type
 */
function getSeverity(action: AuditAction): AuditSeverity {
  // Critical actions
  if (action.startsWith('security.') || 
      action === 'auth.login_failed' ||
      action === 'user.deleted' ||
      action === 'admin.settings_changed' ||
      action === 'data.bulk_download') {
    return 'critical';
  }
  
  // Warning actions
  if (action === 'auth.mfa_disabled' ||
      action === 'user.role_changed' ||
      action === 'document.deleted' ||
      action === 'matter.deleted' ||
      action === 'admin.api_key_revoked') {
    return 'warning';
  }
  
  return 'info';
}

/**
 * Extract resource type and ID from action
 */
function getResourceInfo(action: AuditAction, context: AuditContext): { type: string | null; id: string | null } {
  if (action.startsWith('document.') && context.documentId) {
    return { type: 'document', id: context.documentId };
  }
  if (action.startsWith('matter.') && context.matterId) {
    return { type: 'matter', id: context.matterId };
  }
  if (action.startsWith('user.') && context.targetUserId) {
    return { type: 'user', id: context.targetUserId };
  }
  return { type: null, id: null };
}

/**
 * Log an audit event
 */
export async function audit(
  action: AuditAction,
  context: AuditContext
): Promise<void> {
  const tenantId = context.tenantId || (context.request as any)?.tenantId;
  const userId = context.userId || (context.request as any)?.userId;
  
  if (!tenantId) {
    logger.warn({ action }, 'Audit: Missing tenant ID for action');
    return;
  }
  
  const severity = getSeverity(action);
  const { type: resourceType, id: resourceId } = getResourceInfo(action, context);
  
  const ipAddress = context.ipAddress || 
    context.request?.ip || 
    context.request?.headers['x-forwarded-for']?.toString().split(',')[0];
  
  const userAgent = context.userAgent || 
    context.request?.headers['user-agent'];

  const entry: AuditEntry = {
    tenant_id: tenantId,
    user_id: userId || null,
    action,
    severity,
    resource_type: resourceType,
    resource_id: resourceId,
    ip_address: ipAddress || null,
    user_agent: userAgent || null,
    metadata: {
      ...context.metadata,
      timestamp: new Date().toISOString(),
    },
    created_at: new Date(),
  };
  
  try {
    await pool.query(
      `INSERT INTO audit_events 
       (tenant_id, user_id, action, severity, resource_type, resource_id, 
        ip_address, user_agent, metadata, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        entry.tenant_id,
        entry.user_id,
        entry.action,
        entry.severity,
        entry.resource_type,
        entry.resource_id,
        entry.ip_address,
        entry.user_agent,
        JSON.stringify(entry.metadata),
        entry.created_at,
      ]
    );
    
    // Log critical events to application logger as well
    if (severity === 'critical') {
      logger.warn({ action, tenantId, userId, resourceType, resourceId }, 'AUDIT_CRITICAL');
    }
  } catch (err) {
    logger.error({ err }, 'Failed to write audit log');
    // Don't throw - audit failures shouldn't break the application
  }
}

/**
 * Query audit logs for a tenant
 */
export async function queryAuditLogs(
  tenantId: string,
  options: {
    userId?: string;
    action?: AuditAction;
    severity?: AuditSeverity;
    resourceType?: string;
    resourceId?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ entries: AuditEntry[]; total: number }> {
  const conditions: string[] = ['tenant_id = $1'];
  const params: unknown[] = [tenantId];
  let paramIndex = 2;
  
  if (options.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    params.push(options.userId);
  }
  
  if (options.action) {
    conditions.push(`action = $${paramIndex++}`);
    params.push(options.action);
  }
  
  if (options.severity) {
    conditions.push(`severity = $${paramIndex++}`);
    params.push(options.severity);
  }
  
  if (options.resourceType) {
    conditions.push(`resource_type = $${paramIndex++}`);
    params.push(options.resourceType);
  }
  
  if (options.resourceId) {
    conditions.push(`resource_id = $${paramIndex++}`);
    params.push(options.resourceId);
  }
  
  if (options.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(options.startDate);
  }
  
  if (options.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(options.endDate);
  }
  
  const whereClause = conditions.join(' AND ');
  const limit = options.limit || 100;
  const offset = options.offset || 0;
  
  try {
    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM audit_events WHERE ${whereClause}`,
      params
    );
    const total = Number.parseInt(countResult.rows[0].count, 10);
    
    // Get entries
    const result = await pool.query(
      `SELECT tenant_id, user_id, action, severity, resource_type, resource_id,
              ip_address, user_agent, metadata, created_at
       FROM audit_events
       WHERE ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      [...params, limit, offset]
    );
    
    return {
      entries: result.rows,
      total,
    };
  } catch (err) {
    logger.error({ err }, 'Failed to query audit logs');
    throw err;
  }
}

/**
 * Create audit log preHandler for automatic request logging
 */
export function createAuditMiddleware(action: AuditAction, getContext?: (req: FastifyRequest) => Partial<AuditContext>) {
  return async function auditMiddleware(request: FastifyRequest) {
    const context: AuditContext = {
      request,
      ...(getContext ? getContext(request) : {}),
    };
    
    // Log after request completes
    request.server.addHook('onResponse', async () => {
      await audit(action, context);
    });
  };
}

/**
 * Retention policy - delete old audit logs
 */
export async function cleanupOldAuditLogs(retentionDays = 365): Promise<number> {
  try {
    const result = await pool.query(
      `DELETE FROM audit_events 
       WHERE created_at < NOW() - INTERVAL '1 day' * $1
       RETURNING id`,
      [retentionDays]
    );
    
    const deleted = result.rowCount || 0;
    logger.info(`Cleaned up ${deleted} old audit log entries`);
    return deleted;
  } catch (err) {
    logger.error({ err }, 'Failed to cleanup audit logs');
    throw err;
  }
}
