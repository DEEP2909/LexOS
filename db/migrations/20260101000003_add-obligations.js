/* eslint-disable camelcase */
/**
 * EvidentIS Obligations Migration
 * Migration: 20260101000003_add-obligations.js
 * 
 * Creates tables for obligation tracking and clause suggestions:
 * - obligations: Contract deadlines, milestones, and commitments
 * - clause_suggestions: AI-generated redline suggestions
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // ============================================================
  // OBLIGATIONS - Contract deadlines and commitments
  // ============================================================
  pgm.createTable('obligations', {
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
    matter_id: {
      type: 'uuid',
      notNull: true,
      references: 'matters',
      onDelete: 'CASCADE',
    },
    clause_id: {
      type: 'uuid',
      references: 'clauses',
      onDelete: 'SET NULL',
    },
    obligation_type: {
      type: 'text',
      notNull: true,
      comment: 'payment, delivery, notice, milestone, renewal, termination, reporting, compliance',
    },
    description: { type: 'text', notNull: true },
    responsible_party: {
      type: 'text',
      notNull: true,
      comment: 'client, counterparty, both, third_party',
    },
    deadline: { type: 'timestamptz' },
    is_recurring: { type: 'boolean', notNull: true, default: false },
    recurrence_pattern: { type: 'text', comment: 'daily, weekly, monthly, quarterly, annually' },
    recurrence_end_date: { type: 'timestamptz' },
    status: {
      type: 'text',
      notNull: true,
      default: "'pending'",
      comment: 'pending, in_progress, completed, overdue, waived',
    },
    priority: {
      type: 'text',
      notNull: true,
      default: "'normal'",
      comment: 'low, normal, high, critical',
    },
    reminder_days_before: {
      type: 'integer[]',
      default: pgm.func("'{7, 3, 1}'"),
    },
    last_reminder_sent_at: { type: 'timestamptz' },
    completed_at: { type: 'timestamptz' },
    completed_by: {
      type: 'uuid',
      references: 'attorneys',
      onDelete: 'SET NULL',
    },
    notes: { type: 'text' },
    metadata: { type: 'jsonb', default: pgm.func("'{}'::jsonb") },
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
  
  pgm.createIndex('obligations', 'tenant_id');
  pgm.createIndex('obligations', 'document_id');
  pgm.createIndex('obligations', 'matter_id');
  pgm.createIndex('obligations', 'deadline');
  pgm.createIndex('obligations', 'status');
  pgm.createIndex('obligations', ['tenant_id', 'status', 'deadline'], {
    name: 'idx_obligations_pending_by_deadline',
  });

  // ============================================================
  // CLAUSE_SUGGESTIONS - AI-generated redline suggestions
  // ============================================================
  pgm.createTable('clause_suggestions', {
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
    clause_id: {
      type: 'uuid',
      notNull: true,
      references: 'clauses',
      onDelete: 'CASCADE',
    },
    document_id: {
      type: 'uuid',
      notNull: true,
      references: 'documents',
      onDelete: 'CASCADE',
    },
    suggestion_type: {
      type: 'text',
      notNull: true,
      comment: 'replacement, addition, deletion, comment',
    },
    original_text: { type: 'text', notNull: true },
    suggested_text: { type: 'text' },
    rationale: { type: 'text', notNull: true },
    risk_reduction: {
      type: 'text',
      comment: 'critical_to_high, high_to_medium, medium_to_low, advisory',
    },
    compliance_citations: { type: 'text[]', default: pgm.func("'{}'::text[]") },
    playbook_rule_id: {
      type: 'uuid',
    },
    confidence: {
      type: 'numeric(5,4)',
      notNull: true,
      default: 0.5,
    },
    status: {
      type: 'text',
      notNull: true,
      default: "'pending'",
      comment: 'pending, accepted, rejected, modified, deferred',
    },
    reviewed_by: {
      type: 'uuid',
      references: 'attorneys',
      onDelete: 'SET NULL',
    },
    reviewed_at: { type: 'timestamptz' },
    review_notes: { type: 'text' },
    final_text: { type: 'text', comment: 'Attorney-modified version if status is modified' },
    ai_model_used: { type: 'text' },
    created_at: {
      type: 'timestamptz',
      notNull: true,
      default: pgm.func('now()'),
    },
  });
  
  pgm.createIndex('clause_suggestions', 'tenant_id');
  pgm.createIndex('clause_suggestions', 'clause_id');
  pgm.createIndex('clause_suggestions', 'document_id');
  pgm.createIndex('clause_suggestions', 'status');
  pgm.createIndex('clause_suggestions', ['tenant_id', 'status'], {
    name: 'idx_clause_suggestions_pending',
    where: "status = 'pending'",
  });
};

exports.down = (pgm) => {
  pgm.dropTable('clause_suggestions');
  pgm.dropTable('obligations');
};
