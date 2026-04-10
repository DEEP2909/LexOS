/* eslint-disable camelcase */
/**
 * EvidentIS Auth Tables Migration
 * Migration: 20260101000001_auth-tables.js
 * 
 * Creates all authentication-related tables:
 * - API keys, invitations, password reset tokens
 * - MFA enrollments, passkeys, SSO providers
 * - SCIM tokens, refresh tokens
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ============================================================
  // 17. API_KEYS - Programmatic access keys
  // ============================================================
  pgm.createTable('api_keys', {
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
    key_prefix: { type: 'text', notNull: true },
    key_hash: { type: 'text', notNull: true, unique: true },
    role: { type: 'text', notNull: true, default: "'api_user'" },
    status: { type: 'text', notNull: true, default: "'active'" },
    last_used_at: { type: 'timestamptz' },
    expires_at: { type: 'timestamptz' },
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
  pgm.createIndex('api_keys', 'tenant_id');
  pgm.createIndex('api_keys', 'key_hash');

  // ============================================================
  // 18. INVITATIONS - Pending user invitations
  // ============================================================
  pgm.createTable('invitations', {
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
    role: { type: 'text', notNull: true, default: "'attorney'" },
    token_hash: { type: 'text', notNull: true, unique: true },
    status: { type: 'text', notNull: true, default: "'pending'" },
    invited_by: {
      type: 'uuid',
      references: 'attorneys',
    },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("now() + INTERVAL '7 days'"),
    },
    accepted_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('invitations', 'tenant_id');
  pgm.createIndex('invitations', 'token_hash');

  // ============================================================
  // 19. PASSWORD_RESET_TOKENS
  // ============================================================
  pgm.createTable('password_reset_tokens', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    attorney_id: {
      type: 'uuid',
      notNull: true,
      references: 'attorneys',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'text', notNull: true, unique: true },
    status: { type: 'text', notNull: true, default: "'active'" },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("now() + INTERVAL '1 hour'"),
    },
    used_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('password_reset_tokens', 'token_hash');

  // ============================================================
  // 20. MFA_ENROLLMENTS - Pending TOTP setup
  // ============================================================
  pgm.createTable('mfa_enrollments', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    attorney_id: {
      type: 'uuid',
      notNull: true,
      references: 'attorneys',
      onDelete: 'CASCADE',
      unique: true,
    },
    secret_base32: { type: 'text', notNull: true },
    recovery_codes: { type: 'text[]', notNull: true },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("now() + INTERVAL '10 minutes'"),
    },
  });

  // ============================================================
  // 21. PASSKEYS - WebAuthn credentials
  // ============================================================
  pgm.createTable('passkeys', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    attorney_id: {
      type: 'uuid',
      notNull: true,
      references: 'attorneys',
      onDelete: 'CASCADE',
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    credential_id: { type: 'text', notNull: true, unique: true },
    public_key: { type: 'bytea', notNull: true },
    counter: { type: 'bigint', notNull: true, default: 0 },
    device_type: { type: 'text' },
    device_name: { type: 'text' },
    backed_up: { type: 'boolean', notNull: true, default: false },
    transports: { type: 'text[]' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('passkeys', 'attorney_id');
  pgm.createIndex('passkeys', 'tenant_id');
  pgm.createIndex('passkeys', 'credential_id');

  // ============================================================
  // 22. SSO_PROVIDERS - Per-tenant OIDC/SAML config
  // ============================================================
  pgm.createTable('sso_providers', {
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
    provider_name: { type: 'text', notNull: true },
    provider_type: { type: 'text', notNull: true },
    client_id: { type: 'text' },
    client_secret: { type: 'text' },
    metadata_url: { type: 'text' },
    saml_metadata_xml: { type: 'text' },
    attribute_mapping: { type: 'jsonb', notNull: true, default: pgm.func("'{}'") },
    is_active: { type: 'boolean', notNull: true, default: false },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('sso_providers', 'tenant_id');

  // NOTE: scim_tokens table is created in
  // 20260401000007_add-scim.js with its complete schema
  // (includes description, expires_at, created_by, scim_sync_logs).
  // Do NOT define it here to avoid "relation already exists" errors.

  // ============================================================
  // 24. SHARE_LINKS - Time-limited client portal access
  // ============================================================
  pgm.createTable('share_links', {
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
    token_hash: { type: 'text', notNull: true, unique: true },
    access_level: { type: 'text', notNull: true, default: "'read'" },
    watermark_text: { type: 'text' },
    expires_at: { type: 'timestamptz', notNull: true },
    max_views: { type: 'integer', default: 50 },
    view_count: { type: 'integer', default: 0 },
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
  pgm.createIndex('share_links', 'tenant_id');
  pgm.createIndex('share_links', 'token_hash');

  // ============================================================
  // 25. WEBHOOKS - Event notification registrations
  // ============================================================
  pgm.createTable('webhooks', {
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
    url: { type: 'text', notNull: true },
    secret: { type: 'text', notNull: true },
    events: { type: 'text[]', notNull: true },
    is_active: { type: 'boolean', notNull: true, default: true },
    last_triggered_at: { type: 'timestamptz' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('webhooks', 'tenant_id');

  // ============================================================
  // 26. REFRESH_TOKENS - Sliding window auth
  // ============================================================
  pgm.createTable('refresh_tokens', {
    id: {
      type: 'uuid',
      primaryKey: true,
      default: pgm.func('gen_random_uuid()'),
    },
    attorney_id: {
      type: 'uuid',
      notNull: true,
      references: 'attorneys',
      onDelete: 'CASCADE',
    },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'text', notNull: true, unique: true },
    expires_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func("now() + INTERVAL '7 days'"),
    },
    rotated_to: { type: 'uuid' },
    revoked_at: { type: 'timestamptz' },
    user_agent: { type: 'text' },
    ip_address: { type: 'inet' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  pgm.createIndex('refresh_tokens', 'attorney_id');
  pgm.createIndex('refresh_tokens', 'token_hash');
  pgm.addConstraint('refresh_tokens', 'refresh_tokens_rotated_to_fkey', {
    foreignKeys: {
      columns: 'rotated_to',
      references: 'refresh_tokens(id)',
      onDelete: 'SET NULL',
    },
  });
};

exports.down = (pgm) => {
  pgm.dropTable('refresh_tokens');
  pgm.dropTable('webhooks');
  pgm.dropTable('share_links');
  // scim_tokens is dropped in 000007_add-scim.js
  pgm.dropTable('sso_providers');
  pgm.dropTable('passkeys');
  pgm.dropTable('mfa_enrollments');
  pgm.dropTable('password_reset_tokens');
  pgm.dropTable('invitations');
  pgm.dropTable('api_keys');
};
