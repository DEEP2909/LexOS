/**
 * Migration: Add comprehensive analytics tables
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // Daily aggregated metrics
  pgm.createTable('analytics_daily', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
    tenant_id: {
      type: 'uuid',
      notNull: true,
      references: 'tenants',
      onDelete: 'CASCADE',
    },
    date: { type: 'date', notNull: true },
    
    // Document metrics
    documents_uploaded: { type: 'integer', notNull: true, default: 0 },
    documents_processed: { type: 'integer', notNull: true, default: 0 },
    documents_failed: { type: 'integer', notNull: true, default: 0 },
    total_pages_processed: { type: 'integer', notNull: true, default: 0 },
    
    // Clause metrics
    clauses_extracted: { type: 'integer', notNull: true, default: 0 },
    clauses_by_type: { type: 'jsonb', default: '{}' },
    
    // Flag metrics
    flags_created: { type: 'integer', notNull: true, default: 0 },
    flags_resolved: { type: 'integer', notNull: true, default: 0 },
    flags_by_severity: { type: 'jsonb', default: '{}' },
    
    // Research metrics
    research_queries: { type: 'integer', notNull: true, default: 0 },
    research_with_sources: { type: 'integer', notNull: true, default: 0 },
    
    // Obligation metrics
    obligations_created: { type: 'integer', notNull: true, default: 0 },
    obligations_completed: { type: 'integer', notNull: true, default: 0 },
    obligations_overdue: { type: 'integer', notNull: true, default: 0 },
    
    // Performance metrics
    avg_processing_time_ms: { type: 'integer' },
    avg_health_score: { type: 'numeric(5,2)' },
    
    // User activity
    active_users: { type: 'integer', notNull: true, default: 0 },
    total_logins: { type: 'integer', notNull: true, default: 0 },
    
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('analytics_daily', ['tenant_id', 'date'], { unique: true });
  pgm.createIndex('analytics_daily', 'date');

  // Matter-level analytics
  pgm.createTable('analytics_matters', {
    id: { type: 'uuid', primaryKey: true, default: pgm.func('gen_random_uuid()') },
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
    date: { type: 'date', notNull: true },
    
    documents_count: { type: 'integer', notNull: true, default: 0 },
    clauses_count: { type: 'integer', notNull: true, default: 0 },
    open_flags_count: { type: 'integer', notNull: true, default: 0 },
    critical_flags_count: { type: 'integer', notNull: true, default: 0 },
    pending_obligations_count: { type: 'integer', notNull: true, default: 0 },
    health_score: { type: 'integer' },
    
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('analytics_matters', ['tenant_id', 'matter_id', 'date'], { unique: true });

  // User activity tracking
  pgm.createTable('user_activity', {
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
    action: { type: 'text', notNull: true },
    resource_type: { type: 'text' },
    resource_id: { type: 'uuid' },
    metadata: { type: 'jsonb', default: '{}' },
    ip_address: { type: 'inet' },
    user_agent: { type: 'text' },
    created_at: { type: 'timestamptz', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('user_activity', ['tenant_id', 'attorney_id', 'created_at']);
  pgm.createIndex('user_activity', ['tenant_id', 'action', 'created_at']);

  // Partitioning for user_activity (example for PostgreSQL 11+)
  pgm.sql(`
    CREATE INDEX idx_user_activity_created_at ON user_activity (created_at);
  `);
};

exports.down = (pgm) => {
  pgm.dropTable('user_activity');
  pgm.dropTable('analytics_matters');
  pgm.dropTable('analytics_daily');
};
