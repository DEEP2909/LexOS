/**
 * LexOS Repository Layer
 * All SQL queries with explicit column enumeration.
 * NEVER use SELECT * - always enumerate columns.
 * EVERY query MUST include tenant_id filter.
 */

import { pool, withTransaction } from './database.js';
import type {
  Attorney,
  Matter,
  Document,
  Clause,
  Flag,
  Obligation,
  Playbook,
  AuditEvent,
  RiskLevel,
} from '@lexos/shared';

// ============================================================================
// Column Constants - NEVER use SELECT *
// ============================================================================

const TENANT_COLS = `id, name, slug, plan, region, bar_state, subscription_status, 
  trial_ends_at, stripe_customer_id, stripe_subscription_id, logo_url, settings, created_at`;

const ATTORNEY_COLS = `id, tenant_id, email, display_name, role, practice_group, 
  bar_number, bar_state, mfa_enabled, failed_login_attempts, locked_until, 
  last_login_at, preferred_language, status, created_at`;

const MATTER_COLS = `id, tenant_id, matter_code, matter_name, matter_type, client_name, 
  counterparty_name, governing_law_state, status, priority, health_score, lead_attorney_id, 
  target_close_date, deal_value_cents, notes, tags, created_by, created_at, updated_at`;

const DOCUMENT_COLS = `id, tenant_id, matter_id, source_name, mime_type, doc_type, 
  ingestion_status, security_status, file_uri, sha256, normalized_text, page_count, 
  word_count, ocr_engine, ocr_confidence, privilege_score, language, extraction_model, 
  created_by, created_at, updated_at`;

const CLAUSE_COLS = `id, tenant_id, document_id, clause_type, heading, text_excerpt, 
  page_from, page_to, risk_level, confidence, risk_factors, extraction_model, 
  reviewer_status, reviewer_id, reviewed_at, reviewer_note, created_at`;

const FLAG_COLS = `id, tenant_id, matter_id, document_id, clause_id, flag_type, severity, 
  reason, playbook_rule, recommended_fix, status, assigned_to, resolved_by, resolved_at, 
  resolution_note, assessment_model, created_at`;

const OBLIGATION_COLS = `id, tenant_id, matter_id, document_id, clause_id, obligation_type, 
  party, description, deadline_date, deadline_text, notice_days, recurrence_rule, status, 
  assigned_to, notes, created_at`;

const PLAYBOOK_COLS = `id, tenant_id, name, description, practice_area, rules, is_active, 
  created_by, created_at`;

const AUDIT_COLS = `id, tenant_id, actor_attorney_id, actor_api_key_id, event_type, 
  object_type, object_id, ip_address, user_agent, metadata, created_at`;

// ============================================================================
// Tenant Repository
// ============================================================================

