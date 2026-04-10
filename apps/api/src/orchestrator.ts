/**
 * EvidentIS Document Processing Orchestrator
 * Defines the workflow for document processing pipeline
 * Uses BullMQ Flow for declarative job chaining
 */

import { FlowProducer, type FlowJob, Queue, Job } from 'bullmq';
import { Redis } from 'ioredis';
import { config } from './config.js';
import { logger } from './logger.js';

// ============================================================================
// Pipeline Definitions
// ============================================================================

/**
 * Document processing pipeline stages:
 * 1. Upload (sync) → 2. Scan → 3. Ingest/OCR → 4. Chunk/Embed → 
 * 5. Extract Clauses → 6. Assess Risk → 7. Extract Obligations → 8. Complete
 */

export type PipelineStage = 
  | 'uploaded'
  | 'scanning'
  | 'scanned'
  | 'ingesting'
  | 'ingested'
  | 'embedding'
  | 'embedded'
  | 'extracting_clauses'
  | 'clauses_extracted'
  | 'assessing_risk'
  | 'risk_assessed'
  | 'extracting_obligations'
  | 'completed'
  | 'failed';

export interface PipelineStatus {
  documentId: string;
  tenantId: string;
  matterId: string;
  stage: PipelineStage;
  progress: number; // 0-100
  startedAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
  metadata?: Record<string, unknown>;
}

// Stage weights for progress calculation
const STAGE_WEIGHTS: Record<PipelineStage, number> = {
  uploaded: 5,
  scanning: 10,
  scanned: 15,
  ingesting: 25,
  ingested: 35,
  embedding: 50,
  embedded: 60,
  extracting_clauses: 70,
  clauses_extracted: 80,
  assessing_risk: 85,
  risk_assessed: 90,
  extracting_obligations: 95,
  completed: 100,
  failed: -1,
};

// ============================================================================
// Flow Producer
// ============================================================================

let flowProducer: FlowProducer | null = null;

function getFlowProducer(): FlowProducer {
  if (!flowProducer) {
    const connection = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
    });
    flowProducer = new FlowProducer({ connection });
  }
  return flowProducer;
}

// ============================================================================
// Status Client (Singleton) - Issue #1 fix: Avoid connection churn
// ============================================================================

let statusClient: Redis | null = null;

function getStatusClient(): Redis {
  if (!statusClient) {
    statusClient = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      lazyConnect: true,
    });
  }
  return statusClient;
}

// ============================================================================
// Pipeline Orchestration
// ============================================================================

export interface StartPipelineOptions {
  tenantId: string;
  documentId: string;
  matterId: string;
  fileUri: string;
  priority?: number;
  skipScan?: boolean; // For pre-scanned uploads
}

/**
 * Start the full document processing pipeline
 * Creates a flow of dependent jobs
 */
export async function startDocumentPipeline(options: StartPipelineOptions): Promise<string> {
  const { tenantId, documentId, matterId, fileUri, priority = 0, skipScan = false } = options;
  
  const flowId = `pipeline:${documentId}`;
  
  logger.info({ tenantId, documentId, matterId }, 'Starting document pipeline');

  const producer = getFlowProducer();
  
  // Build the flow tree (executed bottom-up)
  const flow: FlowJob = {
    name: 'pipeline.complete',
    queueName: 'document',
    data: { tenantId, documentId, matterId },
    opts: { priority },
    children: [
      {
        name: 'document.extract-obligations',
        queueName: 'obligation',
        data: { tenantId, documentId, matterId },
        opts: { priority },
        children: [
          {
            name: 'document.assess-risk',
            queueName: 'risk',
            data: { tenantId, documentId, matterId },
            opts: { priority },
            children: [
              {
                name: 'document.extract-clauses',
                queueName: 'clause',
                data: { tenantId, documentId, matterId },
                opts: { priority },
                children: [
                  {
                    name: 'document.embed',
                    queueName: 'document',
                    data: { tenantId, documentId },
                    opts: { priority },
                    children: [
                      {
                        name: 'document.ingest',
                        queueName: 'document',
                        data: { tenantId, documentId },
                        opts: { priority },
                        children: skipScan ? [] : [
                          {
                            name: 'document.scan',
                            queueName: 'document',
                            data: { tenantId, documentId, fileUri },
                            opts: { priority },
                          }
                        ],
                      }
                    ],
                  }
                ],
              }
            ],
          }
        ],
      }
    ],
  };

  const result = await producer.add(flow);
  
  logger.info({ tenantId, documentId, flowId: result.job.id }, 'Document pipeline started');
  
  return result.job.id || flowId;
}

