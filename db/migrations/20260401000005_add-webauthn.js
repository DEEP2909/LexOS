/**
 * Migration: Add WebAuthn credentials table
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.createTable('webauthn_credentials', {
    id: { type: 'text', primaryKey: true },
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
    credential_id: { type: 'bytea', notNull: true, unique: true },
    credential_public_key: { type: 'bytea', notNull: true },
    counter: { type: 'integer', notNull: true, default: 0 },
    credential_device_type: { type: 'text', notNull: true },
    credential_backed_up: { type: 'boolean', notNull: true, default: false },
    transports: { type: 'text[]', default: '{}' },
    aaguid: { type: 'text', notNull: true },
    attestation_object: { type: 'bytea' },
    friendly_name: { type: 'text', default: "'Security Key'" },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
    last_used_at: { type: 'timestamptz' },
  });

  pgm.createIndex('webauthn_credentials', ['tenant_id', 'attorney_id']);
  pgm.createIndex('webauthn_credentials', 'credential_id');
};

exports.down = (pgm) => {
  pgm.dropTable('webauthn_credentials');
};
