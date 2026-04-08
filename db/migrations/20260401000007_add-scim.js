/**
 * Migration: Add SCIM provisioning tables
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // SCIM tokens for IdP authentication
  pgm.createTable('scim_tokens', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    token_hash: { type: 'text', notNull: true },
    description: { type: 'text' },
    is_active: { type: 'boolean', notNull: true, default: true },
    last_used_at: { type: 'timestamptz' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    expires_at: { type: 'timestamptz' },
    created_by: { type: 'uuid', references: 'attorneys' },
  });

  pgm.createIndex('scim_tokens', ['tenant_id', 'token_hash']);

  // SCIM sync logs for debugging
  pgm.createTable('scim_sync_logs', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    operation: { type: 'text', notNull: true }, // 'create', 'update', 'delete', 'get', 'list'
    resource_type: { type: 'text', notNull: true }, // 'User', 'Group'
    resource_id: { type: 'text' },
    external_id: { type: 'text' },
    request_body: { type: 'jsonb' },
    response_code: { type: 'integer' },
    response_body: { type: 'jsonb' },
    error_message: { type: 'text' },
    ip_address: { type: 'inet' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('scim_sync_logs', ['tenant_id', 'created_at']);

  // Add external_id to attorneys for SCIM mapping
  pgm.addColumns('attorneys', {
    scim_external_id: { type: 'text' },
  });

  pgm.createIndex('attorneys', ['tenant_id', 'scim_external_id'], {
    where: 'scim_external_id IS NOT NULL',
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('attorneys', ['scim_external_id']);
  pgm.dropTable('scim_sync_logs');
  pgm.dropTable('scim_tokens');
};