/**
 * Get pipeline status for a document
 */
export async function getPipelineStatus(
  tenantId: string,
  documentId: string
): Promise<PipelineStatus | null> {
  const redis = getStatusClient();
  
  const key = `pipeline:status:${tenantId}:${documentId}`;
  const data = await redis.get(key);
  
  if (!data) return null;
  
  return JSON.parse(data) as PipelineStatus;
}

/**
 * Update pipeline status
 * @param progress - Optional explicit progress (overrides STAGE_WEIGHTS)
 * @param errorMessage - Optional error message for failed stage
 */
export async function updatePipelineStatus(
  tenantId: string,
  documentId: string,
  stage: PipelineStage,
  progress?: number,
  errorMessage?: string
): Promise<void> {
  const redis = getStatusClient();
  
  const key = `pipeline:status:${tenantId}:${documentId}`;
  const existing = await redis.get(key);
  
  const now = new Date();
  const computedProgress = progress !== undefined ? progress : STAGE_WEIGHTS[stage];
  
  const status: PipelineStatus = existing 
    ? { ...JSON.parse(existing), stage, updatedAt: now, progress: computedProgress }
    : {
        documentId,
        tenantId,
        matterId: '',
        stage,
        progress: computedProgress,
        startedAt: now,
        updatedAt: now,
      };
  
  if (errorMessage) {
    status.error = errorMessage;
  }
  
  if (stage === 'completed' || stage === 'failed') {
    status.completedAt = now;
  }
  
  // Store with 24h TTL
  await redis.setex(key, 86400, JSON.stringify(status));
  
  // Publish status update for real-time notifications
  await redis.publish(`pipeline:${tenantId}`, JSON.stringify({
    type: 'pipeline_status',
    documentId,
    stage,
    progress: status.progress,
    error: errorMessage,
  }));
}

/**
 * Cancel a running pipeline
 * Removes all waiting/delayed jobs for this document and updates status to failed
 */
export async function cancelPipeline(
  tenantId: string,
  documentId: string
): Promise<boolean> {
  const client = getStatusClient();
  const connection = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  
  try {
    // Get current status
    const status = await getPipelineStatus(tenantId, documentId);
    if (!status) {
      logger.warn({ tenantId, documentId }, 'Cannot cancel: pipeline not found');
      return false;
    }
    
    if (status.stage === 'completed' || status.stage === 'failed') {
      logger.info({ tenantId, documentId }, 'Pipeline already finished, nothing to cancel');
      return true;
    }
    
    // List of all pipeline queues to check
    const queueNames = ['document', 'clause', 'risk', 'obligation'];
    
    let removedCount = 0;
    
    // Iterate each queue and remove jobs matching this document
    for (const queueName of queueNames) {
      const queue = new Queue(queueName, { connection });
      
      // Get waiting jobs
      const waitingJobs = await queue.getWaiting(0, 1000);
      for (const job of waitingJobs) {
        if (job.data?.documentId === documentId && job.data?.tenantId === tenantId) {
          await job.remove();
          removedCount++;
          logger.debug({ queueName, jobId: job.id }, 'Removed waiting job');
        }
      }
      
      // Get delayed jobs
      const delayedJobs = await queue.getDelayed(0, 1000);
      for (const job of delayedJobs) {
        if (job.data?.documentId === documentId && job.data?.tenantId === tenantId) {
          await job.remove();
          removedCount++;
          logger.debug({ queueName, jobId: job.id }, 'Removed delayed job');
        }
      }
      
      await queue.close();
    }
    
    // Update pipeline status to failed with cancellation message
    await updatePipelineStatus(
      tenantId,
      documentId,
      'failed',
      -1,
      'Cancelled by user'
    );
    
    logger.info({ tenantId, documentId, removedCount }, 'Pipeline cancelled successfully');
    return true;
    
  } catch (error) {
    logger.error({ tenantId, documentId, error }, 'Failed to cancel pipeline');
    return false;
  } finally {
    await connection.quit();
  }
}

// ============================================================================
// Cleanup
// ============================================================================

export async function closeOrchestrator(): Promise<void> {
  if (flowProducer) {
    await flowProducer.close();
    flowProducer = null;
  }
  if (statusClient) {
    await statusClient.quit();
    statusClient = null;
  }
}
