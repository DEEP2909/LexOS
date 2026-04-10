/**
 * EvidentIS BullMQ Worker
 * Background job processing for document pipeline
 * MUST handle SIGTERM gracefully - drain in-flight jobs before exit
 */

import { Worker, Queue, type Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';
import { traceJob, addSpanEvent } from './tracing.js';
import { documentRepo, clauseRepo, flagRepo, obligationRepo, matterRepo, vectorRepo } from './repository.js';
import { scanBuffer } from './malware.js';
import { downloadFile, moveFile } from './storage.js';
import { pool } from './database.js';
import { updatePipelineStatus } from './orchestrator.js';
import { sendMalwareAlertEmail } from './email.js';
import axios from 'axios';
import crypto from 'crypto';

// ============================================================================
// Redis Connection
// ============================================================================

const connection = new Redis(config.REDIS_URL, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

// ============================================================================
// Retry & Job Configuration
// ============================================================================

const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential' as const,
    delay: 1000, // Start with 1s, then 2s, then 4s
  },
  removeOnComplete: {
    age: 86400, // Keep completed jobs for 24 hours
    count: 1000, // Keep last 1000 completed jobs
  },
  removeOnFail: {
    age: 604800, // Keep failed jobs for 7 days for debugging
  },
};

// Dead-letter queue for jobs that exceed all retries
export const deadLetterQueue = new Queue('dead-letter', { connection });

// ============================================================================
// Job Queues
// ============================================================================

