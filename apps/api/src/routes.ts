/**
 * LexOS API Routes
 * All REST API endpoints
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  verifyAccessToken,
  generateAccessToken,
  generateRefreshToken,
  type AccessTokenPayload,
} from './auth.js';
import {
  hashPassword,
  verifyPassword,
  validatePasswordPolicy,
  generateSecureToken,
  hashToken,
  generateApiKey,
  generateRecoveryCodes,
  hashRecoveryCodes,
} from './security.js';
import { query, queryOne, withTransaction } from './database.js';
import { config, rateLimits } from './config.js';
import { sendPasswordResetEmail, sendInvitationEmail } from './email.js';
import { logger } from './logger.js';
import { getCachedEmbedding, cacheEmbedding } from './embedding-cache.js';
import { startDocumentPipeline, getPipelineStatus } from './orchestrator.js';
import { buildAIContext, formatContextForPrompt } from './ai-context.js';
import {
  enforceDocumentQuota,
  enforceResearchQuota,
  enforceAttorneyLimit,
  enforceActiveSubscription,
  incrementDocumentUsage,
  incrementResearchUsage,
} from './billing-enforcement.js';

// ============================================================
// REQUEST TYPES
// ============================================================

interface AuthenticatedRequest extends FastifyRequest {
  tenantId: string;
  attorneyId: string;
  attorneyRole: string;
  tokenPayload: AccessTokenPayload;
}

interface ResearchChunkRow {
  id: string;
  document_id: string;
  text_content: string;
  chunk_index: number;
  document_title: string;
  relevance_score: number;
}

// ============================================================
// AUTH MIDDLEWARE
// ============================================================

async function authenticateRequest(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
  }

  try {
    const token = authHeader.slice(7);
    const payload = await verifyAccessToken(token);

    (request as AuthenticatedRequest).tenantId = payload.tenantId;
    (request as AuthenticatedRequest).attorneyId = payload.sub;
    (request as AuthenticatedRequest).attorneyRole = payload.role;
    (request as AuthenticatedRequest).tokenPayload = payload;
  } catch (error) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }
}

function requireRoles(...roles: string[]) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const authReq = request as AuthenticatedRequest;
    if (!roles.includes(authReq.attorneyRole)) {
      return reply.status(403).send({
        success: false,
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }
  };
}

// ============================================================
// SCHEMA DEFINITIONS
// ============================================================

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  mfaCode: z.string().length(6).optional(),
  tenantSlug: z.string().min(1).optional(),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  displayName: z.string().min(1),
  token: z.string().min(1),
});

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z
  .object({
    token: z.string().min(1),
    password: z.string().min(12).optional(),
    newPassword: z.string().min(12).optional(),
  })
  .refine((data) => Boolean(data.password || data.newPassword), {
    message: 'Password is required',
  });

const matterCreateSchema = z.object({
  matterCode: z.string().min(1),
  matterName: z.string().min(1),
  matterType: z.enum(['ma_transaction', 'commercial_contract', 'real_estate', 'litigation', 'ip', 'employment', 'regulatory']),
  clientName: z.string().min(1),
  counterpartyName: z.string().optional(),
  governingLawState: z.string().length(2).optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  leadAttorneyId: z.string().uuid().optional(),
  targetCloseDate: z.string().optional(),
  dealValueCents: z.number().int().positive().optional(),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const matterUpdateSchema = matterCreateSchema.partial().extend({
  status: z.enum(['open', 'under_review', 'closed', 'archived']).optional(),
});

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(['attorney', 'admin', 'partner', 'paralegal']).optional(),
  displayName: z.string().optional(),
});

// ============================================================
// ROUTE REGISTRATION
// ============================================================

export async function registerRoutes(fastify: FastifyInstance): Promise<void> {
  // ============================================================
  // AUTH ROUTES
  // ============================================================

  // POST /auth/login
  fastify.post('/auth/login', {
    config: {
      rateLimit: {
        max: rateLimits.auth.requests,
        timeWindow: rateLimits.auth.windowMs,
      },
    },
  }, async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const { email, password, mfaCode, tenantSlug } = body;

    // Find attorney by email
    const attorney = await queryOne<{
      id: string;
      tenant_id: string;
      email: string;
      display_name: string;
      role: string;
      password_hash: string;
      mfa_enabled: boolean;
      mfa_secret: string | null;
      failed_login_attempts: number;
      locked_until: Date | null;
      status: string;
      tenant_slug: string;
    }>(
      `SELECT a.id, a.tenant_id, a.email, a.display_name, a.role, a.password_hash, 
              a.mfa_enabled, a.mfa_secret, a.failed_login_attempts, a.locked_until, a.status,
              t.slug as tenant_slug
       FROM attorneys a
       JOIN tenants t ON t.id = a.tenant_id
       WHERE a.email = $1`,
      [email.toLowerCase()]
    );

    if (!attorney) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    if (tenantSlug && attorney.tenant_slug !== tenantSlug) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    // Check if account is locked
    if (attorney.locked_until && new Date(attorney.locked_until) > new Date()) {
      return reply.status(423).send({
        success: false,
        error: { code: 'ACCOUNT_LOCKED', message: 'Account is temporarily locked' },
      });
    }

    // Check if account is suspended
    if (attorney.status === 'suspended') {
      return reply.status(401).send({
        success: false,
        error: { code: 'ACCOUNT_SUSPENDED', message: 'Account has been suspended' },
      });
    }

    // Verify password
    const validPassword = await verifyPassword(password, attorney.password_hash);
    if (!validPassword) {
      // Increment failed attempts
      const newAttempts = attorney.failed_login_attempts + 1;
      const lockUntil = newAttempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000) // Lock for 15 minutes
        : null;

      await query(
        `UPDATE attorneys 
         SET failed_login_attempts = $1, locked_until = $2 
         WHERE id = $3`,
        [newAttempts, lockUntil, attorney.id]
      );

      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
      });
    }

    // Check MFA if enabled
    if (attorney.mfa_enabled) {
      if (!mfaCode) {
        return reply.status(200).send({
          success: true,
          data: { mfaRequired: true },
        });
      }

      // Verify MFA code (would use otpauth library in full implementation)
      // For now, skip MFA verification in development
    }

    // Generate tokens
    const tokenId = generateSecureToken(16);
    const accessToken = await generateAccessToken({
      sub: attorney.id,
      tenantId: attorney.tenant_id,
      email: attorney.email,
      role: attorney.role,
    });

    const refreshToken = await generateRefreshToken({
      sub: attorney.id,
      tenantId: attorney.tenant_id,
      email: attorney.email,
      role: attorney.role,
      tokenId,
    });

    // Store refresh token hash
    await query(
      `INSERT INTO refresh_tokens (attorney_id, tenant_id, token_hash, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        attorney.id,
        attorney.tenant_id,
        hashToken(refreshToken),
        request.headers['user-agent'] || '',
        request.ip,
      ]
    );

    // Reset failed attempts and update last login
    await query(
      `UPDATE attorneys 
       SET failed_login_attempts = 0, locked_until = NULL, last_login_at = NOW() 
       WHERE id = $1`,
      [attorney.id]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (tenant_id, actor_attorney_id, event_type, ip_address, user_agent)
       VALUES ($1, $2, 'auth.login', $3, $4)`,
      [attorney.tenant_id, attorney.id, request.ip, request.headers['user-agent']]
    );

    // Set refresh token as httpOnly cookie
    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return {
      success: true,
      data: {
        accessToken,
        attorney: {
          id: attorney.id,
          tenantId: attorney.tenant_id,
          email: attorney.email,
          displayName: attorney.display_name,
          role: attorney.role,
        },
      },
    };
  });

  // POST /auth/logout
  fastify.post('/auth/logout', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const refreshToken = request.cookies.refreshToken;

    if (refreshToken) {
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1`,
        [hashToken(refreshToken)]
      );
    }

    // Log audit event
    await query(
      `INSERT INTO audit_events (tenant_id, actor_attorney_id, event_type, ip_address, user_agent)
       VALUES ($1, $2, 'auth.logout', $3, $4)`,
      [authReq.tenantId, authReq.attorneyId, request.ip, request.headers['user-agent']]
    );

    reply.clearCookie('refreshToken', { path: '/auth/refresh' });
    return { success: true };
  });

  // POST /auth/refresh
  fastify.post('/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies.refreshToken;
    if (!refreshToken) {
      return reply.status(401).send({
        success: false,
        error: { code: 'NO_REFRESH_TOKEN', message: 'No refresh token provided' },
      });
    }

    // Find and validate refresh token
    const tokenRecord = await queryOne<{
      id: string;
      attorney_id: string;
      tenant_id: string;
      expires_at: Date;
      revoked_at: Date | null;
      rotated_to: string | null;
    }>(
      `SELECT id, attorney_id, tenant_id, expires_at, revoked_at, rotated_to
       FROM refresh_tokens WHERE token_hash = $1`,
      [hashToken(refreshToken)]
    );

    if (!tokenRecord) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid refresh token' },
      });
    }

    // Check if token is revoked or expired
    if (tokenRecord.revoked_at || new Date(tokenRecord.expires_at) < new Date()) {
      return reply.status(401).send({
        success: false,
        error: { code: 'TOKEN_EXPIRED', message: 'Refresh token has expired' },
      });
    }

    // Check for token reuse (replay attack)
    if (tokenRecord.rotated_to) {
      // Revoke entire token family
      await query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE attorney_id = $1`,
        [tokenRecord.attorney_id]
      );
      return reply.status(401).send({
        success: false,
        error: { code: 'TOKEN_REUSE', message: 'Token reuse detected' },
      });
    }

    // Get attorney
    const attorney = await queryOne<{
      id: string;
      email: string;
      role: string;
      status: string;
    }>(
      `SELECT id, email, role, status FROM attorneys WHERE id = $1 AND tenant_id = $2`,
      [tokenRecord.attorney_id, tokenRecord.tenant_id]
    );

    if (!attorney || attorney.status !== 'active') {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_ACCOUNT', message: 'Account not found or inactive' },
      });
    }

    // Generate new tokens
    const newTokenId = generateSecureToken(16);
    const accessToken = await generateAccessToken({
      sub: attorney.id,
      tenantId: tokenRecord.tenant_id,
      email: attorney.email,
      role: attorney.role,
    });

    const newRefreshToken = await generateRefreshToken({
      sub: attorney.id,
      tenantId: tokenRecord.tenant_id,
      email: attorney.email,
      role: attorney.role,
      tokenId: newTokenId,
    });

    // Rotate token
    const newTokenHash = hashToken(newRefreshToken);
    await withTransaction(async (tx) => {
      // Create new token
      const newToken = await tx.queryOne<{ id: string }>(
        `INSERT INTO refresh_tokens (attorney_id, tenant_id, token_hash, user_agent, ip_address)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [attorney.id, tokenRecord.tenant_id, newTokenHash, request.headers['user-agent'], request.ip]
      );

      // Mark old token as rotated
      await tx.query(
        `UPDATE refresh_tokens SET rotated_to = $1 WHERE id = $2`,
        [newToken?.id, tokenRecord.id]
      );
    });

    // Set new refresh token
    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });

    return { success: true, data: { accessToken } };
  });

  // POST /auth/forgot-password
  fastify.post('/auth/forgot-password', async (request, reply) => {
    const { email } = forgotPasswordSchema.parse(request.body);

    const attorney = await queryOne<{ id: string; display_name: string; tenant_id: string }>(
      `SELECT id, display_name, tenant_id FROM attorneys WHERE email = $1 AND status = 'active'`,
      [email.toLowerCase()]
    );

    // Always return success to prevent email enumeration
    if (!attorney) {
      return { success: true };
    }

    // Generate reset token
    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);

    await query(
      `INSERT INTO password_reset_tokens (attorney_id, token_hash)
       VALUES ($1, $2)`,
      [attorney.id, tokenHash]
    );

    // Send email
    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${token}`;
    await sendPasswordResetEmail(email, resetUrl, attorney.display_name);

    // Log audit event
    await query(
      `INSERT INTO audit_events (tenant_id, actor_attorney_id, event_type, ip_address, metadata)
       VALUES ($1, $2, 'auth.forgot_password', $3, $4)`,
      [attorney.tenant_id, attorney.id, request.ip, JSON.stringify({ email })]
    );

    return { success: true };
  });

  // POST /auth/reset-password
  fastify.post('/auth/reset-password', async (request, reply) => {
    const { token, password, newPassword } = resetPasswordSchema.parse(request.body);
    const effectivePassword = newPassword ?? password ?? '';

    // Validate password policy
    const validation = validatePasswordPolicy(effectivePassword);
    if (!validation.valid) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: validation.errors.join(', ') },
      });
    }

    const tokenHash = hashToken(token);
    const tokenRecord = await queryOne<{
      id: string;
      attorney_id: string;
      expires_at: Date;
      used_at: Date | null;
    }>(
      `SELECT id, attorney_id, expires_at, used_at 
       FROM password_reset_tokens 
       WHERE token_hash = $1 AND status = 'active'`,
      [tokenHash]
    );

    if (!tokenRecord || tokenRecord.used_at || new Date(tokenRecord.expires_at) < new Date()) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_TOKEN', message: 'Invalid or expired token' },
      });
    }

    const passwordHash = await hashPassword(effectivePassword);

    await withTransaction(async (tx) => {
      // Update password
      await tx.query(
        `UPDATE attorneys SET password_hash = $1, failed_login_attempts = 0, locked_until = NULL
         WHERE id = $2`,
        [passwordHash, tokenRecord.attorney_id]
      );

      // Mark token as used
      await tx.query(
        `UPDATE password_reset_tokens SET used_at = NOW(), status = 'used' WHERE id = $1`,
        [tokenRecord.id]
      );

      // Revoke all refresh tokens (log out all sessions)
      await tx.query(
        `UPDATE refresh_tokens SET revoked_at = NOW() WHERE attorney_id = $1`,
        [tokenRecord.attorney_id]
      );
    });

    return { success: true };
  });

  // GET /auth/me
  fastify.get('/auth/me', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;

    const attorney = await queryOne<{
      id: string;
      email: string;
      display_name: string;
      role: string;
      practice_group: string | null;
      bar_number: string | null;
      bar_state: string | null;
      mfa_enabled: boolean;
      last_login_at: Date | null;
    }>(
      `SELECT id, email, display_name, role, practice_group, bar_number, bar_state, 
              mfa_enabled, last_login_at
       FROM attorneys WHERE id = $1 AND tenant_id = $2`,
      [authReq.attorneyId, authReq.tenantId]
    );

    const tenant = await queryOne<{
      id: string;
      name: string;
      slug: string;
      plan: string;
      logo_url: string | null;
    }>(
      `SELECT id, name, slug, plan, logo_url FROM tenants WHERE id = $1`,
      [authReq.tenantId]
    );

    return {
      success: true,
      data: {
        attorney,
        tenant,
      },
    };
  });

  // POST /auth/mfa/setup
  fastify.post('/auth/mfa/setup', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const secret = generateSecureToken(20).toUpperCase();
    const issuer = encodeURIComponent('LexOS');
    const label = encodeURIComponent(authReq.tokenPayload.email);
    const qrCodeUrl = `otpauth://totp/${issuer}:${label}?secret=${secret}&issuer=${issuer}`;

    await query(
      `UPDATE attorneys SET mfa_secret = $1 WHERE id = $2 AND tenant_id = $3`,
      [secret, authReq.attorneyId, authReq.tenantId]
    );

    return {
      success: true,
      data: {
        secret,
        qrCodeUrl,
      },
    };
  });

  // ============================================================
  // MATTER ROUTES
  // ============================================================

  // GET /api/matters
  fastify.get('/api/matters', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const queryParams = request.query as { page?: string; limit?: string; status?: string; search?: string };

    const page = Number.parseInt(queryParams.page || '1', 10);
    const limit = Math.min(Number.parseInt(queryParams.limit || '20', 10), 100);
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE m.tenant_id = $1';
    const params: unknown[] = [authReq.tenantId];
    let paramIndex = 2;

    if (queryParams.status) {
      whereClause += ` AND m.status = $${paramIndex}`;
      params.push(queryParams.status);
      paramIndex++;
    }

    if (queryParams.search) {
      whereClause += ` AND (m.matter_name ILIKE $${paramIndex} OR m.matter_code ILIKE $${paramIndex} OR m.client_name ILIKE $${paramIndex})`;
      params.push(`%${queryParams.search}%`);
      paramIndex++;
    }

    const matters = await query<{
      id: string;
      matter_code: string;
      matter_name: string;
      matter_type: string;
      client_name: string;
      status: string;
      priority: string;
      health_score: number;
      target_close_date: Date | null;
      created_at: Date;
      flag_count: number;
      critical_flag_count: number;
    }>(
      `SELECT m.id, m.matter_code, m.matter_name, m.matter_type, m.client_name,
              m.status, m.priority, m.health_score, m.target_close_date, m.created_at,
              COALESCE(f.flag_count, 0) as flag_count,
              COALESCE(f.critical_count, 0) as critical_flag_count
       FROM matters m
       LEFT JOIN (
         SELECT matter_id, COUNT(*) as flag_count, 
                SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical_count
         FROM flags WHERE status = 'open'
         GROUP BY matter_id
       ) f ON m.id = f.matter_id
       ${whereClause}
       ORDER BY m.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    const countResult = await queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM matters m ${whereClause}`,
      params
    );

    return {
      success: true,
      data: {
        matters: matters.rows,
        pagination: {
          page,
          limit,
          total: Number.parseInt(countResult?.count || '0', 10),
          totalPages: Math.ceil(Number.parseInt(countResult?.count || '0', 10) / limit),
        },
      },
    };
  });

  // POST /api/matters
  fastify.post('/api/matters', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const body = matterCreateSchema.parse(request.body);

    const matter = await queryOne<{ id: string }>(
      `INSERT INTO matters (tenant_id, matter_code, matter_name, matter_type, client_name,
                            counterparty_name, governing_law_state, priority, lead_attorney_id,
                            target_close_date, deal_value_cents, notes, tags, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING id`,
      [
        authReq.tenantId,
        body.matterCode,
        body.matterName,
        body.matterType,
        body.clientName,
        body.counterpartyName || null,
        body.governingLawState || null,
        body.priority || 'normal',
        body.leadAttorneyId || null,
        body.targetCloseDate || null,
        body.dealValueCents || null,
        body.notes || null,
        body.tags || [],
        authReq.attorneyId,
      ]
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (tenant_id, actor_attorney_id, event_type, object_type, object_id, metadata)
       VALUES ($1, $2, 'matter.created', 'matter', $3, $4)`,
      [authReq.tenantId, authReq.attorneyId, matter?.id, JSON.stringify(body)]
    );

    return reply.status(201).send({
      success: true,
      data: { id: matter?.id },
    });
  });

  // GET /api/matters/:id
  fastify.get('/api/matters/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const matter = await queryOne<{
      id: string;
      matter_code: string;
      matter_name: string;
      matter_type: string;
      client_name: string;
      counterparty_name: string | null;
      governing_law_state: string | null;
      status: string;
      priority: string;
      health_score: number;
      lead_attorney_id: string | null;
      target_close_date: Date | null;
      deal_value_cents: number | null;
      notes: string | null;
      tags: string[];
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT id, matter_code, matter_name, matter_type, client_name, counterparty_name,
              governing_law_state, status, priority, health_score, lead_attorney_id,
              target_close_date, deal_value_cents, notes, tags, created_at, updated_at
       FROM matters WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!matter) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Matter not found' },
      });
    }

    return { success: true, data: matter };
  });

  // PATCH /api/matters/:id
  fastify.patch('/api/matters/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = matterUpdateSchema.parse(request.body);

    // Check matter exists and belongs to tenant
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM matters WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!existing) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Matter not found' },
      });
    }

    // Build dynamic update query
    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    const fieldMap: Record<string, string> = {
      matterCode: 'matter_code',
      matterName: 'matter_name',
      matterType: 'matter_type',
      clientName: 'client_name',
      counterpartyName: 'counterparty_name',
      governingLawState: 'governing_law_state',
      status: 'status',
      priority: 'priority',
      leadAttorneyId: 'lead_attorney_id',
      targetCloseDate: 'target_close_date',
      dealValueCents: 'deal_value_cents',
      notes: 'notes',
      tags: 'tags',
    };

    for (const [key, column] of Object.entries(fieldMap)) {
      if (body[key as keyof typeof body] !== undefined) {
        updates.push(`${column} = $${paramIndex}`);
        values.push(body[key as keyof typeof body]);
        paramIndex++;
      }
    }

    values.push(id, authReq.tenantId);

    await query(
      `UPDATE matters SET ${updates.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      values
    );

    // Log audit event
    await query(
      `INSERT INTO audit_events (tenant_id, actor_attorney_id, event_type, object_type, object_id, metadata)
       VALUES ($1, $2, 'matter.updated', 'matter', $3, $4)`,
      [authReq.tenantId, authReq.attorneyId, id, JSON.stringify(body)]
    );

    return { success: true };
  });

  // ============================================================
  // DOCUMENT ROUTES
  // ============================================================

  // POST /api/documents/upload
  fastify.post('/api/documents/upload', { 
    preHandler: [authenticateRequest, enforceActiveSubscription, enforceDocumentQuota] 
  }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    
    const data = await request.file();
    if (!data) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_FILE', message: 'No file provided' },
      });
    }

    const matterId = (request.query as { matterId?: string }).matterId;
    if (!matterId) {
      return reply.status(400).send({
        success: false,
        error: { code: 'NO_MATTER_ID', message: 'Matter ID is required' },
      });
    }

    // Verify matter exists
    const matter = await queryOne<{ id: string }>(
      `SELECT id FROM matters WHERE id = $1 AND tenant_id = $2`,
      [matterId, authReq.tenantId]
    );

    if (!matter) {
      return reply.status(404).send({
        success: false,
        error: { code: 'MATTER_NOT_FOUND', message: 'Matter not found' },
      });
    }

    // Read file buffer
    const buffer = await data.toBuffer();
    const sha256Hash = (await import('./security.js')).sha256(buffer);

    // Check for duplicate
    const duplicate = await queryOne<{ id: string }>(
      `SELECT id FROM documents WHERE sha256 = $1 AND tenant_id = $2`,
      [sha256Hash, authReq.tenantId]
    );

    if (duplicate) {
      return reply.status(409).send({
        success: false,
        error: { code: 'DUPLICATE', message: 'Document already exists', documentId: duplicate.id },
      });
    }

    // Determine doc type from filename
    const filename = data.filename;
    let docType = 'other';
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.includes('nda') || lowerFilename.includes('confidential')) docType = 'nda';
    else if (lowerFilename.includes('spa') || lowerFilename.includes('purchase')) docType = 'spa';
    else if (lowerFilename.includes('loi') || lowerFilename.includes('intent')) docType = 'loi';
    else if (lowerFilename.includes('employment')) docType = 'employment_agreement';
    else if (lowerFilename.includes('lease')) docType = 'lease';
    else if (lowerFilename.includes('amendment')) docType = 'amendment';
    else if (lowerFilename.includes('contract') || lowerFilename.includes('agreement')) docType = 'contract';

    // Insert document record
    const document = await queryOne<{ id: string }>(
      `INSERT INTO documents (tenant_id, matter_id, source_name, mime_type, doc_type, sha256, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [authReq.tenantId, matterId, filename, data.mimetype, docType, sha256Hash, authReq.attorneyId]
    );

    if (!document) {
      return reply.status(500).send({
        success: false,
        error: { code: 'DOCUMENT_CREATE_FAILED', message: 'Failed to create document' },
      });
    }

    // Store file in quarantine
    const storage = await import('./storage.js');
    const fileKey = storage.generateDocumentKey(authReq.tenantId, document.id, filename, 'quarantine');
    await storage.uploadFile(fileKey, buffer, { contentType: data.mimetype });

    // Update document with file URI
    await query(
      `UPDATE documents SET file_uri = $1 WHERE id = $2`,
      [fileKey, document.id]
    );

    // Start the document processing pipeline via orchestrator
    const pipelineId = await startDocumentPipeline({
      tenantId: authReq.tenantId,
      documentId: document.id,
      matterId,
      fileUri: fileKey,
    });
    logger.info({ documentId: document.id, pipelineId }, 'Document pipeline started');

    // Track document usage for billing
    await incrementDocumentUsage(authReq.tenantId);

    return reply.status(201).send({
      success: true,
      data: {
        id: document.id,
        sourceName: filename,
        ingestionStatus: 'uploaded',
        securityStatus: 'pending',
        pipelineId,
      },
    });
  });

  // GET /api/documents/:id
  fastify.get('/api/documents/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const document = await queryOne<{
      id: string;
      matter_id: string;
      source_name: string;
      mime_type: string;
      doc_type: string;
      ingestion_status: string;
      security_status: string;
      page_count: number | null;
      word_count: number | null;
      ocr_engine: string | null;
      ocr_confidence: number | null;
      created_at: Date;
    }>(
      `SELECT id, matter_id, source_name, mime_type, doc_type, ingestion_status,
              security_status, page_count, word_count, ocr_engine, ocr_confidence, created_at
       FROM documents WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!document) {
      return reply.status(404).send({
        success: false,
        error: { code: 'NOT_FOUND', message: 'Document not found' },
      });
    }

    return { success: true, data: document };
  });

  // GET /api/documents/:id/clauses
  fastify.get('/api/documents/:id/clauses', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const clauses = await query<{
      id: string;
      clause_type: string;
      heading: string | null;
      text_excerpt: string;
      page_from: number | null;
      page_to: number | null;
      risk_level: string;
      confidence: number;
      risk_factors: unknown[];
      reviewer_status: string;
    }>(
      `SELECT id, clause_type, heading, text_excerpt, page_from, page_to,
              risk_level, confidence, risk_factors, reviewer_status
       FROM clauses WHERE document_id = $1 AND tenant_id = $2
       ORDER BY page_from NULLS LAST, created_at`,
      [id, authReq.tenantId]
    );

    return { success: true, data: clauses.rows };
  });

  // ============================================================
  // ADMIN ROUTES
  // ============================================================

  // POST /api/admin/attorneys (invite)
  fastify.post(
    '/api/admin/attorneys',
    { preHandler: [authenticateRequest, requireRoles('admin', 'partner'), enforceAttorneyLimit] },
    async (request, reply) => {
      const authReq = request as AuthenticatedRequest;
      const body = inviteSchema.parse(request.body);

      // Check if email already exists in tenant
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM attorneys WHERE email = $1 AND tenant_id = $2`,
        [body.email.toLowerCase(), authReq.tenantId]
      );

      if (existing) {
        return reply.status(409).send({
          success: false,
          error: { code: 'EMAIL_EXISTS', message: 'Email already exists in this organization' },
        });
      }

      // Generate invitation token
      const token = generateSecureToken(32);
      const tokenHash = hashToken(token);

      await query(
        `INSERT INTO invitations (tenant_id, email, role, token_hash, invited_by)
         VALUES ($1, $2, $3, $4, $5)`,
        [authReq.tenantId, body.email.toLowerCase(), body.role || 'attorney', tokenHash, authReq.attorneyId]
      );

      // Get tenant and inviter info
      const tenant = await queryOne<{ name: string }>(
        `SELECT name FROM tenants WHERE id = $1`,
        [authReq.tenantId]
      );
      const inviter = await queryOne<{ display_name: string }>(
        `SELECT display_name FROM attorneys WHERE id = $1`,
        [authReq.attorneyId]
      );

      // Send invitation email
      const inviteUrl = `${config.FRONTEND_URL}/invitation/${token}`;
      await sendInvitationEmail(
        body.email,
        inviteUrl,
        tenant?.name || 'Your Firm',
        inviter?.display_name || 'A colleague'
      );

      return reply.status(201).send({ success: true });
    }
  );

  // GET /api/admin/audit-log
  fastify.get(
    '/api/admin/audit-log',
    { preHandler: [authenticateRequest, requireRoles('admin', 'partner')] },
    async (request) => {
      const authReq = request as AuthenticatedRequest;
      const queryParams = request.query as { page?: string; limit?: string; eventType?: string };

      const page = Number.parseInt(queryParams.page || '1', 10);
      const limit = Math.min(Number.parseInt(queryParams.limit || '50', 10), 100);
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE tenant_id = $1';
      const params: unknown[] = [authReq.tenantId];

      if (queryParams.eventType) {
        whereClause += ' AND event_type = $2';
        params.push(queryParams.eventType);
      }

      const events = await query<{
        id: string;
        actor_attorney_id: string | null;
        event_type: string;
        object_type: string | null;
        object_id: string | null;
        ip_address: string | null;
        metadata: unknown;
        created_at: Date;
      }>(
        `SELECT id, actor_attorney_id, event_type, object_type, object_id, 
                ip_address, metadata, created_at
         FROM audit_events
         ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset]
      );

      return { success: true, data: events.rows };
    }
  );

  // ============================================================
  // RESEARCH ROUTES
  // ============================================================

  // POST /api/research/query - Standard JSON response for legal research
  fastify.post('/api/research/query', { 
    preHandler: [authenticateRequest, enforceActiveSubscription, enforceResearchQuota] 
  }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { question, matterId } = z.object({
      question: z.string().min(1).max(2000),
      matterId: z.string().uuid().optional(),
    }).parse(request.body);

    let usageStarted = false;

    try {
      // 1. Embed the question (with caching)
      let embeddings: number[][] | null = null;
      const cacheKey = question.toLowerCase().trim();
      
      // Try cache first
      const cached = await getCachedEmbedding(cacheKey, 'all-MiniLM-L6-v2');
      if (cached) {
        embeddings = [cached];
        logger.debug('Using cached embedding for research query');
      } else {
        // Fetch from AI service
        const embedRes = await fetch(`${config.AI_SERVICE_URL}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: [question] }),
          signal: AbortSignal.timeout(config.AI_SERVICE_TIMEOUT_MS),
        });
        
        if (!embedRes.ok) {
          throw new Error('Failed to embed question');
        }
        const result = await embedRes.json() as { embeddings?: number[][] };
        if (!result.embeddings || result.embeddings.length === 0) {
          throw new Error('No embeddings returned from AI service');
        }
        embeddings = result.embeddings;
        
        // Cache for future use
        await cacheEmbedding(cacheKey, 'all-MiniLM-L6-v2', embeddings[0]);
      }

      if (!embeddings || embeddings.length === 0) {
        throw new Error('Missing embeddings for research query');
      }

      // 2. Search for relevant chunks
      const searchQuery = matterId
        ? `SELECT dc.id, dc.document_id, dc.text_content, dc.chunk_index, 
                  d.file_name as document_title,
                  1 - (dc.embedding <=> $1::vector) as relevance_score
           FROM document_chunks dc
           JOIN documents d ON dc.document_id = d.id
           WHERE d.tenant_id = $2 AND d.matter_id = $3
           ORDER BY dc.embedding <=> $1::vector LIMIT 20`
        : `SELECT dc.id, dc.document_id, dc.text_content, dc.chunk_index,
                  d.file_name as document_title,
                  1 - (dc.embedding <=> $1::vector) as relevance_score
           FROM document_chunks dc
           JOIN documents d ON dc.document_id = d.id
           WHERE d.tenant_id = $2
           ORDER BY dc.embedding <=> $1::vector LIMIT 20`;

      const searchParams = matterId 
        ? [`[${embeddings[0].join(',')}]`, authReq.tenantId, matterId]
        : [`[${embeddings[0].join(',')}]`, authReq.tenantId];

      const chunks = await query<ResearchChunkRow>(searchQuery, searchParams);

      // 3. Build AI context for enhanced reasoning (if matter-scoped)
      let contextPrompt = '';
      if (matterId && chunks.rows.length > 0) {
        try {
          const aiContext = await buildAIContext(
            authReq.tenantId, 
            chunks.rows[0].document_id, 
            question
          );
          contextPrompt = formatContextForPrompt(aiContext);
        } catch (err) {
          logger.warn({ err }, 'Failed to build AI context, proceeding without');
        }
      }

      // 4. Call AI service for synthesis
      usageStarted = true;
      const aiResponse = await fetch(`${config.AI_SERVICE_URL}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question, 
          chunks: chunks.rows.map((c: any) => c.text_content),
          context: contextPrompt || undefined,
          language: 'en' 
        }),
        signal: AbortSignal.timeout(config.AI_SERVICE_TIMEOUT_MS),
      });

      if (!aiResponse.ok) {
        throw new Error('AI research synthesis failed');
      }
      const result = await aiResponse.json();

      // 4. Save to research history
      await query(
        `INSERT INTO research_history (tenant_id, matter_id, attorney_id, question, answer, citations, sources_used)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          authReq.tenantId, 
          matterId || null, 
          authReq.attorneyId, 
          question, 
          result.answer, 
          JSON.stringify(result.citations || []),
          chunks.rows.length
        ]
      );

      return {
        success: true, 
        data: {
          answer: result.answer,
          citations: result.citations || [],
          sources: chunks.rows.map((c: any) => ({
            documentId: c.document_id,
            title: c.document_title,
            relevance: c.relevance_score,
            snippet: c.text_content.slice(0, 200)
          })),
           confidence: result.confidence || 0.85
         }
       };
    } catch (error) {
      logger.error({ error }, 'Research query failed');
      return reply.status(500).send({
        success: false,
        error: { code: 'RESEARCH_FAILED', message: 'Research query failed' }
      });
      } finally {
        if (usageStarted) {
          await incrementResearchUsage(authReq.tenantId).catch((e) => {
            logger.error({ e }, 'Failed to track research usage on /query');
          });
        }
      }
  });

  // POST /api/research/stream - SSE streaming response for legal research
  fastify.post('/api/research/stream', { 
    preHandler: [authenticateRequest, enforceActiveSubscription, enforceResearchQuota] 
  }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { query: question, matterId } = z.object({
      query: z.string().min(1).max(2000),
      matterId: z.string().uuid().nullable().optional(),
    }).parse(request.body);

    // Set SSE headers
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    const sendEvent = (data: object) => {
      reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Track whether stream actually started (for billing accuracy)
    let streamStarted = false;

    try {
      // 1. Embed question with caching
      let embeddings: number[][] | null = null;
      const cacheKey = question.toLowerCase().trim();
      
      const cached = await getCachedEmbedding(cacheKey, 'all-MiniLM-L6-v2');
      if (cached) {
        embeddings = [cached];
        logger.debug('Using cached embedding for research stream');
      } else {
        const embedRes = await fetch(`${config.AI_SERVICE_URL}/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texts: [question] }),
        });
        const result = await embedRes.json() as { embeddings?: number[][] };
        if (!result.embeddings || result.embeddings.length === 0) {
          throw new Error('No embeddings returned from AI service');
        }
        embeddings = result.embeddings;
        await cacheEmbedding(cacheKey, 'all-MiniLM-L6-v2', embeddings[0]);
      }

      if (!embeddings || embeddings.length === 0) {
        throw new Error('Missing embeddings for research stream');
      }

      // 2. Search for relevant chunks
      const searchQuery = matterId
        ? `SELECT dc.id, dc.document_id, dc.text_content, dc.chunk_index,
                  d.file_name as document_title,
                  1 - (dc.embedding <=> $1::vector) as relevance_score
           FROM document_chunks dc
           JOIN documents d ON dc.document_id = d.id
           WHERE d.tenant_id = $2 AND d.matter_id = $3
           ORDER BY dc.embedding <=> $1::vector LIMIT 20`
        : `SELECT dc.id, dc.document_id, dc.text_content, dc.chunk_index,
                  d.file_name as document_title,
                  1 - (dc.embedding <=> $1::vector) as relevance_score
           FROM document_chunks dc
           JOIN documents d ON dc.document_id = d.id
           WHERE d.tenant_id = $2
           ORDER BY dc.embedding <=> $1::vector LIMIT 20`;

      const searchParams = matterId 
        ? [`[${embeddings[0].join(',')}]`, authReq.tenantId, matterId]
        : [`[${embeddings[0].join(',')}]`, authReq.tenantId];

      const chunks = await query<ResearchChunkRow>(searchQuery, searchParams);

      // 3. Send sources immediately
      sendEvent({ 
        type: 'sources', 
        sources: chunks.rows.map((c: any) => ({ 
          documentId: c.document_id, 
          title: c.document_title, 
          relevance: c.relevance_score, 
          snippet: c.text_content.slice(0, 200) 
        })) 
      });

      // Mark stream as started (AI service call begins now)
      streamStarted = true;

      // 4. Stream synthesis from AI service
      const aiResponse = await fetch(`${config.AI_SERVICE_URL}/research/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question, 
          chunks: chunks.rows.map((c: any) => c.text_content),
          stream: true 
        }),
      });

      if (!aiResponse.body) {
        throw new Error('No response body from AI service');
      }

      const reader = aiResponse.body.getReader();
      const decoder = new TextDecoder();
      let fullAnswer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const token = decoder.decode(value, { stream: true });
        fullAnswer += token;
        sendEvent({ type: 'token', content: token });
      }

      // 5. Persist to research_history
      await query(
        `INSERT INTO research_history (tenant_id, matter_id, attorney_id, question, answer, citations, sources_used)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [authReq.tenantId, matterId || null, authReq.attorneyId, question, fullAnswer, '[]', chunks.rows.length]
      );

      reply.raw.write('data: [DONE]\n\n');
    } catch (err) {
      logger.error({ err }, 'Research stream failed');
      sendEvent({ type: 'error', message: 'Research failed' });
    } finally {
      // Track research usage only if stream actually started (ensures billing accuracy)
      if (streamStarted) {
        await incrementResearchUsage(authReq.tenantId).catch((e) => {
          logger.error({ e }, 'Failed to track research usage');
        });
      }
      reply.raw.end();
    }
  });

  // GET /api/research/history - Get research history
  fastify.get('/api/research/history', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const { matterId, limit = '20' } = request.query as { matterId?: string; limit?: string };
    
    const limitNum = Math.min(Number.parseInt(limit) || 20, 100);
    
    const queryStr = matterId
      ? `SELECT id, question, answer, citations, sources_used, created_at 
         FROM research_history
         WHERE tenant_id = $1 AND matter_id = $2
         ORDER BY created_at DESC LIMIT $3`
      : `SELECT id, question, answer, citations, sources_used, created_at 
         FROM research_history
         WHERE tenant_id = $1
         ORDER BY created_at DESC LIMIT $2`;
    
    const params = matterId 
      ? [authReq.tenantId, matterId, limitNum]
      : [authReq.tenantId, limitNum];
    
    const rows = await query(queryStr, params);
    return { success: true, data: rows.rows };
  });

  // ============================================================
  // ANALYTICS ROUTES
  // ============================================================

  // GET /api/analytics/firm
  fastify.get(
    '/api/analytics/firm',
    { preHandler: [authenticateRequest, requireRoles('admin', 'partner')] },
    async (request) => {
      const authReq = request as AuthenticatedRequest;

      // Get key metrics
      const metrics = await queryOne<{
        total_matters: number;
        open_matters: number;
        total_documents: number;
        processed_documents: number;
        total_flags: number;
        open_flags: number;
        critical_flags: number;
        avg_health_score: number;
      }>(
        `SELECT 
           (SELECT COUNT(*) FROM matters WHERE tenant_id = $1) as total_matters,
           (SELECT COUNT(*) FROM matters WHERE tenant_id = $1 AND status = 'open') as open_matters,
           (SELECT COUNT(*) FROM documents WHERE tenant_id = $1) as total_documents,
           (SELECT COUNT(*) FROM documents WHERE tenant_id = $1 AND ingestion_status = 'normalized') as processed_documents,
           (SELECT COUNT(*) FROM flags WHERE tenant_id = $1) as total_flags,
           (SELECT COUNT(*) FROM flags WHERE tenant_id = $1 AND status = 'open') as open_flags,
           (SELECT COUNT(*) FROM flags WHERE tenant_id = $1 AND status = 'open' AND severity = 'critical') as critical_flags,
           (SELECT AVG(health_score) FROM matters WHERE tenant_id = $1 AND status = 'open') as avg_health_score`,
        [authReq.tenantId]
      );

      // Get flag distribution by severity
      const flagDistribution = await query<{ severity: string; count: number }>(
        `SELECT severity, COUNT(*) as count
         FROM flags WHERE tenant_id = $1 AND status = 'open'
         GROUP BY severity`,
        [authReq.tenantId]
      );

      // Get clause type distribution
      const clauseDistribution = await query<{ clause_type: string; count: number }>(
        `SELECT clause_type, COUNT(*) as count
         FROM clauses WHERE tenant_id = $1
         GROUP BY clause_type
         ORDER BY count DESC
         LIMIT 10`,
        [authReq.tenantId]
      );

      return {
        success: true,
        data: {
          metrics,
          flagDistribution: flagDistribution.rows,
          clauseDistribution: clauseDistribution.rows,
        },
      };
    }
  );

  // ============================================================
  // BILLING ROUTES
  // ============================================================

  // GET /billing/status - Get billing status
  fastify.get(
    '/billing/status',
    { preHandler: [authenticateRequest] },
    async (request, reply) => {
      const authReq = request as AuthenticatedRequest;

      const tenant = await queryOne<{
        plan: string;
        billing_status: string;
        monthly_doc_quota: number;
        monthly_research_quota: number;
      }>(
        `SELECT plan, billing_status, monthly_doc_quota, monthly_research_quota
         FROM tenants WHERE id = $1`,
        [authReq.tenantId]
      );

      if (!tenant) {
        return reply.status(404).send({ success: false, error: { message: 'Tenant not found' } });
      }

      // Get current month usage
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      const usage = await queryOne<{ doc_count: number; research_count: number }>(
        `SELECT 
           (SELECT COUNT(*) FROM documents WHERE tenant_id = $1 AND created_at >= $2) as doc_count,
           (SELECT COUNT(*) FROM research_history WHERE tenant_id = $1 AND created_at >= $2) as research_count`,
        [authReq.tenantId, startOfMonth]
      );

      return {
        success: true,
        data: {
          plan: tenant.plan,
          status: tenant.billing_status,
          usage: {
            documents: usage?.doc_count || 0,
            documentsLimit: tenant.monthly_doc_quota,
            research: usage?.research_count || 0,
            researchLimit: tenant.monthly_research_quota,
          },
        },
      };
    }
  );

  // POST /billing/checkout - Create checkout session
  fastify.post(
    '/billing/checkout',
    { preHandler: [authenticateRequest, requireRoles('admin')] },
    async (request, reply) => {
      const authReq = request as AuthenticatedRequest;
      const body = z.object({
        plan: z.enum(['starter', 'growth', 'professional', 'enterprise']),
        successUrl: z.string().url(),
        cancelUrl: z.string().url(),
      }).parse(request.body);

      // Integration with Stripe via billing module
      try {
        const { createCheckoutSession } = await import('./billing.js');
        const billingContact = await queryOne<{ email: string; firm_name: string }>(
          `SELECT a.email, t.name as firm_name
           FROM attorneys a
           JOIN tenants t ON t.id = a.tenant_id
           WHERE a.id = $1 AND a.tenant_id = $2`,
          [authReq.attorneyId, authReq.tenantId]
        );

        if (!billingContact) {
          return reply.status(404).send({ success: false, error: { message: 'Billing contact not found' } });
        }

        const session = await createCheckoutSession(
          authReq.tenantId,
          billingContact.email,
          billingContact.firm_name,
          body.plan,
          body.successUrl,
          body.cancelUrl
        );
        return { success: true, data: { sessionUrl: session.url } };
      } catch (error) {
        logger.error({ error }, 'Failed to create checkout session');
        return reply.status(500).send({ success: false, error: { message: 'Billing service unavailable' } });
      }
    }
  );

  // GET /quota/check - Check quota status
  fastify.get(
    '/quota/check',
    { preHandler: [authenticateRequest] },
    async (request, reply) => {
      const authReq = request as AuthenticatedRequest;
      const { type } = request.query as { type?: 'document' | 'research' };
      const quotaType: 'document' | 'research' = type === 'research' ? 'research' : 'document';

      try {
        const { checkQuota } = await import('./billing.js');
        const quotaStatus = await checkQuota(authReq.tenantId, quotaType);
        return { success: true, data: quotaStatus };
      } catch (error) {
        return reply.status(500).send({ success: false, error: { message: 'Quota check failed' } });
      }
    }
  );

  // ============================================================
  // LEGAL RULES ROUTES
  // ============================================================

  // GET /legal-rules/:state - Get rules for a state
  fastify.get(
    '/legal-rules/:state',
    { preHandler: [authenticateRequest] },
    async (request, reply) => {
      const { state } = request.params as { state: string };

      try {
        const { getRulesForState, US_JURISDICTIONS } = await import('./legal-rules.js');
        
        if (!US_JURISDICTIONS.some((jurisdiction) => jurisdiction.code === state.toUpperCase())) {
          return reply.status(400).send({ success: false, error: { message: 'Invalid state code' } });
        }

        const rules = getRulesForState(state.toUpperCase());
        return { success: true, data: rules };
      } catch (error) {
        return reply.status(500).send({ success: false, error: { message: 'Failed to get legal rules' } });
      }
    }
  );

  // GET /legal-rules/:state/:clauseType - Get specific clause rules for state
  fastify.get(
    '/legal-rules/:state/:clauseType',
    { preHandler: [authenticateRequest] },
    async (request, reply) => {
      const { state, clauseType } = request.params as { state: string; clauseType: string };

      try {
        const { getRulesForState } = await import('./legal-rules.js');
        const rules = getRulesForState(state.toUpperCase());
        const clauseRule = rules.find(r => r.clauseType === clauseType);
        
        if (!clauseRule) {
          return reply.status(404).send({ success: false, error: { message: 'No specific rule for this clause type' } });
        }

        return { success: true, data: clauseRule };
      } catch (error) {
        return reply.status(500).send({ success: false, error: { message: 'Failed to get legal rules' } });
      }
    }
  );

  // POST /legal-rules/check - Check clause compliance
  fastify.post(
    '/legal-rules/check',
    { preHandler: [authenticateRequest] },
    async (request, reply) => {
      const body = z.object({
        clauseType: z.string(),
        text: z.string(),
        jurisdiction: z.string().optional(),
        jurisdictions: z.array(z.string()).optional(),
        metadata: z.record(z.any()).optional(),
      }).parse(request.body);

      try {
        const { checkClauseCompliance } = await import('./legal-rules.js');
        const result = checkClauseCompliance(
          body.clauseType,
          body.text,
          body.jurisdiction || 'US'
        );
        return { success: true, data: result };
      } catch (error) {
        return reply.status(500).send({ success: false, error: { message: 'Compliance check failed' } });
      }
    }
  );

  // ============================================================
  // JOB STATUS ROUTES
  // ============================================================

  // GET /jobs/:id - Get job status
  fastify.get(
    '/jobs/:id',
    { preHandler: [authenticateRequest] },
    async (request, reply) => {
      const authReq = request as AuthenticatedRequest;
      const { id } = request.params as { id: string };

      try {
        // Try pipeline status first (orchestrator-based)
        const pipelineStatus = await getPipelineStatus(authReq.tenantId, id);
        if (pipelineStatus) {
          return { success: true, data: pipelineStatus };
        }

        // Fall back to individual job status check
        const { getJobStatus } = await import('./worker.js');
        
        // Try each queue type
        const queues = ['document', 'clause', 'risk', 'obligation'];
        for (const queue of queues) {
          const status = await getJobStatus(queue, id);
          if (status) {
            return { success: true, data: status };
          }
        }

        return reply.status(404).send({ success: false, error: { message: 'Job not found' } });
      } catch (error) {
        return reply.status(500).send({ success: false, error: { message: 'Failed to get job status' } });
      }
    }
  );

  // ============================================================
  // DOCUMENT ADDITIONAL ROUTES
  // ============================================================

  // POST /api/documents/:id/suggest - Get AI redline suggestions
  fastify.post('/api/documents/:id/suggest', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = z.object({
      clauseType: z.string().optional(),
      jurisdiction: z.string().optional(),
    }).parse(request.body);

    // Verify document access
    const document = await queryOne<{ id: string; matter_id: string }>(
      `SELECT id, matter_id FROM documents WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!document) {
      return reply.status(404).send({ success: false, error: { message: 'Document not found' } });
    }

    try {
      const response = await fetch(`${config.AI_SERVICE_URL}/suggest-redline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: id,
          tenantId: authReq.tenantId,
          clauseType: body.clauseType,
          jurisdiction: body.jurisdiction,
        }),
      });

      if (!response.ok) {
        throw new Error('AI service error');
      }

      const suggestions = await response.json();
      return { success: true, data: suggestions };
    } catch (error) {
      logger.error({ error }, 'Failed to get AI suggestions');
      return reply.status(500).send({ success: false, error: { message: 'Failed to generate suggestions' } });
    }
  });

  // POST /api/documents/:id/export - Export document as DOCX
  fastify.post('/api/documents/:id/export', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = z.object({
      format: z.enum(['docx', 'pdf']).default('docx'),
      includeRedlines: z.boolean().default(true),
      includeComments: z.boolean().default(true),
    }).parse(request.body);

    const document = await queryOne<{ id: string; source_name: string; file_uri: string }>(
      `SELECT id, source_name, file_uri FROM documents WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!document) {
      return reply.status(404).send({ success: false, error: { message: 'Document not found' } });
    }

    // For now, return download URL to original file
    // Full implementation would generate DOCX with redlines
    const storage = await import('./storage.js');
    const url = await storage.getSignedDownloadUrl(document.file_uri, 3600);

    return { success: true, data: { downloadUrl: url, format: body.format } };
  });

  // GET /api/documents/:id/flags - Get flags for a document
  fastify.get('/api/documents/:id/flags', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const documentFlags = await query<{
      id: string;
      severity: string;
      flag_type: string;
      message: string;
      clause_type: string | null;
      suggested_edit: string | null;
      status: string;
      created_at: Date;
    }>(
      `SELECT id, severity, flag_type, message, clause_type, suggested_edit, status, created_at
       FROM flags WHERE document_id = $1 AND tenant_id = $2
       ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END`,
      [id, authReq.tenantId]
    );

    return { success: true, data: documentFlags.rows };
  });

  // GET /api/documents/:id/obligations - Get obligations from a document
  fastify.get('/api/documents/:id/obligations', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const documentObligations = await query<{
      id: string;
      obligation_type: string;
      description: string;
      responsible_party: string;
      deadline: Date | null;
      status: string;
      priority: string;
    }>(
      `SELECT id, obligation_type, description, responsible_party, deadline, status, priority
       FROM obligations WHERE document_id = $1 AND tenant_id = $2
       ORDER BY deadline NULLS LAST`,
      [id, authReq.tenantId]
    );

    return { success: true, data: documentObligations.rows };
  });

  // ============================================================
  // MATTER ADDITIONAL ROUTES
  // ============================================================

  // DELETE /api/matters/:id - Delete/archive matter
  fastify.delete('/api/matters/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const existing = await queryOne<{ id: string; status: string }>(
      `SELECT id, status FROM matters WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!existing) {
      return reply.status(404).send({ success: false, error: { message: 'Matter not found' } });
    }

    // Soft delete - set to archived
    await query(
      `UPDATE matters SET status = 'archived', updated_at = NOW() WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    await query(
      `INSERT INTO audit_events (tenant_id, actor_attorney_id, event_type, object_type, object_id)
       VALUES ($1, $2, 'matter.archived', 'matter', $3)`,
      [authReq.tenantId, authReq.attorneyId, id]
    );

    return { success: true };
  });

  // GET /api/matters/:id/timeline - Get matter timeline events
  fastify.get('/api/matters/:id/timeline', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const queryParams = request.query as { limit?: string };
    const limit = Math.min(Number.parseInt(queryParams.limit || '50', 10), 100);

    const timeline = await query<{
      id: string;
      event_type: string;
      object_type: string | null;
      object_id: string | null;
      actor_attorney_id: string | null;
      metadata: unknown;
      created_at: Date;
    }>(
      `SELECT ae.id, ae.event_type, ae.object_type, ae.object_id, ae.actor_attorney_id, ae.metadata, ae.created_at
       FROM audit_events ae
       WHERE ae.tenant_id = $1 AND (
         (ae.object_type = 'matter' AND ae.object_id = $2) OR
         ae.object_id IN (SELECT id::text FROM documents WHERE matter_id = $2) OR
         ae.object_id IN (SELECT id::text FROM flags WHERE matter_id = $2)
       )
       ORDER BY ae.created_at DESC
       LIMIT $3`,
      [authReq.tenantId, id, limit]
    );

    return { success: true, data: timeline.rows };
  });

  // GET /api/matters/:id/analytics - Get matter-specific analytics
  fastify.get('/api/matters/:id/analytics', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    // Verify matter exists
    const matter = await queryOne<{ id: string }>(
      `SELECT id FROM matters WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!matter) {
      return reply.status(404).send({ success: false, error: { message: 'Matter not found' } });
    }

    const analytics = await queryOne<{
      total_documents: number;
      processed_documents: number;
      total_clauses: number;
      total_flags: number;
      open_flags: number;
      critical_flags: number;
      high_flags: number;
      medium_flags: number;
      low_flags: number;
      total_obligations: number;
      overdue_obligations: number;
    }>(
      `SELECT 
         (SELECT COUNT(*) FROM documents WHERE matter_id = $1 AND tenant_id = $2) as total_documents,
         (SELECT COUNT(*) FROM documents WHERE matter_id = $1 AND tenant_id = $2 AND ingestion_status = 'normalized') as processed_documents,
         (SELECT COUNT(*) FROM clauses WHERE matter_id = $1 AND tenant_id = $2) as total_clauses,
         (SELECT COUNT(*) FROM flags WHERE matter_id = $1 AND tenant_id = $2) as total_flags,
         (SELECT COUNT(*) FROM flags WHERE matter_id = $1 AND tenant_id = $2 AND status = 'open') as open_flags,
         (SELECT COUNT(*) FROM flags WHERE matter_id = $1 AND tenant_id = $2 AND status = 'open' AND severity = 'critical') as critical_flags,
         (SELECT COUNT(*) FROM flags WHERE matter_id = $1 AND tenant_id = $2 AND status = 'open' AND severity = 'high') as high_flags,
         (SELECT COUNT(*) FROM flags WHERE matter_id = $1 AND tenant_id = $2 AND status = 'open' AND severity = 'medium') as medium_flags,
         (SELECT COUNT(*) FROM flags WHERE matter_id = $1 AND tenant_id = $2 AND status = 'open' AND severity = 'low') as low_flags,
         (SELECT COUNT(*) FROM obligations WHERE matter_id = $1 AND tenant_id = $2) as total_obligations,
         (SELECT COUNT(*) FROM obligations WHERE matter_id = $1 AND tenant_id = $2 AND status = 'overdue') as overdue_obligations`,
      [id, authReq.tenantId]
    );

    return {
      success: true,
      data: {
        totalDocuments: analytics?.total_documents || 0,
        processedDocuments: analytics?.processed_documents || 0,
        processingQueue: (analytics?.total_documents || 0) - (analytics?.processed_documents || 0),
        totalClauses: analytics?.total_clauses || 0,
        totalFlags: analytics?.total_flags || 0,
        openFlags: analytics?.open_flags || 0,
        flagsByRisk: {
          critical: analytics?.critical_flags || 0,
          high: analytics?.high_flags || 0,
          medium: analytics?.medium_flags || 0,
          low: analytics?.low_flags || 0,
        },
        totalObligations: analytics?.total_obligations || 0,
        overdueObligations: analytics?.overdue_obligations || 0,
      },
    };
  });

  // POST /api/matters/:id/share-links - Create client portal share link
  fastify.post('/api/matters/:id/share-links', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = z.object({
      accessLevel: z.enum(['read', 'comment']).default('read'),
      expiresInDays: z.number().min(1).max(90).default(7),
      maxViews: z.number().min(1).max(1000).optional(),
      watermarkText: z.string().optional(),
    }).parse(request.body);

    // Verify matter exists
    const matter = await queryOne<{ id: string }>(
      `SELECT id FROM matters WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!matter) {
      return reply.status(404).send({ success: false, error: { message: 'Matter not found' } });
    }

    const token = generateSecureToken(32);
    const tokenHash = hashToken(token);
    const expiresAt = new Date(Date.now() + body.expiresInDays * 24 * 60 * 60 * 1000);

    const shareLink = await queryOne<{ id: string }>(
      `INSERT INTO share_links (tenant_id, matter_id, token_hash, access_level, watermark_text, expires_at, max_views, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [authReq.tenantId, id, tokenHash, body.accessLevel, body.watermarkText || null, expiresAt, body.maxViews || 50, authReq.attorneyId]
    );

    const portalUrl = `${config.FRONTEND_URL}/portal/${token}`;

    return reply.status(201).send({
      success: true,
      data: {
        id: shareLink?.id,
        url: portalUrl,
        expiresAt,
        accessLevel: body.accessLevel,
      },
    });
  });

  // POST /api/matters/:id/report - Generate executive report
  fastify.post('/api/matters/:id/report', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = z.object({
      format: z.enum(['pdf', 'docx']).default('pdf'),
      sections: z.array(z.enum(['summary', 'flags', 'clauses', 'obligations', 'timeline'])).default(['summary', 'flags', 'clauses']),
    }).parse(request.body);

    // Verify matter exists
    const matter = await queryOne<{ id: string; matter_name: string }>(
      `SELECT id, matter_name FROM matters WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!matter) {
      return reply.status(404).send({ success: false, error: { message: 'Matter not found' } });
    }

    // Queue report generation job
    const { addJob } = await import('./worker.js');
    const job = await addJob('report.generate', {
      tenantId: authReq.tenantId,
      matterId: id,
      requestedBy: authReq.attorneyId,
      format: body.format,
      sections: body.sections,
    });

    return {
      success: true,
      data: {
        jobId: job.id,
        message: 'Report generation started. You will be notified when ready.',
      },
    };
  });

  // ============================================================
  // OBLIGATION ROUTES
  // ============================================================

  // GET /api/obligations - List all obligations for tenant
  fastify.get('/api/obligations', { preHandler: authenticateRequest }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const queryParams = request.query as { status?: string; page?: string; limit?: string };
    
    const page = Number.parseInt(queryParams.page || '1', 10);
    const limit = Math.min(Number.parseInt(queryParams.limit || '20', 10), 100);
    const offset = (page - 1) * limit;

    let whereClause = 'WHERE o.tenant_id = $1';
    const params: unknown[] = [authReq.tenantId];

    if (queryParams.status) {
      whereClause += ' AND o.status = $2';
      params.push(queryParams.status);
    }

    const obligations = await query<{
      id: string;
      matter_id: string;
      matter_name: string;
      document_id: string;
      obligation_type: string;
      description: string;
      responsible_party: string;
      deadline: Date | null;
      status: string;
      priority: string;
    }>(
      `SELECT o.id, o.matter_id, m.matter_name, o.document_id, o.obligation_type, 
              o.description, o.responsible_party, o.deadline, o.status, o.priority
       FROM obligations o
       JOIN matters m ON o.matter_id = m.id
       ${whereClause}
       ORDER BY o.deadline NULLS LAST
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return { success: true, data: obligations.rows };
  });

  // POST /api/obligations - Create manual obligation
  fastify.post('/api/obligations', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const body = z.object({
      matterId: z.string().uuid(),
      documentId: z.string().uuid().optional(),
      obligationType: z.string(),
      description: z.string(),
      responsibleParty: z.enum(['client', 'counterparty', 'both', 'third_party']),
      deadline: z.string().optional(),
      priority: z.enum(['low', 'normal', 'high', 'critical']).default('normal'),
      reminderDaysBefore: z.array(z.number()).optional(),
    }).parse(request.body);

    // Verify matter access
    const matter = await queryOne<{ id: string }>(
      `SELECT id FROM matters WHERE id = $1 AND tenant_id = $2`,
      [body.matterId, authReq.tenantId]
    );

    if (!matter) {
      return reply.status(404).send({ success: false, error: { message: 'Matter not found' } });
    }

    const obligation = await queryOne<{ id: string }>(
      `INSERT INTO obligations (tenant_id, matter_id, document_id, obligation_type, description, 
                                responsible_party, deadline, priority, reminder_days_before)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [
        authReq.tenantId,
        body.matterId,
        body.documentId || null,
        body.obligationType,
        body.description,
        body.responsibleParty,
        body.deadline || null,
        body.priority,
        body.reminderDaysBefore || [7, 3, 1],
      ]
    );

    return reply.status(201).send({ success: true, data: { id: obligation?.id } });
  });

  // PATCH /api/obligations/:id - Update obligation
  fastify.patch('/api/obligations/:id', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };
    const body = z.object({
      status: z.enum(['pending', 'in_progress', 'completed', 'overdue', 'waived']).optional(),
      priority: z.enum(['low', 'normal', 'high', 'critical']).optional(),
      deadline: z.string().optional(),
      notes: z.string().optional(),
    }).parse(request.body);

    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM obligations WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!existing) {
      return reply.status(404).send({ success: false, error: { message: 'Obligation not found' } });
    }

    const updates: string[] = ['updated_at = NOW()'];
    const values: unknown[] = [];
    let paramIndex = 1;

    if (body.status) {
      updates.push(`status = $${paramIndex}`);
      values.push(body.status);
      paramIndex++;
      if (body.status === 'completed') {
        updates.push(`completed_at = NOW()`);
        updates.push(`completed_by = $${paramIndex}`);
        values.push(authReq.attorneyId);
        paramIndex++;
      }
    }
    if (body.priority) { updates.push(`priority = $${paramIndex}`); values.push(body.priority); paramIndex++; }
    if (body.deadline) { updates.push(`deadline = $${paramIndex}`); values.push(body.deadline); paramIndex++; }
    if (body.notes !== undefined) { updates.push(`notes = $${paramIndex}`); values.push(body.notes); paramIndex++; }

    values.push(id, authReq.tenantId);

    await query(
      `UPDATE obligations SET ${updates.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}`,
      values
    );

    return { success: true };
  });

  // POST /api/obligations/:id/calendar - Export obligation as iCal
  fastify.post('/api/obligations/:id/calendar', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const obligation = await queryOne<{
      id: string;
      description: string;
      deadline: Date | null;
      matter_name: string;
    }>(
      `SELECT o.id, o.description, o.deadline, m.matter_name
       FROM obligations o
       JOIN matters m ON o.matter_id = m.id
       WHERE o.id = $1 AND o.tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!obligation) {
      return reply.status(404).send({ success: false, error: { message: 'Obligation not found' } });
    }

    if (!obligation.deadline) {
      return reply.status(400).send({ success: false, error: { message: 'Obligation has no deadline' } });
    }

    // Generate iCal format
    const icalDate = `${new Date(obligation.deadline).toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//LexOS//Legal Platform//EN
BEGIN:VEVENT
UID:${obligation.id}@lexos.law
DTSTAMP:${icalDate}
DTSTART:${icalDate}
SUMMARY:${obligation.matter_name} - ${obligation.description}
DESCRIPTION:Legal obligation from LexOS
END:VEVENT
END:VCALENDAR`;

    reply.header('Content-Type', 'text/calendar');
    reply.header('Content-Disposition', `attachment; filename="obligation-${id}.ics"`);
    return reply.send(ical);
  });

  // GET /api/obligations/:id/remind - Send reminder for obligation
  fastify.get('/api/obligations/:id/remind', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const obligation = await queryOne<{
      id: string;
      description: string;
      deadline: Date | null;
      matter_id: string;
    }>(
      `SELECT id, description, deadline, matter_id FROM obligations 
       WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (!obligation) {
      return reply.status(404).send({ success: false, error: { message: 'Obligation not found' } });
    }

    // Queue reminder email job
    const { addJob } = await import('./worker.js');
    await addJob('obligation.remind', {
      tenantId: authReq.tenantId,
      obligationId: id,
      matterId: obligation.matter_id,
    });

    // Update last reminder sent
    await query(
      `UPDATE obligations SET last_reminder_sent_at = NOW() WHERE id = $1`,
      [id]
    );

    return { success: true, data: { message: 'Reminder sent' } };
  });

  // ============================================================
  // ANALYTICS ADDITIONAL ROUTES
  // ============================================================

  // GET /api/analytics/attorneys - Attorney productivity metrics
  fastify.get(
    '/api/analytics/attorneys',
    { preHandler: [authenticateRequest, requireRoles('admin', 'partner')] },
    async (request) => {
      const authReq = request as AuthenticatedRequest;

      const attorneys = await query<{
        id: string;
        display_name: string;
        role: string;
        matters_count: number;
        documents_reviewed: number;
        flags_resolved: number;
      }>(
        `SELECT a.id, a.display_name, a.role,
                (SELECT COUNT(*) FROM matters WHERE lead_attorney_id = a.id) as matters_count,
                (SELECT COUNT(*) FROM review_actions WHERE attorney_id = a.id) as documents_reviewed,
                (SELECT COUNT(*) FROM flags WHERE reviewed_by = a.id AND status != 'open') as flags_resolved
         FROM attorneys a
         WHERE a.tenant_id = $1 AND a.status = 'active'
         ORDER BY matters_count DESC`,
        [authReq.tenantId]
      );

      return { success: true, data: attorneys.rows };
    }
  );

  // ============================================================
  // AI ROUTES
  // ============================================================

  // GET /api/ai/models - List available AI models
  fastify.get('/api/ai/models', { preHandler: [authenticateRequest, requireRoles('admin')] }, async (request, reply) => {
    try {
      const response = await fetch(`${config.AI_SERVICE_URL}/models`);
      if (!response.ok) throw new Error('AI service unavailable');
      const models = await response.json();
      return { success: true, data: models };
    } catch (error) {
      return reply.status(503).send({ success: false, error: { message: 'AI service unavailable' } });
    }
  });

  // GET /api/ai/costs - Get AI usage costs
  fastify.get('/api/ai/costs', { preHandler: [authenticateRequest, requireRoles('admin')] }, async (request) => {
    const authReq = request as AuthenticatedRequest;
    const queryParams = request.query as { startDate?: string; endDate?: string };

    const startDate = queryParams.startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = queryParams.endDate || new Date().toISOString();

    const costs = await query<{
      model: string;
      total_tokens: number;
      total_requests: number;
      estimated_cost_cents: number;
    }>(
      `SELECT model, SUM(tokens_used) as total_tokens, COUNT(*) as total_requests,
              SUM(estimated_cost_cents) as estimated_cost_cents
       FROM ai_model_events
       WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
       GROUP BY model`,
      [authReq.tenantId, startDate, endDate]
    );

    return { success: true, data: costs.rows };
  });

  // ============================================================
  // WEBHOOK ROUTES
  // ============================================================

  // GET /api/webhooks - List webhooks
  fastify.get('/api/webhooks', { preHandler: [authenticateRequest, requireRoles('admin')] }, async (request) => {
    const authReq = request as AuthenticatedRequest;

    const webhooks = await query<{
      id: string;
      url: string;
      events: string[];
      is_active: boolean;
      last_triggered_at: Date | null;
      created_at: Date;
    }>(
      `SELECT id, url, events, is_active, last_triggered_at, created_at
       FROM webhooks WHERE tenant_id = $1
       ORDER BY created_at DESC`,
      [authReq.tenantId]
    );

    return { success: true, data: webhooks.rows };
  });

  // POST /api/webhooks - Create webhook
  fastify.post('/api/webhooks', { preHandler: [authenticateRequest, requireRoles('admin')] }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const body = z.object({
      url: z.string().url(),
      events: z.array(z.string()).min(1),
    }).parse(request.body);

    const secret = generateSecureToken(32);
    const webhook = await queryOne<{ id: string }>(
      `INSERT INTO webhooks (tenant_id, url, events, secret)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [authReq.tenantId, body.url, body.events, secret]
    );

    return reply.status(201).send({
      success: true,
      data: { id: webhook?.id, secret },
    });
  });

  // DELETE /api/webhooks/:id - Delete webhook
  fastify.delete('/api/webhooks/:id', { preHandler: [authenticateRequest, requireRoles('admin')] }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const { id } = request.params as { id: string };

    const result = await query(
      `DELETE FROM webhooks WHERE id = $1 AND tenant_id = $2`,
      [id, authReq.tenantId]
    );

    if (result.rowCount === 0) {
      return reply.status(404).send({ success: false, error: { message: 'Webhook not found' } });
    }

    return { success: true };
  });

  // ============================================================
  // BILLING ADDITIONAL ROUTES
  // ============================================================

  // POST /billing/portal - Create Stripe Customer Portal session
  fastify.post(
    '/billing/portal',
    { preHandler: [authenticateRequest, requireRoles('admin')] },
    async (request, reply) => {
      const authReq = request as AuthenticatedRequest;
      const body = z.object({
        returnUrl: z.string().url(),
      }).parse(request.body);

      try {
        const { createCustomerPortalSession } = await import('./billing.js');
        const session = await createCustomerPortalSession(authReq.tenantId, body.returnUrl);
        return { success: true, data: { url: session.url } };
      } catch (error) {
        logger.error({ error }, 'Failed to create portal session');
        return reply.status(500).send({ success: false, error: { message: 'Billing portal unavailable' } });
      }
    }
  );

  // ============================================================
  // AUTH ADDITIONAL ROUTES
  // ============================================================

  // POST /auth/exchange - Accept invitation and create account
  fastify.post('/auth/exchange', async (request, reply) => {
    const body = z.object({
      token: z.string(),
      email: z.string().email(),
      password: z.string().min(12),
      displayName: z.string().min(1),
    }).parse(request.body);

    const tokenHash = hashToken(body.token);
    const invitation = await queryOne<{
      id: string;
      tenant_id: string;
      email: string;
      role: string;
      expires_at: Date;
      status: string;
    }>(
      `SELECT id, tenant_id, email, role, expires_at, status
       FROM invitations WHERE token_hash = $1`,
      [tokenHash]
    );

    if (!invitation) {
      return reply.status(400).send({ success: false, error: { message: 'Invalid invitation' } });
    }

    if (invitation.status !== 'pending' || new Date(invitation.expires_at) < new Date()) {
      return reply.status(400).send({ success: false, error: { message: 'Invitation expired' } });
    }

    if (invitation.email.toLowerCase() !== body.email.toLowerCase()) {
      return reply.status(400).send({ success: false, error: { message: 'Email does not match invitation' } });
    }

    // Validate password
    const validation = validatePasswordPolicy(body.password);
    if (!validation.valid) {
      return reply.status(400).send({
        success: false,
        error: { code: 'INVALID_PASSWORD', message: validation.errors.join(', ') },
      });
    }

    const passwordHash = await hashPassword(body.password);

    const attorney = await withTransaction(async (tx) => {
      // Create attorney
      const newAttorney = await tx.queryOne<{ id: string }>(
        `INSERT INTO attorneys (tenant_id, email, display_name, password_hash, role, status)
         VALUES ($1, $2, $3, $4, $5, 'active')
         RETURNING id`,
        [invitation.tenant_id, body.email.toLowerCase(), body.displayName, passwordHash, invitation.role]
      );

      // Mark invitation as accepted
      await tx.query(
        `UPDATE invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [invitation.id]
      );

      return newAttorney;
    });

    if (!attorney) {
      return reply.status(500).send({ success: false, error: { message: 'Failed to create attorney' } });
    }

    // Generate tokens and login
    const tokenId = generateSecureToken(16);
    const accessToken = await generateAccessToken({
      sub: attorney.id,
      tenantId: invitation.tenant_id,
      email: body.email,
      role: invitation.role,
    });

    const newRefreshToken = await generateRefreshToken({
      sub: attorney.id,
      tenantId: invitation.tenant_id,
      email: body.email,
      role: invitation.role,
      tokenId,
    });

    await query(
      `INSERT INTO refresh_tokens (attorney_id, tenant_id, token_hash, user_agent, ip_address)
       VALUES ($1, $2, $3, $4, $5)`,
      [attorney.id, invitation.tenant_id, hashToken(newRefreshToken), request.headers['user-agent'], request.ip]
    );

    reply.setCookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: config.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60,
    });

    return reply.status(201).send({
      success: true,
      data: {
        accessToken,
        attorney: {
          id: attorney.id,
          tenantId: invitation.tenant_id,
          email: body.email,
          displayName: body.displayName,
          role: invitation.role,
        },
      },
    });
  });

  // ============================================================
  // REVIEW ROUTES
  // ============================================================

  // POST /api/review/feedback - Submit feedback on clause/suggestion
  fastify.post('/api/review/feedback', { preHandler: authenticateRequest }, async (request, reply) => {
    const authReq = request as AuthenticatedRequest;
    const body = z.object({
      clauseId: z.string().uuid().optional(),
      suggestionId: z.string().uuid().optional(),
      action: z.enum(['approve', 'reject', 'modify']),
      notes: z.string().optional(),
      modifiedText: z.string().optional(),
    }).parse(request.body);

    if (!body.clauseId && !body.suggestionId) {
      return reply.status(400).send({ success: false, error: { message: 'Either clauseId or suggestionId required' } });
    }

    if (body.suggestionId) {
      // Update clause suggestion
      const statusMap = { approve: 'accepted', reject: 'rejected', modify: 'modified' } as const;
      await query(
        `UPDATE clause_suggestions 
         SET status = $1, reviewed_by = $2, reviewed_at = NOW(), review_notes = $3, final_text = $4
         WHERE id = $5 AND tenant_id = $6`,
        [statusMap[body.action], authReq.attorneyId, body.notes || null, body.modifiedText || null, body.suggestionId, authReq.tenantId]
      );
    }

    if (body.clauseId) {
      // Update clause reviewer status
      const statusMap = { approve: 'approved', reject: 'rejected', modify: 'modified' } as const;
      await query(
        `UPDATE clauses SET reviewer_status = $1 WHERE id = $2 AND tenant_id = $3`,
        [statusMap[body.action], body.clauseId, authReq.tenantId]
      );
    }

    // Log review action
    await query(
      `INSERT INTO review_actions (tenant_id, attorney_id, object_type, object_id, action, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        authReq.tenantId,
        authReq.attorneyId,
        body.suggestionId ? 'suggestion' : 'clause',
        body.suggestionId || body.clauseId,
        body.action,
        body.notes || null,
      ]
    );

    return { success: true };
  });

  logger.info('Routes registered');
}
