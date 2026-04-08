/**
 * Migration: Add SSO configuration tables
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // SSO Configurations
  pgm.createTable('sso_configs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
      unique: true,
    },
    provider: { type: 'text', notNull: true }, // 'google', 'microsoft', 'okta', 'saml'
    client_id: { type: 'text' },
    client_secret_encrypted: { type: 'text' }, // Encrypted with ENCRYPTION_KEY
    domain: { type: 'text' }, // For domain verification
    metadata_url: { type: 'text' }, // SAML metadata URL
    entity_id: { type: 'text' }, // SAML Entity ID
    sso_url: { type: 'text' }, // SAML SSO URL
    certificate: { type: 'text' }, // SAML X.509 Certificate
    is_enabled: { type: 'boolean', notNull: true, default: false },
    enforce_sso: { type: 'boolean', notNull: true, default: false }, // Require SSO for all users
    auto_provision: { type: 'boolean', notNull: true, default: true }, // JIT provisioning
    default_role: { type: 'text', notNull: true, default: "'attorney'" },
    allowed_domains: { type: 'text[]', default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    updated_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  // Domain verifications
  pgm.createTable('domain_verifications', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    domain: { type: 'text', notNull: true },
    verification_token: { type: 'text', notNull: true },
    verification_method: { type: 'text', notNull: true }, // 'dns_txt', 'dns_cname', 'meta_tag'
    verified_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz', notNull: true },
  });

  pgm.createIndex('domain_verifications', ['tenant_id', 'domain'], { unique: true });

  // Identity links for SSO users
  pgm.createTable('identity_links', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    attorney_id: {
      type: 'uuid',
      notNull: true,
      references: 'attorneys',
      onDelete: 'CASCADE',
    },
    provider: { type: 'text', notNull: true },
    external_id: { type: 'text', notNull: true }, // sub/nameID from IdP
    email: { type: 'text', notNull: true },
    metadata: { type: 'jsonb', default: '{}' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_login_at: { type: 'timestamptz' },
  });

  pgm.createIndex('identity_links', ['tenant_id', 'provider', 'external_id'], { unique: true });
  pgm.createIndex('identity_links', ['attorney_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('identity_links');
  pgm.dropTable('domain_verifications');
  pgm.dropTable('sso_configs');
};
