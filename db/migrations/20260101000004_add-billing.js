/* eslint-disable camelcase */
/**
 * EvidentIS Billing & Quotas Migration
 * Migration: 20260101000004_add-billing.js
 * 
 * Creates tables for billing, AI quotas, and subscription management:
 * - tenant_ai_quotas: Per-tenant AI usage limits and tracking
 * 
 * Note: refresh_tokens, share_links, webhooks are already created in 
 * 20260101000001_auth-tables.js. This migration adds AI quota tracking.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ============================================================
  // TENANT_AI_QUOTAS - Per-tenant AI usage limits and tracking
  // ============================================================
  pgm.createTable('tenant_ai_quotas', {
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
      unique: true,
    },
    // Monthly document processing limits
    monthly_doc_limit: {
      type: 'integer',
      default: 100,
      comment: 'NULL means unlimited',
    },
    current_month_docs: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    // Monthly research query limits
    monthly_research_limit: {
      type: 'integer',
      default: 500,
      comment: 'NULL means unlimited',
    },
    current_month_research: {
      type: 'integer',
      notNull: true,
      default: 0,
    },
    // AI tier configuration
    api_tier: {
      type: 'text',
      notNull: true,
      default: "'opensource'",
      comment: 'opensource (Ollama), hybrid (Ollama + GPT fallback), premium_api (GPT-4o)',
    },
    // Premium API usage (if enabled)
    premium_tokens_used: {
      type: 'bigint',
      notNull: true,
      default: 0,
    },
    premium_tokens_limit: {
      type: 'bigint',
      comment: 'NULL means unlimited (Enterprise tier)',
    },
    // Quota reset tracking
    quota_reset_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("now() + INTERVAL '1 month'"),
    },
    // Rate limiting
    requests_per_minute: {
      type: 'integer',
      notNull: true,
      default: 60,
    },
    concurrent_jobs_limit: {
      type: 'integer',
      notNull: true,
      default: 5,
    },
    // Feature flags
    features_enabled: {
      type: 'jsonb',
      notNull: true,
      default: pgm.func("'{\"ocr\": true, \"extraction\": true, \"research\": true, \"suggestions\": true}'::jsonb"),
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
  
  pgm.createIndex('tenant_ai_quotas', 'tenant_id');
  
  // Add Paddle-related columns to tenants table if not exists
  pgm.sql(`
    ALTER TABLE tenants 
    ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT,
    ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none',
    ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS billing_email TEXT,
    ADD COLUMN IF NOT EXISTS billing_status TEXT DEFAULT 'active'
  `);

  // Enforce uniqueness separately so it is not skipped when columns already exist.
  pgm.sql(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT paddle_customer_id
        FROM tenants
        WHERE paddle_customer_id IS NOT NULL
        GROUP BY paddle_customer_id
        HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'Duplicate paddle_customer_id values exist; deduplicate tenant billing records before enforcing uniqueness.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenants_paddle_customer_id_unique'
          AND conrelid = 'tenants'::regclass
      ) THEN
        ALTER TABLE tenants
          ADD CONSTRAINT tenants_paddle_customer_id_unique UNIQUE (paddle_customer_id);
      END IF;

      IF EXISTS (
        SELECT paddle_subscription_id
        FROM tenants
        WHERE paddle_subscription_id IS NOT NULL
        GROUP BY paddle_subscription_id
        HAVING COUNT(*) > 1
      ) THEN
        RAISE EXCEPTION 'Duplicate paddle_subscription_id values exist; deduplicate tenant billing records before enforcing uniqueness.';
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tenants_paddle_subscription_id_unique'
          AND conrelid = 'tenants'::regclass
      ) THEN
        ALTER TABLE tenants
          ADD CONSTRAINT tenants_paddle_subscription_id_unique UNIQUE (paddle_subscription_id);
      END IF;
    END
    $$;
  `);
  
  pgm.createIndex('tenants', 'paddle_customer_id', {
    name: 'idx_tenants_paddle_customer',
    ifNotExists: true,
  });
};

exports.down = (pgm) => {
  pgm.dropTable('tenant_ai_quotas');
  
  // Remove Paddle columns from tenants
  pgm.sql(`
    ALTER TABLE tenants 
    DROP COLUMN IF EXISTS paddle_customer_id,
    DROP COLUMN IF EXISTS paddle_subscription_id,
    DROP COLUMN IF EXISTS subscription_status,
    DROP COLUMN IF EXISTS trial_ends_at,
    DROP COLUMN IF EXISTS billing_email,
    DROP COLUMN IF EXISTS billing_status
  `);
};