export const tenantRepo = {
  async findById(id: string) {
    const result = await pool.query(
      `SELECT ${TENANT_COLS} FROM tenants WHERE id = $1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async findBySlug(slug: string) {
    const result = await pool.query(
      `SELECT ${TENANT_COLS} FROM tenants WHERE slug = $1`,
      [slug]
    );
    return result.rows[0] || null;
  },

  async create(data: {
    name: string;
    slug: string;
    plan?: string;
    barState?: string;
  }) {
    const result = await pool.query(
      `INSERT INTO tenants (name, slug, plan, bar_state, trial_ends_at)
       VALUES ($1, $2, $3, $4, now() + INTERVAL '14 days')
       RETURNING ${TENANT_COLS}`,
      [data.name, data.slug, data.plan || 'starter', data.barState]
    );
    return result.rows[0];
  },

  async updateStripeIds(tenantId: string, customerId: string, subscriptionId: string) {
    await pool.query(
      `UPDATE tenants SET stripe_customer_id = $2, stripe_subscription_id = $3
       WHERE id = $1`,
      [tenantId, customerId, subscriptionId]
    );
  },
};

// ============================================================================
// Attorney Repository
// ============================================================================

export const attorneyRepo = {
  async findById(tenantId: string, id: string): Promise<Attorney | null> {
    const result = await pool.query(
      `SELECT ${ATTORNEY_COLS} FROM attorneys 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] || null;
  },

  async findByEmail(tenantId: string, email: string) {
    const result = await pool.query(
      `SELECT ${ATTORNEY_COLS}, password_hash, mfa_secret, mfa_recovery_codes
       FROM attorneys 
       WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email.toLowerCase()]
    );
    return result.rows[0] || null;
  },

  async findByEmailGlobal(email: string) {
    const result = await pool.query(
      `SELECT a.*, t.slug as tenant_slug
       FROM attorneys a
       JOIN tenants t ON a.tenant_id = t.id
       WHERE a.email = $1`,
      [email.toLowerCase()]
    );
    return result.rows;
  },

  async create(tenantId: string, data: {
    email: string;
    displayName: string;
    passwordHash: string;
    role?: string;
    barNumber?: string;
    barState?: string;
  }) {
    const result = await pool.query(
      `INSERT INTO attorneys (tenant_id, email, display_name, password_hash, role, bar_number, bar_state)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING ${ATTORNEY_COLS}`,
      [tenantId, data.email.toLowerCase(), data.displayName, data.passwordHash, 
       data.role || 'attorney', data.barNumber, data.barState]
    );
    return result.rows[0];
  },

  async updatePassword(tenantId: string, attorneyId: string, passwordHash: string) {
    await pool.query(
      `UPDATE attorneys SET password_hash = $3, failed_login_attempts = 0, locked_until = NULL
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, attorneyId, passwordHash]
    );
  },

  async incrementFailedLogins(tenantId: string, attorneyId: string) {
    await pool.query(
      `UPDATE attorneys 
       SET failed_login_attempts = failed_login_attempts + 1,
           locked_until = CASE WHEN failed_login_attempts >= 4 THEN now() + INTERVAL '15 minutes' ELSE locked_until END
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, attorneyId]
    );
  },

  async resetLoginAttempts(tenantId: string, attorneyId: string) {
    await pool.query(
      `UPDATE attorneys SET failed_login_attempts = 0, locked_until = NULL, last_login_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, attorneyId]
    );
  },

  async setupMfa(tenantId: string, attorneyId: string, secret: string, recoveryCodes: string[]) {
    await pool.query(
      `UPDATE attorneys SET mfa_enabled = TRUE, mfa_secret = $3, mfa_recovery_codes = $4
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, attorneyId, secret, recoveryCodes]
    );
  },

  async disableMfa(tenantId: string, attorneyId: string) {
    await pool.query(
      `UPDATE attorneys SET mfa_enabled = FALSE, mfa_secret = NULL, mfa_recovery_codes = NULL
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, attorneyId]
    );
  },

  async list(tenantId: string, options: { limit?: number; offset?: number } = {}) {
    const { limit = 50, offset = 0 } = options;
    const result = await pool.query(
      `SELECT ${ATTORNEY_COLS} FROM attorneys 
       WHERE tenant_id = $1 
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    );
    return result.rows;
  },
};

// ============================================================================
// Matter Repository
// ============================================================================

export const matterRepo = {
  async findById(tenantId: string, id: string): Promise<Matter | null> {
    const result = await pool.query(
      `SELECT ${MATTER_COLS} FROM matters 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] || null;
  },

  async list(tenantId: string, options: {
    status?: string;
    search?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { status, search, limit = 50, offset = 0 } = options;
    const params: any[] = [tenantId];
    let whereClause = 'WHERE tenant_id = $1';
    let paramIndex = 2;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (search) {
      whereClause += ` AND (matter_name ILIKE $${paramIndex} OR client_name ILIKE $${paramIndex})`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    params.push(limit, offset);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM matters ${whereClause}`,
      params.slice(0, -2)
    );

    const result = await pool.query(
      `SELECT ${MATTER_COLS} FROM matters 
       ${whereClause}
       ORDER BY updated_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return {
      items: result.rows,
      total: Number.parseInt(countResult.rows[0].count),
    };
  },

  async create(tenantId: string, data: {
    matterCode: string;
    matterName: string;
    matterType: string;
    clientName: string;
    counterpartyName?: string;
    governingLawState?: string;
    leadAttorneyId?: string;
    createdBy: string;
  }) {
    const result = await pool.query(
      `INSERT INTO matters (tenant_id, matter_code, matter_name, matter_type, client_name, 
        counterparty_name, governing_law_state, lead_attorney_id, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING ${MATTER_COLS}`,
      [tenantId, data.matterCode, data.matterName, data.matterType, data.clientName,
       data.counterpartyName, data.governingLawState, data.leadAttorneyId, data.createdBy]
    );
    return result.rows[0];
  },

  async update(tenantId: string, id: string, data: Partial<{
    matterName: string;
    status: string;
    priority: string;
    healthScore: number;
    notes: string;
  }>) {
    const updates: string[] = [];
    const params: any[] = [tenantId, id];
    let paramIndex = 3;

    if (data.matterName !== undefined) {
      updates.push(`matter_name = $${paramIndex++}`);
      params.push(data.matterName);
    }
    if (data.status !== undefined) {
      updates.push(`status = $${paramIndex++}`);
      params.push(data.status);
    }
    if (data.priority !== undefined) {
      updates.push(`priority = $${paramIndex++}`);
      params.push(data.priority);
    }
    if (data.healthScore !== undefined) {
      updates.push(`health_score = $${paramIndex++}`);
      params.push(data.healthScore);
    }
    if (data.notes !== undefined) {
      updates.push(`notes = $${paramIndex++}`);
      params.push(data.notes);
    }

    updates.push('updated_at = now()');

    const result = await pool.query(
      `UPDATE matters SET ${updates.join(', ')}
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${MATTER_COLS}`,
      params
    );
    return result.rows[0];
  },

  async delete(tenantId: string, id: string) {
    await pool.query(
      `UPDATE matters SET status = 'archived' WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
  },

  async getAnalytics(tenantId: string, matterId: string) {
    const result = await pool.query(
      `SELECT 
        (SELECT COUNT(*) FROM documents WHERE tenant_id = $1 AND matter_id = $2) as total_documents,
        (SELECT COUNT(*) FROM clauses c JOIN documents d ON c.document_id = d.id 
         WHERE c.tenant_id = $1 AND d.matter_id = $2) as total_clauses,
        (SELECT COUNT(*) FROM documents WHERE tenant_id = $1 AND matter_id = $2 
         AND ingestion_status IN ('uploaded', 'scanning', 'processing')) as processing_queue`,
      [tenantId, matterId]
    );

    const flagsResult = await pool.query(
      `SELECT severity, COUNT(*) as count FROM flags 
       WHERE tenant_id = $1 AND matter_id = $2 AND status = 'open'
       GROUP BY severity`,
      [tenantId, matterId]
    );

    const flagsByRisk: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const row of flagsResult.rows as Array<{ severity: string; count: string }>) {
      flagsByRisk[row.severity] = Number.parseInt(row.count);
    }

    return {
      totalDocuments: Number.parseInt(result.rows[0].total_documents),
      totalClauses: Number.parseInt(result.rows[0].total_clauses),
      processingQueue: Number.parseInt(result.rows[0].processing_queue),
      flagsByRisk,
    };
  },
};

// ============================================================================
// Document Repository
// ============================================================================

export const documentRepo = {
  async findById(tenantId: string, id: string): Promise<Document | null> {
    const result = await pool.query(
      `SELECT ${DOCUMENT_COLS} FROM documents 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] || null;
  },

  async findBySha256(tenantId: string, sha256: string) {
    const result = await pool.query(
      `SELECT ${DOCUMENT_COLS} FROM documents 
       WHERE tenant_id = $1 AND sha256 = $2`,
      [tenantId, sha256]
    );
    return result.rows[0] || null;
  },

  async list(tenantId: string, matterId: string, options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { status, limit = 50, offset = 0 } = options;
    const params: any[] = [tenantId, matterId];
    let whereClause = 'WHERE tenant_id = $1 AND matter_id = $2';

    if (status) {
      whereClause += ' AND ingestion_status = $3';
      params.push(status);
    }

    params.push(limit, offset);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM documents ${whereClause}`,
      params.slice(0, -2)
    );

    const result = await pool.query(
      `SELECT ${DOCUMENT_COLS} FROM documents 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    return {
      items: result.rows,
      total: Number.parseInt(countResult.rows[0].count),
    };
  },

  async create(tenantId: string, data: {
    matterId: string;
    sourceName: string;
    mimeType: string;
    docType: string;
    sha256: string;
    fileUri: string;
    createdBy: string;
  }) {
    const result = await pool.query(
      `INSERT INTO documents (tenant_id, matter_id, source_name, mime_type, doc_type, sha256, file_uri, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING ${DOCUMENT_COLS}`,
      [tenantId, data.matterId, data.sourceName, data.mimeType, data.docType, 
       data.sha256, data.fileUri, data.createdBy]
    );
    return result.rows[0];
  },

  async updateStatus(tenantId: string, id: string, status: string, securityStatus?: string) {
    const updates = ['ingestion_status = $3', 'updated_at = now()'];
    const params = [tenantId, id, status];

    if (securityStatus) {
      updates.push(`security_status = $4`);
      params.push(securityStatus);
    }

    await pool.query(
      `UPDATE documents SET ${updates.join(', ')} WHERE tenant_id = $1 AND id = $2`,
      params
    );
  },

  async updateAfterOcr(tenantId: string, id: string, data: {
    normalizedText: string;
    pageCount: number;
    wordCount: number;
    ocrEngine: string;
    ocrConfidence: number;
  }) {
    await pool.query(
      `UPDATE documents SET 
        normalized_text = $3, page_count = $4, word_count = $5,
        ocr_engine = $6, ocr_confidence = $7, ingestion_status = 'normalized', updated_at = now()
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, data.normalizedText, data.pageCount, data.wordCount, 
       data.ocrEngine, data.ocrConfidence]
    );
  },
};

// ============================================================================
// Clause Repository
// ============================================================================

export const clauseRepo = {
  async findById(tenantId: string, id: string): Promise<Clause | null> {
    const result = await pool.query(
      `SELECT ${CLAUSE_COLS} FROM clauses 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] || null;
  },

  async listByDocument(tenantId: string, documentId: string) {
    const result = await pool.query(
      `SELECT ${CLAUSE_COLS} FROM clauses 
       WHERE tenant_id = $1 AND document_id = $2
       ORDER BY page_from, created_at`,
      [tenantId, documentId]
    );
    return result.rows;
  },

  async listByMatter(tenantId: string, matterId: string, options: {
    clauseType?: string;
    riskLevel?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { clauseType, riskLevel, limit = 100, offset = 0 } = options;
    const params: any[] = [tenantId, matterId];
    let whereClause = 'WHERE c.tenant_id = $1 AND d.matter_id = $2';
    let paramIndex = 3;

    if (clauseType) {
      whereClause += ` AND c.clause_type = $${paramIndex++}`;
      params.push(clauseType);
    }
    if (riskLevel) {
      whereClause += ` AND c.risk_level = $${paramIndex++}`;
      params.push(riskLevel);
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT ${CLAUSE_COLS.split(',').map(c => `c.${c.trim()}`).join(', ')}, d.source_name as document_name
       FROM clauses c
       JOIN documents d ON c.document_id = d.id
       ${whereClause}
       ORDER BY c.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return result.rows;
  },

  async bulkCreate(tenantId: string, documentId: string, clauses: Array<{
    clauseType: string;
    heading?: string;
    textExcerpt: string;
    pageFrom?: number;
    pageTo?: number;
    riskLevel: RiskLevel;
    confidence: number;
    riskFactors: any[];
    extractionModel: string;
  }>) {
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const clause of clauses) {
      placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
        $${paramIndex++}, $${paramIndex++})`);
      values.push(
        tenantId, documentId, clause.clauseType, clause.heading, clause.textExcerpt,
        clause.pageFrom, clause.pageTo, clause.riskLevel, clause.confidence,
        JSON.stringify(clause.riskFactors), clause.extractionModel
      );
    }

    if (placeholders.length === 0) return [];

    const result = await pool.query(
      `INSERT INTO clauses (tenant_id, document_id, clause_type, heading, text_excerpt, 
        page_from, page_to, risk_level, confidence, risk_factors, extraction_model)
       VALUES ${placeholders.join(', ')}
       RETURNING ${CLAUSE_COLS}`,
      values
    );
    return result.rows;
  },

  async updateReviewStatus(tenantId: string, id: string, status: string, reviewerId: string, note?: string) {
    await pool.query(
      `UPDATE clauses SET reviewer_status = $3, reviewer_id = $4, reviewed_at = now(), reviewer_note = $5
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, status, reviewerId, note]
    );
  },
};

