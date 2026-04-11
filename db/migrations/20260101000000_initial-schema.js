/* eslint-disable camelcase */
/**
 * EvidentIS Initial Database Schema
 * Migration: 20260101000000_initial-schema.js
 * 
 * Creates all core tables for the EvidentIS legal SaaS platform.
 * Uses pgvector for embeddings, enforces tenant isolation.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ============================================================
  // EXTENSIONS
  // ============================================================
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
  pgm.sql('CREATE EXTENSION IF NOT EXISTS "vector"');

  // ============================================================
  // 1. TENANTS - Root firm accounts
  // ============================================================
  pgm.createTable('tenants', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    name: { type: 'text', notNull: true },
    slug: { type: 'text', unique: true, notNull: true },
    plan: { type: 'text', notNull: true, default: "'starter'" },
    region: { type: 'text', notNull: true, default: "'us-east-1'" },
    bar_state: { type: 'text' },
    subscription_status: { type: 'text', notNull: true, default: "'trial'" },
    trial_ends_at: { type: 'timestamptz' },
    paddle_customer_id: { type: 'text' },
    paddle_subscription_id: { type: 'text' },
    logo_url: { type: 'text' },
    settings: { type: 'jsonb', notNull: true, default: pgm.func("'{}'") },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });

  // ============================================================
  // 2. ATTORNEYS - User accounts within a tenant
  // ============================================================
  pgm.createTable('attorneys', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    email: { type: 'text', notNull: true },
    display_name: { type: 'text', notNull: true },
    role: { type: 'text', notNull: true, default: "'attorney'" },
    practice_group: { type: 'text' },
    bar_number: { type: 'text' },
    bar_state: { type: 'text' },
    password_hash: { type: 'text' },
    mfa_enabled: { type: 'boolean', notNull: true, default: false },
    mfa_secret: { type: 'text' },
    mfa_recovery_codes: { type: 'text[]' },
    failed_login_attempts: { type: 'integer', notNull: true, default: 0 },
    locked_until: { type: 'timestamptz' },
    last_login_at: { type: 'timestamptz' },
    preferred_language: { type: 'text', notNull: true, default: "'en'" },
    status: { type: 'text', notNull: true, default: "'active'" },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.addConstraint('attorneys', 'attorneys_tenant_email_unique', {
    unique: ['tenant_id', 'email'],
  });
  pgm.createIndex('attorneys', 'tenant_id');

  // ============================================================
  // 3. MATTERS - Deal/case containers
  // ============================================================
  pgm.createTable('matters', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    matter_code: { type: 'text', notNull: true },
    matter_name: { type: 'text', notNull: true },
    matter_type: { type: 'text', notNull: true },
    client_name: { type: 'text', notNull: true },
    counterparty_name: { type: 'text' },
    governing_law_state: { type: 'text' },
    status: { type: 'text', notNull: true, default: "'open'" },
    priority: { type: 'text', notNull: true, default: "'normal'" },
    health_score: { type: 'integer', default: 100 },
    lead_attorney_id: {
      type: 'uuid',
      references: 'attorneys',
    },
    target_close_date: { type: 'date' },
    deal_value_cents: { type: 'bigint' },
    notes: { type: 'text' },
    tags: { type: 'text[]', default: pgm.func("ARRAY[]::text[]") },
    created_by: {
      type: 'uuid',
      references: 'attorneys',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('matters', 'tenant_id');
  pgm.createIndex('matters', ['tenant_id', 'status']);

  // ============================================================
  // 4. DOCUMENTS - Uploaded legal documents
  // ============================================================
  pgm.createTable('documents', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    matter_id: {
      type: 'uuid',
      notNull: true,
      references: 'matters',
      onDelete: 'CASCADE',
    },
    source_name: { type: 'text', notNull: true },
    mime_type: { type: 'text', notNull: true },
    doc_type: { type: 'text', notNull: true },
    ingestion_status: { type: 'text', notNull: true, default: "'uploaded'" },
    security_status: { type: 'text', notNull: true, default: "'pending'" },
    file_uri: { type: 'text' },
    sha256: { type: 'text', notNull: true },
    normalized_text: { type: 'text' },
    page_count: { type: 'integer' },
    word_count: { type: 'integer' },
    ocr_engine: { type: 'text' },
    ocr_confidence: { type: 'numeric(5,2)' },
    privilege_score: { type: 'numeric(4,3)', default: 0.5 },
    language: { type: 'text', notNull: true, default: "'en'" },
    extraction_model: { type: 'text' },
    created_by: {
      type: 'uuid',
      references: 'attorneys',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
    updated_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('documents', 'tenant_id');
  pgm.createIndex('documents', 'matter_id');
  pgm.createIndex('documents', ['tenant_id', 'sha256']);

  // ============================================================
  // 5. DOCUMENT_CHUNKS - Text chunks with vector embeddings
  // ============================================================
  pgm.createTable('document_chunks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents',
      onDelete: 'CASCADE',
    },
    chunk_index: { type: 'integer', notNull: true },
    text_content: { type: 'text', notNull: true },
    page_from: { type: 'integer' },
    page_to: { type: 'integer' },
    embedding: { type: 'vector(384)' },
    model_version: { type: 'text', notNull: true, default: "'all-MiniLM-L6-v2'" },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('document_chunks', 'tenant_id');
  pgm.createIndex('document_chunks', 'document_id');

  // ============================================================
  // 6. CLAUSES - AI-extracted contract clauses
  // ============================================================
  pgm.createTable('clauses', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents',
      onDelete: 'CASCADE',
    },
    clause_type: { type: 'text', notNull: true },
    heading: { type: 'text' },
    text_excerpt: { type: 'text', notNull: true },
    page_from: { type: 'integer' },
    page_to: { type: 'integer' },
    risk_level: { type: 'text', notNull: true, default: "'low'" },
    confidence: { type: 'numeric(4,3)', notNull: true },
    risk_factors: { type: 'jsonb', notNull: true, default: pgm.func("'[]'") },
    extraction_model: { type: 'text' },
    reviewer_status: { type: 'text', notNull: true, default: "'pending'" },
    reviewer_id: {
      type: 'uuid',
      references: 'attorneys',
    },
    reviewed_at: { type: 'timestamptz' },
    reviewer_note: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('clauses', 'tenant_id');
  pgm.createIndex('clauses', 'document_id');
  pgm.createIndex('clauses', ['tenant_id', 'clause_type']);

  // ============================================================
  // 7. FLAGS - Playbook deviation alerts
  // ============================================================
  pgm.createTable('flags', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    matter_id: {
      type: 'uuid',
      notNull: true,
      references: 'matters',
      onDelete: 'CASCADE',
    },
    document_id: {
      type: 'uuid',
      references: 'documents',
      onDelete: 'CASCADE',
    },
    clause_id: {
      type: 'uuid',
      references: 'clauses',
      onDelete: 'SET NULL',
    },
    flag_type: { type: 'text', notNull: true },
    severity: { type: 'text', notNull: true, default: "'warn'" },
    reason: { type: 'text', notNull: true },
    playbook_rule: { type: 'text' },
    recommended_fix: { type: 'text' },
    status: { type: 'text', notNull: true, default: "'open'" },
    assigned_to: {
      type: 'uuid',
      references: 'attorneys',
    },
    resolved_by: {
      type: 'uuid',
      references: 'attorneys',
    },
    resolved_at: { type: 'timestamptz' },
    resolution_note: { type: 'text' },
    assessment_model: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('flags', 'tenant_id');
  pgm.createIndex('flags', 'matter_id');
  pgm.createIndex('flags', ['tenant_id', 'status']);

  // ============================================================
  // 8. PLAYBOOKS - Firm-defined standard position rule sets
  // ============================================================
  pgm.createTable('playbooks', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    name: { type: 'text', notNull: true },
    description: { type: 'text' },
    practice_area: { type: 'text' },
    rules: { type: 'jsonb', notNull: true, default: pgm.func("'[]'") },
    is_active: { type: 'boolean', notNull: true, default: false },
    created_by: {
      type: 'uuid',
      references: 'attorneys',
    },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('playbooks', 'tenant_id');

  // NOTE: obligations and clause_suggestions tables are created in
  // 20260101000003_add-obligations.js with more complete schemas.
  // Do NOT define them here to avoid "relation already exists" errors.

  // ============================================================
  // 11. REVIEW_ACTIONS - Immutable review history
  // ============================================================
  pgm.createTable('review_actions', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    reviewer_id: {
      type: 'uuid',
      notNull: true,
      references: 'attorneys',
    },
    object_type: { type: 'text', notNull: true },
    object_id: { type: 'uuid', notNull: true },
    action_type: { type: 'text', notNull: true },
    before_json: { type: 'jsonb' },
    after_json: { type: 'jsonb' },
    note: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('review_actions', 'tenant_id');
  pgm.createIndex('review_actions', ['object_type', 'object_id']);

  // ============================================================
  // 12. AUDIT_EVENTS - Immutable security + business event log
  // ============================================================
  pgm.createTable('audit_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    actor_attorney_id: {
      type: 'uuid',
      references: 'attorneys',
    },
    actor_api_key_id: { type: 'uuid' },
    event_type: { type: 'text', notNull: true },
    object_type: { type: 'text' },
    object_id: { type: 'uuid' },
    ip_address: { type: 'inet' },
    user_agent: { type: 'text' },
    metadata: { type: 'jsonb', notNull: true, default: pgm.func("'{}'") },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('audit_events', 'tenant_id');
  pgm.createIndex('audit_events', ['tenant_id', 'event_type']);
  pgm.createIndex('audit_events', 'created_at');

  // ============================================================
  // 13. WORKFLOW_JOBS - BullMQ-compatible job tracking
  // ============================================================
  pgm.createTable('workflow_jobs', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    job_type: { type: 'text', notNull: true },
    status: { type: 'text', notNull: true, default: "'pending'" },
    payload: { type: 'jsonb', notNull: true, default: pgm.func("'{}'") },
    result: { type: 'jsonb' },
    attempts: { type: 'integer', notNull: true, default: 0 },
    max_attempts: { type: 'integer', notNull: true, default: 3 },
    error_message: { type: 'text' },
    locked_by: { type: 'text' },
    locked_at: { type: 'timestamptz' },
    completed_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('workflow_jobs', 'tenant_id');
  pgm.createIndex('workflow_jobs', 'status');
  pgm.createIndex('workflow_jobs', ['job_type', 'status']);

  // ============================================================
  // 14. RESEARCH_HISTORY - Research query log
  // ============================================================
  pgm.createTable('research_history', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    matter_id: {
      type: 'uuid',
      references: 'matters',
      onDelete: 'SET NULL',
    },
    attorney_id: {
      type: 'uuid',
      references: 'attorneys',
    },
    question: { type: 'text', notNull: true },
    answer: { type: 'text', notNull: true },
    citations: { type: 'jsonb', notNull: true, default: pgm.func("'[]'") },
    model_version: { type: 'text' },
    tokens_used: { type: 'integer' },
    response_time_ms: { type: 'integer' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('research_history', 'tenant_id');
  pgm.createIndex('research_history', 'matter_id');

  // ============================================================
  // 15. AI_MODEL_EVENTS - AI inference cost + performance log
  // ============================================================
  pgm.createTable('ai_model_events', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    tenant_id: {
      type: 'uuid',
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    document_id: {
      type: 'uuid',
      references: 'documents',
      onDelete: 'SET NULL',
    },
    task_type: { type: 'text', notNull: true },
    model_name: { type: 'text', notNull: true },
    input_tokens: { type: 'integer' },
    output_tokens: { type: 'integer' },
    latency_ms: { type: 'integer' },
    cost_usd: { type: 'numeric(10,6)' },
    success: { type: 'boolean', notNull: true },
    error_message: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('ai_model_events', 'tenant_id');
  pgm.createIndex('ai_model_events', 'task_type');
  pgm.createIndex('ai_model_events', 'created_at');

  // NOTE: tenant_ai_quotas table is created in
  // 20260101000004_add-billing.js with its complete schema.
  // Do NOT define it here to avoid "relation already exists" errors.
};

exports.down = (pgm) => {
  // tenant_ai_quotas is dropped in 000004_add-billing.js
  pgm.dropTable('ai_model_events');
  pgm.dropTable('research_history');
  pgm.dropTable('workflow_jobs');
  pgm.dropTable('audit_events');
  pgm.dropTable('review_actions');
  // obligations and clause_suggestions are dropped in 000003_add-obligations.js
  pgm.dropTable('playbooks');
  pgm.dropTable('flags');
  pgm.dropTable('clauses');
  pgm.dropTable('document_chunks');
  pgm.dropTable('documents');
  pgm.dropTable('matters');
  pgm.dropTable('attorneys');
  pgm.dropTable('tenants');
};
