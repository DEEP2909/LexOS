/**
 * EvidentIS AI Context Handling
 * Document versioning, linking, and cross-document reasoning
 */

import { pool } from './database.js';
import { logger } from './logger.js';

// ============================================================================
// Document Version Management
// ============================================================================

export interface DocumentVersion {
  documentId: string;
  version: number;
  hash: string;
  createdAt: Date;
  createdBy: string;
  changeType: 'upload' | 'edit' | 'import' | 'ai_suggestion_applied';
  previousVersionId?: string;
}

/**
 * Create a new document version
 */
export async function createDocumentVersion(
  tenantId: string,
  documentId: string,
  userId: string,
  contentHash: string,
  changeType: DocumentVersion['changeType']
): Promise<DocumentVersion> {
  const result = await pool.query(
    `INSERT INTO document_versions (tenant_id, document_id, version, hash, created_by, change_type, previous_version_id)
     SELECT $1, $2, 
            COALESCE((SELECT MAX(version) FROM document_versions WHERE document_id = $2), 0) + 1,
            $3, $4, $5,
            (SELECT id FROM document_versions WHERE document_id = $2 ORDER BY version DESC LIMIT 1)
     RETURNING *`,
    [tenantId, documentId, contentHash, userId, changeType]
  );
  
  return result.rows[0];
}

/**
 * Get all versions of a document
 */
export async function getDocumentVersions(
  tenantId: string,
  documentId: string
): Promise<DocumentVersion[]> {
  const result = await pool.query(
    `SELECT * FROM document_versions 
     WHERE tenant_id = $1 AND document_id = $2 
     ORDER BY version DESC`,
    [tenantId, documentId]
  );
  
  return result.rows;
}

// ============================================================================
// Document Linking
// ============================================================================

export interface DocumentLink {
  id: string;
  sourceDocumentId: string;
  targetDocumentId: string;
  linkType: 'references' | 'amends' | 'supersedes' | 'related' | 'attachment' | 'exhibit';
  metadata?: Record<string, any>;
  createdAt: Date;
  createdBy: string;
}

/**
 * Create a link between documents
 */
export async function linkDocuments(
  tenantId: string,
  sourceDocumentId: string,
  targetDocumentId: string,
  linkType: DocumentLink['linkType'],
  userId: string,
  metadata?: Record<string, any>
): Promise<DocumentLink> {
  const result = await pool.query(
    `INSERT INTO document_links (tenant_id, source_document_id, target_document_id, link_type, metadata, created_by)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (source_document_id, target_document_id, link_type) 
     DO UPDATE SET metadata = EXCLUDED.metadata, updated_at = now()
     RETURNING *`,
    [tenantId, sourceDocumentId, targetDocumentId, linkType, metadata || {}, userId]
  );
  
  return result.rows[0];
}

/**
 * Get all documents linked to a source document
 */
export async function getLinkedDocuments(
  tenantId: string,
  documentId: string
): Promise<Array<DocumentLink & { document: any }>> {
  const result = await pool.query(
    `SELECT dl.*, 
            json_build_object(
              'id', d.id,
              'title', d.title,
              'type', d.doc_type,
              'status', d.status,
              'created_at', d.created_at
            ) as document
     FROM document_links dl
     JOIN documents d ON d.id = dl.target_document_id AND d.tenant_id = dl.tenant_id
     WHERE dl.tenant_id = $1 AND dl.source_document_id = $2`,
    [tenantId, documentId]
  );
  
  return result.rows;
}

/**
 * Get documents that link TO this document (backlinks)
 */
export async function getBacklinks(
  tenantId: string,
  documentId: string
): Promise<Array<DocumentLink & { document: any }>> {
  const result = await pool.query(
    `SELECT dl.*, 
            json_build_object(
              'id', d.id,
              'title', d.title,
              'type', d.doc_type,
              'status', d.status,
              'created_at', d.created_at
            ) as document
     FROM document_links dl
     JOIN documents d ON d.id = dl.source_document_id AND d.tenant_id = dl.tenant_id
     WHERE dl.tenant_id = $1 AND dl.target_document_id = $2`,
    [tenantId, documentId]
  );
  
  return result.rows;
}

// ============================================================================
// Cross-Document AI Context
// ============================================================================

export interface AIContext {
  primaryDocument: {
    id: string;
    version: number;
    title: string;
    type: string;
    chunkIds: string[];
  };
  linkedDocuments: Array<{
    id: string;
    title: string;
    type: string;
    linkType: DocumentLink['linkType'];
    relevantChunks: string[];
  }>;
  matterContext?: {
    id: string;
    title: string;
    type: string;
    documentCount: number;
  };
  temporalContext?: {
    currentDate: string;
    documentDate?: string;
    effectiveDate?: string;
    expirationDate?: string;
  };
}