export const documentQueue = new Queue('document', { 
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const clauseQueue = new Queue('clause', { 
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const riskQueue = new Queue('risk', { 
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

export const obligationQueue = new Queue('obligation', { 
  connection,
  defaultJobOptions: DEFAULT_JOB_OPTIONS,
});

// ============================================================================
// Dead-Letter Handler
// ============================================================================

async function moveToDeadLetter(job: Job, error: Error): Promise<void> {
  logger.error({ 
    jobId: job.id, 
    jobName: job.name,
    queue: job.queueName,
    error: error.message,
    attemptsMade: job.attemptsMade,
  }, 'Job exhausted all retries, moving to dead-letter queue');

  await deadLetterQueue.add('failed-job', {
    originalQueue: job.queueName,
    originalJobName: job.name,
    originalJobId: job.id,
    originalData: job.data,
    error: error.message,
    stack: error.stack,
    attemptsMade: job.attemptsMade,
    failedAt: new Date().toISOString(),
  });
}

// ============================================================================
// Job Types
// ============================================================================

interface DocumentScanJob {
  tenantId: string;
  documentId: string;
  fileUri: string;
}

interface DocumentIngestJob {
  tenantId: string;
  documentId: string;
}

interface ClauseExtractJob {
  tenantId: string;
  documentId: string;
  matterId: string;
}

interface RiskAssessJob {
  tenantId: string;
  documentId: string;
  matterId: string;
}

interface ObligationExtractJob {
  tenantId: string;
  documentId: string;
  matterId: string;
}

interface DocumentRow {
  file_uri: string;
  mime_type: string;
  normalized_text: string;
  doc_type: string;
}

interface MatterRow {
  governing_law_state: string | null;
}

// ============================================================================
// Worker: document.scan
// ============================================================================

const documentScanWorker = new Worker<DocumentScanJob>(
  'document',
  async (job: Job<DocumentScanJob>) => {
    if (job.name !== 'document.scan') return;

    const { tenantId, documentId, fileUri } = job.data;
    
    // Update pipeline status - scanning
    await updatePipelineStatus(tenantId, documentId, 'scanning', 10);
    
    return traceJob('document.scan', job.id || documentId, async () => {
      logger.info({ tenantId, documentId }, 'Starting malware scan');
      addSpanEvent('scan_started');

      try {
        // Download file from quarantine
        const fileBuffer = await downloadFile(fileUri);
        
        // Scan with ClamAV
        const scanResult = await scanBuffer(fileBuffer);
        
        if (!scanResult.clean) {
          const viruses = scanResult.virus ? [scanResult.virus] : ['unknown'];
          logger.warn({ tenantId, documentId, virus: viruses }, 'Malware detected');
          await documentRepo.updateStatus(tenantId, documentId, 'quarantined', 'infected');
          addSpanEvent('malware_detected', { virus: viruses.join(',') });
          await updatePipelineStatus(tenantId, documentId, 'failed', -1, 'Malware detected');

          const adminResult = await pool.query<{
            email: string;
            tenant_name: string;
            source_name: string;
          }>(
            `SELECT a.email, t.name AS tenant_name, d.source_name
             FROM attorneys a
             JOIN tenants t ON t.id = a.tenant_id
             JOIN documents d ON d.tenant_id = a.tenant_id AND d.id = $2
             WHERE a.tenant_id = $1
               AND a.role = 'admin'
               AND a.status = 'active'
             ORDER BY a.created_at ASC
             LIMIT 1`,
            [tenantId, documentId]
          );

          const adminContact = adminResult.rows[0];
          if (adminContact?.email) {
            try {
                await sendMalwareAlertEmail(
                  adminContact.email,
                  adminContact.source_name || documentId,
                  adminContact.tenant_name,
                  viruses
                );
            } catch (notifyError: any) {
              logger.error(
                { tenantId, documentId, error: notifyError.message },
                'Failed to send malware alert email'
              );
            }
          } else {
            logger.warn({ tenantId, documentId }, 'No active admin found for malware alert');
          }

          return { status: 'infected', viruses };
        }

        // Move from quarantine to uploads
        const cleanUri = fileUri.replace('/quarantine/', '/uploads/');
        await moveFile(fileUri, cleanUri);
        
        // Update document status
        await documentRepo.updateStatus(tenantId, documentId, 'scanned', 'clean');
        addSpanEvent('scan_passed');
        
        // Update pipeline status - scanned
        await updatePipelineStatus(tenantId, documentId, 'scanned', 15);

        // Enqueue next step
        await documentQueue.add('document.ingest', {
          tenantId,
          documentId,
        });

        logger.info({ tenantId, documentId }, 'Malware scan passed, queued for ingest');
        return { status: 'clean' };
      } catch (error: any) {
        logger.error({ err: error, tenantId, documentId }, 'Scan failed');
        await documentRepo.updateStatus(tenantId, documentId, 'failed', 'scan_error');
        await updatePipelineStatus(tenantId, documentId, 'failed', -1, error.message);
        throw error;
      }
    });
  },
  { 
    connection,
    concurrency: 3,
    limiter: { max: 10, duration: 60000 }, // 10 per minute
  }
);

// ============================================================================
// Worker: document.ingest
// ============================================================================

const documentIngestWorker = new Worker<DocumentIngestJob>(
  'document',
  async (job: Job<DocumentIngestJob>) => {
    if (job.name !== 'document.ingest') return;

    const { tenantId, documentId } = job.data;
    
    // Update pipeline status - ingesting
    await updatePipelineStatus(tenantId, documentId, 'ingesting', 25);
    
    return traceJob('document.ingest', job.id || documentId, async () => {
      logger.info({ tenantId, documentId }, 'Starting document ingestion');
      
      try {
        // Get document
        const document = await documentRepo.findById(tenantId, documentId) as DocumentRow | null;
        if (!document) throw new Error('Document not found');
        
        // Download file
        const fileUri = document.file_uri.replace('/quarantine/', '/uploads/');
        const fileBuffer = await downloadFile(fileUri);
        
        let normalizedText: string;
        let pageCount = 1;
        let ocrEngine = 'none';
        let ocrConfidence = 1.0;
        
        // Extract text based on MIME type
        if (document.mime_type === 'application/pdf') {
          // Try digital extraction first
          const pdfText = await extractPdfText(fileBuffer);
          
          if (pdfText && pdfText.length > 100) {
            normalizedText = pdfText;
            ocrEngine = 'native_pdf';
          } else {
            // Scanned PDF - use OCR
            const ocrResult = await callAiService('/ocr', {
              file: fileBuffer.toString('base64'),
              mime_type: document.mime_type,
            });
            normalizedText = ocrResult.text;
            pageCount = ocrResult.page_count || 1;
            ocrEngine = ocrResult.engine || 'tesseract';
            ocrConfidence = ocrResult.confidence || 0.9;
          }
        } else if (document.mime_type.startsWith('image/')) {
          // Image - always use OCR
          const ocrResult = await callAiService('/ocr', {
            file: fileBuffer.toString('base64'),
            mime_type: document.mime_type,
          });
          normalizedText = ocrResult.text;
          ocrEngine = ocrResult.engine || 'tesseract';
          ocrConfidence = ocrResult.confidence || 0.9;
        } else if (document.mime_type.includes('word') || document.mime_type.includes('docx')) {
          // Word document
          normalizedText = await extractWordText(fileBuffer);
          ocrEngine = 'native_docx';
        } else {
          // Plain text
          normalizedText = fileBuffer.toString('utf-8');
          ocrEngine = 'none';
        }
        
        const wordCount = normalizedText.split(/\s+/).length;
        
        // Update document with extracted text
        await documentRepo.updateAfterOcr(tenantId, documentId, {
          normalizedText,
          pageCount,
          wordCount,
          ocrEngine,
          ocrConfidence,
        });
        
        // Update pipeline status - embedding
        await updatePipelineStatus(tenantId, documentId, 'embedding', 50);
        
        // Chunk text and create embeddings
        const chunks = chunkText(normalizedText, 1500, 200);
        
        // Get embeddings from AI service
        const embeddingResult = await callAiService('/embed', {
          texts: chunks.map(c => c.text),
        });
        
        // Insert chunks with embeddings
        const chunkData = chunks.map((chunk, i) => ({
          chunkIndex: i,
          textContent: chunk.text,
          pageFrom: chunk.pageFrom,
          pageTo: chunk.pageTo,
          embedding: embeddingResult.embeddings[i],
        }));
        
        await vectorRepo.insertChunks(tenantId, documentId, chunkData);
        
        // Update pipeline status - embedded
        await updatePipelineStatus(tenantId, documentId, 'embedded', 60);
        
        // Queue clause extraction
        const matterResult = await pool.query(
          `SELECT matter_id FROM documents WHERE tenant_id = $1 AND id = $2`,
          [tenantId, documentId]
        );
        const matterId = matterResult.rows[0]?.matter_id;
        
        await clauseQueue.add('clause.extract', {
          tenantId,
          documentId,
          matterId,
        });
        
        logger.info({ tenantId, documentId, wordCount, chunks: chunks.length }, 'Document ingested');
        return { status: 'success', wordCount, chunks: chunks.length };
      } catch (error: any) {
        logger.error({ err: error, tenantId, documentId }, 'Ingestion failed');
        await documentRepo.updateStatus(tenantId, documentId, 'failed');
        await updatePipelineStatus(tenantId, documentId, 'failed', -1, error.message);
        throw error;
      }
    });
  },
  { connection, concurrency: 2 }
);

// ============================================================================
// Worker: clause.extract
// ============================================================================

const clauseExtractWorker = new Worker<ClauseExtractJob>(
  'clause',
  async (job: Job<ClauseExtractJob>) => {
    if (job.name !== 'clause.extract') return;

    const { tenantId, documentId, matterId } = job.data;
    
    // Update pipeline status - extracting clauses
    await updatePipelineStatus(tenantId, documentId, 'extracting_clauses', 70);
    
    return traceJob('clause.extract', job.id || documentId, async () => {
      logger.info({ tenantId, documentId }, 'Starting clause extraction');
      
      try {
        const document = await documentRepo.findById(tenantId, documentId) as DocumentRow | null;
        if (!document) throw new Error('Document not found');
        
        // Call AI service for clause extraction
        const extractResult = await callAiService('/extract-clauses', {
          text: document.normalized_text,
          doc_type: document.doc_type,
        });
        
        // Insert clauses
        const clauseData = extractResult.clauses.map((c: any) => ({
          clauseType: c.clause_type,
          heading: c.heading,
          textExcerpt: c.text_excerpt,
          pageFrom: c.page_from,
          pageTo: c.page_to,
          riskLevel: c.risk_level,
          confidence: c.confidence,
          riskFactors: c.risk_factors || [],
          extractionModel: extractResult.model || 'mistral:7b',
        }));
        
        const insertedClauses = await clauseRepo.bulkCreate(tenantId, documentId, clauseData);
        
        // Check for missing clauses
        const completenessResult = await callAiService('/check-completeness', {
          doc_type: document.doc_type,
          extracted_types: clauseData.map((c: any) => c.clauseType),
        });
        
        // Create flags for missing critical clauses
        for (const missing of completenessResult.missing || []) {
          if (missing.severity === 'critical' || missing.severity === 'high') {
            await flagRepo.create(tenantId, {
              matterId,
              documentId,
              flagType: 'missing_clause',
              severity: missing.severity,
              reason: `Missing ${missing.clause_type} clause: ${missing.reason}`,
              recommendedFix: missing.recommended_action,
            });
          }
        }
        
        // Update pipeline status - clauses extracted
        await updatePipelineStatus(tenantId, documentId, 'clauses_extracted', 80);
        
        // Queue risk assessment
        await riskQueue.add('risk.assess', {
          tenantId,
          documentId,
          matterId,
        });
        
        logger.info({ tenantId, documentId, clauseCount: insertedClauses.length }, 'Clauses extracted');
        return { status: 'success', clauseCount: insertedClauses.length };
      } catch (error: any) {
        logger.error({ err: error, tenantId, documentId }, 'Clause extraction failed');
        await updatePipelineStatus(tenantId, documentId, 'failed', -1, error.message);
        throw error;
      }
    });
  },
  { connection, concurrency: 3 }
);

// ============================================================================
// Worker: risk.assess
// ============================================================================

const riskAssessWorker = new Worker<RiskAssessJob>(
  'risk',
  async (job: Job<RiskAssessJob>) => {
    if (job.name !== 'risk.assess') return;

    const { tenantId, documentId, matterId } = job.data;
    
    // Update pipeline status - assessing risk
    await updatePipelineStatus(tenantId, documentId, 'assessing_risk', 85);
    
    return traceJob('risk.assess', job.id || documentId, async () => {
      logger.info({ tenantId, documentId }, 'Starting risk assessment');
      
      try {
        // Get document and clauses
        const document = await documentRepo.findById(tenantId, documentId);
        if (!document) throw new Error('Document not found');
        
        const clauses = await clauseRepo.listByDocument(tenantId, documentId);
        
        // Get active playbook rules
        const playbooks = await pool.query(
          `SELECT rules FROM playbooks WHERE tenant_id = $1 AND is_active = TRUE`,
          [tenantId]
        );
        
        const allRules = playbooks.rows.flatMap((p: any) => JSON.parse(p.rules));
        
        // Get matter for jurisdiction context
        const matter = await matterRepo.findById(tenantId, matterId) as MatterRow | null;
        const jurisdiction = matter?.governing_law_state;
        
        // Assess each clause against playbook rules
        for (const clause of clauses) {
          const assessResult = await callAiService('/assess-risk', {
            clause: {
              type: clause.clause_type,
              text: clause.text_excerpt,
            },
            playbook_rules: allRules.filter((r: any) => r.clause_type === clause.clause_type),
            jurisdiction,
          });
          
          // Create flags for violations
          for (const violation of assessResult.violations || []) {
            await flagRepo.create(tenantId, {
              matterId,
              documentId,
              clauseId: clause.id,
              flagType: 'playbook_violation',
              severity: violation.severity,
              reason: violation.reason,
              playbookRule: violation.rule_id,
              recommendedFix: violation.recommended_fix,
              assessmentModel: assessResult.model || 'mistral:7b',
            });
          }
        }
        
        // Update matter health score
        const flagCounts = await pool.query(
          `SELECT severity, COUNT(*) as count FROM flags 
           WHERE tenant_id = $1 AND matter_id = $2 AND status = 'open'
           GROUP BY severity`,
          [tenantId, matterId]
        );
        
        let healthScore = 100;
        for (const row of flagCounts.rows) {
          if (row.severity === 'critical') healthScore -= row.count * 15;
          else if (row.severity === 'warn') healthScore -= row.count * 5;
          else healthScore -= row.count * 1;
        }
        
        await matterRepo.update(tenantId, matterId, {
          healthScore: Math.max(0, Math.min(100, healthScore)),
        });
        
        // Update pipeline status - risk assessed
        await updatePipelineStatus(tenantId, documentId, 'risk_assessed', 90);
        
        // Queue obligation extraction
        await obligationQueue.add('obligation.extract', {
          tenantId,
          documentId,
          matterId,
        });
        
        logger.info({ tenantId, documentId, healthScore }, 'Risk assessment complete');
        return { status: 'success' };
      } catch (error: any) {
        logger.error({ err: error, tenantId, documentId }, 'Risk assessment failed');
        await updatePipelineStatus(tenantId, documentId, 'failed', -1, error.message);
        throw error;
      }
    });
  },
  { connection, concurrency: 3 }
);

// ============================================================================
// Worker: obligation.extract
// ============================================================================

const obligationExtractWorker = new Worker<ObligationExtractJob>(
  'obligation',
  async (job: Job<ObligationExtractJob>) => {
    if (job.name !== 'obligation.extract') return;

    const { tenantId, documentId, matterId } = job.data;
    
    // Update pipeline status - extracting obligations
    await updatePipelineStatus(tenantId, documentId, 'extracting_obligations', 95);
    
    return traceJob('obligation.extract', job.id || documentId, async () => {
      logger.info({ tenantId, documentId }, 'Starting obligation extraction');
      
      try {
        const document = await documentRepo.findById(tenantId, documentId) as DocumentRow | null;
        if (!document) throw new Error('Document not found');
        
        // Call AI service
        const extractResult = await callAiService('/extract-obligations', {
          text: document.normalized_text,
          doc_type: document.doc_type,
        });
        
        // Insert obligations
        const obligationData = extractResult.obligations.map((o: any) => ({
          matterId,
          documentId,
          obligationType: o.type,
          party: o.party,
          description: o.description,
          deadlineDate: o.deadline_date ? new Date(o.deadline_date) : undefined,
          deadlineText: o.deadline_text,
          noticeDays: o.notice_days,
          recurrenceRule: o.recurrence_rule,
        }));
        
        const insertedObligations = await obligationRepo.bulkCreate(tenantId, obligationData);
        
        // Update pipeline status - completed!
        await updatePipelineStatus(tenantId, documentId, 'completed', 100);
        
        // Emit WebSocket event for real-time update
        await emitWebSocketEvent(tenantId, {
          type: 'document.processed',
          documentId,
          matterId,
          status: 'complete',
        });
        
        // Trigger webhooks
        await triggerWebhooks(tenantId, 'document.processed', {
          documentId,
          matterId,
          clauseCount: (await clauseRepo.listByDocument(tenantId, documentId)).length,
          obligationCount: insertedObligations.length,
        });
        
        logger.info({ tenantId, documentId, obligationCount: insertedObligations.length }, 'Pipeline complete');
        return { status: 'success', obligationCount: insertedObligations.length };
      } catch (error: any) {
        logger.error({ err: error, tenantId, documentId }, 'Obligation extraction failed');
        await updatePipelineStatus(tenantId, documentId, 'failed', -1, error.message);
        throw error;
      }
    });
  },
  { connection, concurrency: 3 }
);

// ============================================================================
// Helper Functions
// ============================================================================

async function callAiService(endpoint: string, data: any): Promise<any> {
  const response = await axios.post(`${config.AI_SERVICE_URL}${endpoint}`, data, {
    timeout: config.AI_SERVICE_TIMEOUT_MS || 60000,
  });
  return response.data;
}

function chunkText(text: string, chunkSize: number, overlap: number): Array<{ text: string; pageFrom?: number; pageTo?: number }> {
  const chunks: Array<{ text: string; pageFrom?: number; pageTo?: number }> = [];
  const words = text.split(/\s+/);
  const wordsPerChunk = Math.floor(chunkSize / 5); // Approximate
  const overlapWords = Math.floor(overlap / 5);
  
  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + wordsPerChunk);
    chunks.push({ text: chunkWords.join(' ') });
    i += wordsPerChunk - overlapWords;
  }
  
  return chunks;
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  // Using pdf-parse or similar
  try {
    const pdfParse = await import('pdf-parse');
    const data = await pdfParse.default(buffer);
    return data.text;
  } catch {
    return '';
  }
}

async function extractWordText(buffer: Buffer): Promise<string> {
  // Using mammoth for docx
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch {
    return '';
  }
}

async function emitWebSocketEvent(tenantId: string, event: any): Promise<void> {
  // Publish to Redis for WebSocket distribution
  await connection.publish(`ws:tenant:${tenantId}`, JSON.stringify(event));
}

async function triggerWebhooks(tenantId: string, eventType: string, payload: any): Promise<void> {
  const webhooks = await pool.query(
    `SELECT url, secret FROM webhooks 
     WHERE tenant_id = $1 AND is_active = TRUE AND $2 = ANY(events)`,
    [tenantId, eventType]
  );
  
  for (const webhook of webhooks.rows) {
    const timestamp = Date.now();
    const signature = crypto
      .createHmac('sha256', webhook.secret)
      .update(`${timestamp}.${JSON.stringify(payload)}`)
      .digest('hex');
    
    try {
      await axios.post(webhook.url, {
        event: eventType,
        timestamp,
        data: payload,
      }, {
        headers: {
          'X-EvidentIS-Signature': `t=${timestamp},v1=${signature}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });
      
      await pool.query(
        `UPDATE webhooks SET last_triggered_at = now() WHERE url = $1 AND tenant_id = $2`,
        [webhook.url, tenantId]
      );
    } catch (error: any) {
      logger.warn({ url: webhook.url, error: error.message }, 'Webhook delivery failed');
    }
  }
}

// ============================================================================
// Graceful Shutdown
// ============================================================================

/**
 * Gracefully drain all workers and close Redis connection.
 * Called by worker-main.ts on SIGTERM/SIGINT.
 * NOTE: Signal handlers are in worker-main.ts, not here (worker.ts is a library now).
 */
export async function gracefulShutdown(): Promise<void> {
  logger.info('Draining BullMQ workers...');
  
  await Promise.all([
    documentScanWorker.close(),
    documentIngestWorker.close(),
    clauseExtractWorker.close(),
    riskAssessWorker.close(),
    obligationExtractWorker.close(),
  ]);
  
  await connection.quit();
  logger.info('Workers drained and Redis connection closed');
}

// ============================================================================
// Worker Startup
// ============================================================================

export function startWorkers(): void {
  logger.info('Starting BullMQ workers...');
  
  // Workers are auto-started when created
  documentScanWorker.on('completed', (job) => {
    logger.debug({ jobId: job.id, jobName: job.name }, 'Job completed');
  });
  
  documentScanWorker.on('failed', async (job, err) => {
    if (!job) return;
    logger.error({ jobId: job.id, jobName: job.name, err }, 'Job failed');
    
    // Move to dead-letter queue after all retries exhausted
    if (job.attemptsMade >= (job.opts.attempts || 3)) {
      await moveToDeadLetter(job, err);
    }
  });

  // Add failure handlers for all workers
  const workers = [documentIngestWorker, clauseExtractWorker, riskAssessWorker, obligationExtractWorker];
  for (const worker of workers) {
    worker.on('completed', (job) => {
      logger.debug({ jobId: job.id, jobName: job.name, queue: job.queueName }, 'Job completed');
    });
    
    worker.on('failed', async (job, err) => {
      if (!job) return;
      logger.error({ jobId: job.id, jobName: job.name, queue: job.queueName, err }, 'Job failed');
      
      if (job.attemptsMade >= (job.opts.attempts || 3)) {
        await moveToDeadLetter(job, err);
      }
    });
  }
  
  logger.info({
    queues: ['document', 'clause', 'risk', 'obligation'],
    retryConfig: DEFAULT_JOB_OPTIONS,
  }, 'Workers started with retry policies');
}

// ============================================================================
// Queue Helper Functions (for API routes)
// ============================================================================

export async function enqueueDocumentScan(tenantId: string, documentId: string, fileUri: string): Promise<string> {
  const job = await documentQueue.add('document.scan', {
    tenantId,
    documentId,
    fileUri,
  });
  return job.id || documentId;
}

export async function addJob(
  name: 'report.generate' | 'obligation.remind' | 'document.scan',
  data: Record<string, unknown>
): Promise<Job> {
  switch (name) {
    case 'document.scan': {
      const { tenantId, documentId, fileUri } = data as Partial<DocumentScanJob>;
      if (!tenantId || !documentId || !fileUri) {
        throw new Error('document.scan requires tenantId, documentId, and fileUri');
      }
      return documentQueue.add(name, { tenantId, documentId, fileUri });
    }
    case 'obligation.remind':
      return obligationQueue.add(name, data);
    case 'report.generate':
      return documentQueue.add(name, data);
    default:
      throw new Error(`Unsupported job type: ${name}`);
  }
}

export async function getJobStatus(queueName: string, jobId: string): Promise<any> {
  const queues: Record<string, Queue> = {
    document: documentQueue,
    clause: clauseQueue,
    risk: riskQueue,
    obligation: obligationQueue,
  };
  
  const queue = queues[queueName];
  if (!queue) return null;
  
  const job = await queue.getJob(jobId);
  if (!job) return null;
  
  const state = await job.getState();
  const progress = job.progress;
  
  return {
    id: job.id,
    name: job.name,
    state,
    progress,
    data: job.data,
    returnvalue: job.returnvalue,
    failedReason: job.failedReason,
    timestamp: job.timestamp,
  };
}