// ============================================================================
// Flag Repository
// ============================================================================

export const flagRepo = {
  async findById(tenantId: string, id: string): Promise<Flag | null> {
    const result = await pool.query(
      `SELECT ${FLAG_COLS} FROM flags 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] || null;
  },

  async listByMatter(tenantId: string, matterId: string, options: {
    documentId?: string;
    severity?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { documentId, severity, status, limit = 100, offset = 0 } = options;
    const params: any[] = [tenantId, matterId];
    let whereClause = 'WHERE tenant_id = $1 AND matter_id = $2';
    let paramIndex = 3;

    if (documentId) {
      whereClause += ` AND document_id = $${paramIndex++}`;
      params.push(documentId);
    }
    if (severity) {
      whereClause += ` AND severity = $${paramIndex++}`;
      params.push(severity);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    params.push(limit, offset);

    const countResult = await pool.query(
      `SELECT COUNT(*) FROM flags ${whereClause}`,
      params.slice(0, -2)
    );

    const result = await pool.query(
      `SELECT ${FLAG_COLS} FROM flags 
       ${whereClause}
       ORDER BY CASE severity WHEN 'critical' THEN 1 WHEN 'warn' THEN 2 ELSE 3 END, created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );

    return {
      items: result.rows,
      total: Number.parseInt(countResult.rows[0].count),
    };
  },

  async create(tenantId: string, data: {
    matterId: string;
    documentId?: string;
    clauseId?: string;
    flagType: string;
    severity: string;
    reason: string;
    playbookRule?: string;
    recommendedFix?: string;
    assessmentModel?: string;
  }) {
    const result = await pool.query(
      `INSERT INTO flags (tenant_id, matter_id, document_id, clause_id, flag_type, severity, 
        reason, playbook_rule, recommended_fix, assessment_model)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${FLAG_COLS}`,
      [tenantId, data.matterId, data.documentId, data.clauseId, data.flagType, data.severity,
       data.reason, data.playbookRule, data.recommendedFix, data.assessmentModel]
    );
    return result.rows[0];
  },

  async updateStatus(tenantId: string, id: string, status: string, resolvedBy?: string, note?: string) {
    await pool.query(
      `UPDATE flags SET status = $3, resolved_by = $4, resolved_at = now(), resolution_note = $5
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, status, resolvedBy, note]
    );
  },
};

// ============================================================================
// Obligation Repository
// ============================================================================

export const obligationRepo = {
  async findById(tenantId: string, id: string): Promise<Obligation | null> {
    const result = await pool.query(
      `SELECT ${OBLIGATION_COLS} FROM obligations 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] || null;
  },

  async listByMatter(tenantId: string, matterId: string, options: {
    party?: string;
    status?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { party, status, limit = 100, offset = 0 } = options;
    const params: any[] = [tenantId, matterId];
    let whereClause = 'WHERE tenant_id = $1 AND matter_id = $2';
    let paramIndex = 3;

    if (party) {
      whereClause += ` AND party = $${paramIndex++}`;
      params.push(party);
    }
    if (status) {
      whereClause += ` AND status = $${paramIndex++}`;
      params.push(status);
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT ${OBLIGATION_COLS} FROM obligations 
       ${whereClause}
       ORDER BY deadline_date ASC NULLS LAST, created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return result.rows;
  },

  async bulkCreate(tenantId: string, obligations: Array<{
    matterId: string;
    documentId?: string;
    clauseId?: string;
    obligationType: string;
    party?: string;
    description: string;
    deadlineDate?: Date;
    deadlineText?: string;
    noticeDays?: number;
    recurrenceRule?: string;
  }>) {
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const obl of obligations) {
      placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
        $${paramIndex++})`);
      values.push(
        tenantId, obl.matterId, obl.documentId, obl.clauseId, obl.obligationType,
        obl.party, obl.description, obl.deadlineDate, obl.deadlineText, obl.noticeDays
      );
    }

    if (placeholders.length === 0) return [];

    const result = await pool.query(
      `INSERT INTO obligations (tenant_id, matter_id, document_id, clause_id, obligation_type, 
        party, description, deadline_date, deadline_text, notice_days)
       VALUES ${placeholders.join(', ')}
       RETURNING ${OBLIGATION_COLS}`,
      values
    );
    return result.rows;
  },

  async updateStatus(tenantId: string, id: string, status: string) {
    await pool.query(
      `UPDATE obligations SET status = $3 WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id, status]
    );
  },
};

