/* eslint-disable camelcase */
/**
 * EvidentIS Vector Index Migration
 * Migration: 20260101000002_vector-index.js
 * 
 * Creates IVFFlat index for fast vector similarity search.
 * Should be run AFTER data is loaded for optimal index performance.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  // IVFFlat index for fast cosine similarity search
  // lists=100 is suitable for ~100k vectors; adjust based on data size
  pgm.sql(`
    CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding 
    ON document_chunks 
    USING ivfflat (embedding vector_cosine_ops) 
    WITH (lists = 100);
  `);

  // Additional helpful indexes for common queries
  pgm.createIndex('document_chunks', ['document_id', 'chunk_index'], {
    name: 'idx_document_chunks_doc_chunk',
  });
};

exports.down = (pgm) => {
  pgm.dropIndex('document_chunks', ['document_id', 'chunk_index'], {
    name: 'idx_document_chunks_doc_chunk',
  });
  pgm.sql('DROP INDEX IF EXISTS idx_document_chunks_embedding;');
};