/**
 * Build comprehensive AI context for a document
 */
export async function buildAIContext(
  tenantId: string,
  documentId: string,
  query?: string
): Promise<AIContext> {
  // Get primary document
  const docResult = await pool.query(
    `SELECT d.*, dv.version 
     FROM documents d
     LEFT JOIN document_versions dv ON dv.document_id = d.id 
       AND dv.version = (SELECT MAX(version) FROM document_versions WHERE document_id = d.id)
     WHERE d.tenant_id = $1 AND d.id = $2`,
    [tenantId, documentId]
  );
  
  if (docResult.rows.length === 0) {
    throw new Error(`Document not found: ${documentId}`);
  }
  
  const doc = docResult.rows[0];
  
  // Get relevant chunks from primary document
  const chunkResult = await pool.query(
    `SELECT id FROM document_chunks 
     WHERE tenant_id = $1 AND document_id = $2
     ORDER BY chunk_index`,
    [tenantId, documentId]
  );
  
  const primaryChunkIds = chunkResult.rows.map((r: { id: string }) => r.id);
  
  // Get linked documents with relevant chunks
  const linkedDocs = await getLinkedDocuments(tenantId, documentId);
  const linkedDocumentsWithChunks = await Promise.all(
    linkedDocs.map(async (link) => {
      // Get top chunks from linked doc (could use vector search with query if provided)
      const linkedChunks = await pool.query(
        `SELECT id FROM document_chunks 
         WHERE tenant_id = $1 AND document_id = $2
         LIMIT 5`,
        [tenantId, link.document.id]
      );
      
      return {
        id: link.document.id,
        title: link.document.title,
        type: link.document.type,
        linkType: link.linkType,
        relevantChunks: linkedChunks.rows.map((r: { id: string }) => r.id),
      };
    })
  );
  
  // Get matter context
  let matterContext;
  if (doc.matter_id) {
    const matterResult = await pool.query(
      `SELECT m.*, (SELECT COUNT(*) FROM documents WHERE matter_id = m.id) as doc_count
       FROM matters m
       WHERE m.tenant_id = $1 AND m.id = $2`,
      [tenantId, doc.matter_id]
    );
    
    if (matterResult.rows.length > 0) {
      const matter = matterResult.rows[0];
      matterContext = {
        id: matter.id,
        title: matter.title,
        type: matter.matter_type,
        documentCount: Number.parseInt(matter.doc_count, 10),
      };
    }
  }
  
  return {
    primaryDocument: {
      id: doc.id,
      version: doc.version || 1,
      title: doc.title,
      type: doc.doc_type,
      chunkIds: primaryChunkIds,
    },
    linkedDocuments: linkedDocumentsWithChunks,
    matterContext,
    temporalContext: {
      currentDate: new Date().toISOString().split('T')[0],
      documentDate: doc.created_at?.toISOString().split('T')[0],
      effectiveDate: doc.effective_date?.toISOString().split('T')[0],
      expirationDate: doc.expiration_date?.toISOString().split('T')[0],
    },
  };
}

/**
 * Format AI context for prompt injection
 */
export function formatContextForPrompt(context: AIContext): string {
  let prompt = `## Document Context\n\n`;
  
  prompt += `**Primary Document**: ${context.primaryDocument.title}\n`;
  prompt += `- Type: ${context.primaryDocument.type}\n`;
  prompt += `- Version: ${context.primaryDocument.version}\n`;
  prompt += `- Chunks: ${context.primaryDocument.chunkIds.length}\n\n`;
  
  if (context.linkedDocuments.length > 0) {
    prompt += `**Related Documents**:\n`;
    for (const linked of context.linkedDocuments) {
      prompt += `- ${linked.title} (${linked.linkType}): ${linked.type}\n`;
    }
    prompt += '\n';
  }
  
  if (context.matterContext) {
    prompt += `**Matter Context**: ${context.matterContext.title}\n`;
    prompt += `- Type: ${context.matterContext.type}\n`;
    prompt += `- Total Documents: ${context.matterContext.documentCount}\n\n`;
  }
  
  if (context.temporalContext) {
    prompt += `**Temporal Context**:\n`;
    prompt += `- Analysis Date: ${context.temporalContext.currentDate}\n`;
    if (context.temporalContext.effectiveDate) {
      prompt += `- Effective Date: ${context.temporalContext.effectiveDate}\n`;
    }
    if (context.temporalContext.expirationDate) {
      prompt += `- Expiration Date: ${context.temporalContext.expirationDate}\n`;
    }
  }
  
  return prompt;
}