// ============================================================================
// Playbook Repository
// ============================================================================

export const playbookRepo = {
  async findById(tenantId: string, id: string): Promise<Playbook | null> {
    const result = await pool.query(
      `SELECT ${PLAYBOOK_COLS} FROM playbooks 
       WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    return result.rows[0] || null;
  },

  async findActive(tenantId: string, practiceArea?: string) {
    const params: any[] = [tenantId];
    let whereClause = 'WHERE tenant_id = $1 AND is_active = TRUE';

    if (practiceArea) {
      whereClause += ' AND (practice_area = $2 OR practice_area IS NULL)';
      params.push(practiceArea);
    }

    const result = await pool.query(
      `SELECT ${PLAYBOOK_COLS} FROM playbooks ${whereClause}`,
      params
    );
    return result.rows;
  },

  async list(tenantId: string) {
    const result = await pool.query(
      `SELECT ${PLAYBOOK_COLS} FROM playbooks 
       WHERE tenant_id = $1
       ORDER BY is_active DESC, created_at DESC`,
      [tenantId]
    );
    return result.rows;
  },

  async create(tenantId: string, data: {
    name: string;
    description?: string;
    practiceArea?: string;
    rules: any[];
    createdBy: string;
  }) {
    const result = await pool.query(
      `INSERT INTO playbooks (tenant_id, name, description, practice_area, rules, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING ${PLAYBOOK_COLS}`,
      [tenantId, data.name, data.description, data.practiceArea, 
       JSON.stringify(data.rules), data.createdBy]
    );
    return result.rows[0];
  },

  async update(tenantId: string, id: string, data: Partial<{
    name: string;
    description: string;
    rules: any[];
    isActive: boolean;
  }>) {
    const updates: string[] = [];
    const params: any[] = [tenantId, id];
    let paramIndex = 3;

    if (data.name !== undefined) {
      updates.push(`name = $${paramIndex++}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramIndex++}`);
      params.push(data.description);
    }
    if (data.rules !== undefined) {
      updates.push(`rules = $${paramIndex++}`);
      params.push(JSON.stringify(data.rules));
    }
    if (data.isActive !== undefined) {
      updates.push(`is_active = $${paramIndex++}`);
      params.push(data.isActive);
    }

    if (updates.length === 0) return null;

    const result = await pool.query(
      `UPDATE playbooks SET ${updates.join(', ')}
       WHERE tenant_id = $1 AND id = $2
       RETURNING ${PLAYBOOK_COLS}`,
      params
    );
    return result.rows[0];
  },
};

// ============================================================================
// Audit Repository
// ============================================================================

export const auditRepo = {
  async create(data: {
    tenantId: string;
    actorAttorneyId?: string;
    actorApiKeyId?: string;
    eventType: string;
    objectType?: string;
    objectId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: any;
  }) {
    await pool.query(
      `INSERT INTO audit_events (tenant_id, actor_attorney_id, actor_api_key_id, event_type, 
        object_type, object_id, ip_address, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [data.tenantId, data.actorAttorneyId, data.actorApiKeyId, data.eventType,
       data.objectType, data.objectId, data.ipAddress, data.userAgent, 
       JSON.stringify(data.metadata || {})]
    );
  },

  async list(tenantId: string, options: {
    eventType?: string;
    actorId?: string;
    limit?: number;
    offset?: number;
  } = {}) {
    const { eventType, actorId, limit = 100, offset = 0 } = options;
    const params: any[] = [tenantId];
    let whereClause = 'WHERE tenant_id = $1';
    let paramIndex = 2;

    if (eventType) {
      whereClause += ` AND event_type = $${paramIndex++}`;
      params.push(eventType);
    }
    if (actorId) {
      whereClause += ` AND actor_attorney_id = $${paramIndex++}`;
      params.push(actorId);
    }

    params.push(limit, offset);

    const result = await pool.query(
      `SELECT ${AUDIT_COLS} FROM audit_events 
       ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      params
    );
    return result.rows;
  },
};

// ============================================================================
// Refresh Token Repository
// ============================================================================

export const refreshTokenRepo = {
  async create(tenantId: string, attorneyId: string, tokenHash: string) {
    const result = await pool.query(
      `INSERT INTO refresh_tokens (tenant_id, attorney_id, token_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      [tenantId, attorneyId, tokenHash]
    );
    return result.rows[0].id;
  },

  async findByHash(tokenHash: string) {
    const result = await pool.query(
      `SELECT rt.*, a.email, a.role, a.status
       FROM refresh_tokens rt
       JOIN attorneys a ON rt.attorney_id = a.id
       WHERE rt.token_hash = $1 AND rt.revoked_at IS NULL AND rt.expires_at > now()`,
      [tokenHash]
    );
    return result.rows[0] || null;
  },

  async revoke(id: string) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() WHERE id = $1`,
      [id]
    );
  },

  async revokeAllForAttorney(tenantId: string, attorneyId: string) {
    await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now() 
       WHERE tenant_id = $1 AND attorney_id = $2 AND revoked_at IS NULL`,
      [tenantId, attorneyId]
    );
  },

  async rotate(oldId: string, newTokenHash: string) {
    const result = await pool.query(
      `UPDATE refresh_tokens SET revoked_at = now(), rotated_to = gen_random_uuid()
       WHERE id = $1
       RETURNING tenant_id, attorney_id, rotated_to`,
      [oldId]
    );

    if (!result.rows[0]) return null;

    const { tenant_id, attorney_id, rotated_to } = result.rows[0];

    await pool.query(
      `INSERT INTO refresh_tokens (id, tenant_id, attorney_id, token_hash)
       VALUES ($1, $2, $3, $4)`,
      [rotated_to, tenant_id, attorney_id, newTokenHash]
    );

    return rotated_to;
  },
};

