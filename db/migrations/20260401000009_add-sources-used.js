/**
 * Migration: Add sources_used column to research_history
 * 
 * This column tracks how many document chunks were used to generate
 * each research response, useful for analytics and billing.
 */

exports.up = (pgm) => {
  pgm.addColumn('research_history', {
    sources_used: { 
      type: 'integer', 
      default: 0,
      notNull: true
    }
  });

  // Add index for analytics queries
  pgm.createIndex('research_history', 'sources_used');
};

exports.down = (pgm) => {
  pgm.dropIndex('research_history', 'sources_used');
  pgm.dropColumn('research_history', 'sources_used');
};
