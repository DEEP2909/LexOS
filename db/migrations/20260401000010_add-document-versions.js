/**
 * Migration: Add document_versions and document_links tables
 * 
 * These tables support:
 * - Document version tracking (upload, edit, import, ai_suggestion_applied)
 * - Cross-document linking (amendments, references, supersedes, exhibits)
 * 
 * Used by ai-context.ts for buildAIContext() and createDocumentVersion()
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ============================================================
  // Document Versions Table
  // ============================================================
  pgm.createTable('document_versions', {
    id: { 
      type: 'uuid', 
      primaryKey: true, 
      default: pgm.func('gen_random_uuid()') 
    },
    tenant_id: { 
      type: 'uuid', 
      notNull: true, 
      references: 'tenants', 
      onDelete: 'CASCADE' 
    },
    document_id: { 
      type: 'uuid', 
      notNull: true, 
      references: 'documents', 
      onDelete: 'CASCADE' 
    },
    version: { 
      type: 'integer', 
      notNull: true 
    },
    hash: { 
      type: 'text', 
      notNull: true,
      comment: 'SHA-256 hash of document content for this version'
    },
    created_by: { 
      type: 'uuid', 
      references: 'attorneys' 
    },
    change_type: {
      type: 'text',
      notNull: true,
      check: "change_type IN ('upload', 'edit', 'import', 'ai_suggestion_applied')",
    },
    previous_version_id: { 
      type: 'uuid', 
      references: 'document_versions' 
    },
    created_at: { 
      type: 'timestamptz', 
      notNull: true, 
      default: pgm.func('now()') 
    },
  });

  // Each document can only have one entry per version number
  pgm.addConstraint('document_versions', 'uq_document_version',
    'UNIQUE (document_id, version)');
  
  // Indexes for common queries
  pgm.createIndex('document_versions', 'tenant_id');
  pgm.createIndex('document_versions', 'document_id');
  pgm.createIndex('document_versions', ['document_id', 'version']);

  // ============================================================
  // Document Links Table
  // ============================================================
  pgm.createTable('document_links', {
    id: { 
      type: 'uuid', 
      primaryKey: true, 
      default: pgm.func('gen_random_uuid()') 
    },
    tenant_id: { 
      type: 'uuid', 
      notNull: true, 
      references: 'tenants', 
      onDelete: 'CASCADE' 
    },
    source_document_id: { 
      type: 'uuid', 
      notNull: true, 
      references: 'documents', 
      onDelete: 'CASCADE' 
    },
    target_document_id: { 
      type: 'uuid', 
      notNull: true, 
      references: 'documents', 
      onDelete: 'CASCADE' 
    },
    link_type: {
      type: 'text',
      notNull: true,
      check: "link_type IN ('references', 'amends', 'supersedes', 'related', 'attachment', 'exhibit')",
    },
    metadata: { 
      type: 'jsonb', 
      notNull: true, 
      default: pgm.func("'{}'"),
      comment: 'Additional metadata about the link relationship'
    },
    created_by: { 
      type: 'uuid', 
      references: 'attorneys' 
    },
    updated_at: { 
      type: 'timestamptz', 
      notNull: true, 
      default: pgm.func('now()') 
    },
    created_at: { 
      type: 'timestamptz', 
      notNull: true, 
      default: pgm.func('now()') 
    },
  });

  // Only one link of each type between two documents
  pgm.addConstraint('document_links', 'uq_document_link',
    'UNIQUE (source_document_id, target_document_id, link_type)');
  
  // Indexes for common queries
  pgm.createIndex('document_links', 'tenant_id');
  pgm.createIndex('document_links', 'source_document_id');
  pgm.createIndex('document_links', 'target_document_id');
  pgm.createIndex('document_links', ['source_document_id', 'target_document_id']);
};

exports.down = (pgm) => {
  pgm.dropTable('document_links');
  pgm.dropTable('document_versions');
};