// ============================================================================
// Vector Search Repository
// ============================================================================

export const vectorRepo = {
  async searchChunks(tenantId: string, embedding: number[], options: {
    matterId?: string;
    documentIds?: string[];
    limit?: number;
  } = {}) {
    const { matterId, documentIds, limit = 10 } = options;
    const params: any[] = [tenantId, `[${embedding.join(',')}]`];
    let whereClause = 'WHERE dc.tenant_id = $1';
    let paramIndex = 3;

    if (matterId) {
      whereClause += ` AND d.matter_id = $${paramIndex++}`;
      params.push(matterId);
    }

    if (documentIds && documentIds.length > 0) {
      whereClause += ` AND dc.document_id = ANY($${paramIndex++})`;
      params.push(documentIds);
    }

    params.push(limit);

    // Use pgvector cosine distance operator <=>
    const result = await pool.query(
      `SELECT dc.id as chunk_id, dc.document_id, d.source_name as document_name,
              dc.text_content, dc.page_from, dc.page_to,
              1 - (dc.embedding <=> $2::vector) as relevance_score
       FROM document_chunks dc
       JOIN documents d ON dc.document_id = d.id
       ${whereClause}
       ORDER BY dc.embedding <=> $2::vector
       LIMIT $${paramIndex}`,
      params
    );

    return result.rows;
  },

  async insertChunks(tenantId: string, documentId: string, chunks: Array<{
    chunkIndex: number;
    textContent: string;
    pageFrom?: number;
    pageTo?: number;
    embedding: number[];
  }>) {
    const values: any[] = [];
    const placeholders: string[] = [];
    let paramIndex = 1;

    for (const chunk of chunks) {
      placeholders.push(`($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 
        $${paramIndex++}, $${paramIndex++}, $${paramIndex++}::vector)`);
      values.push(
        tenantId, documentId, chunk.chunkIndex, chunk.textContent,
        chunk.pageFrom, chunk.pageTo, `[${chunk.embedding.join(',')}]`
      );
    }

    if (placeholders.length === 0) return;

    await pool.query(
      `INSERT INTO document_chunks (tenant_id, document_id, chunk_index, text_content, 
        page_from, page_to, embedding)
       VALUES ${placeholders.join(', ')}`,
      values
    );
  },
};
