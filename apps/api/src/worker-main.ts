/**
 * EvidentIS Worker Entry Point
 * Starts all BullMQ workers for async document processing pipeline
 */

import { startWorkers, gracefulShutdown as drainWorkers, documentQueue } from './worker.js';
import { logger } from './logger.js';
import { closeDatabasePool } from './database.js';
import fs from 'node:fs';
import http from 'node:http';
import { collectDefaultMetrics, Gauge, Registry, Counter } from 'prom-client';

const HEARTBEAT_PATH = '/tmp/worker-heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;
const METRICS_PORT = 9100;
const METRICS_INTERVAL_MS = 15_000;

const register = new Registry();
collectDefaultMetrics({ register });

const queueDepthGauge = new Gauge({
  name: 'bullmq_document_queue_depth',
  help: 'Number of waiting jobs in BullMQ document queue',
  registers: [register],
});

const jobsProcessedCounter = new Counter({
  name: 'bullmq_jobs_processed_total',
  help: 'Total BullMQ jobs processed',
  labelNames: ['status'],
  registers: [register],
});

let previousCompletedCount = 0;
let previousFailedCount = 0;

function writeHeartbeat(): void {
  try {
    fs.writeFileSync(HEARTBEAT_PATH, new Date().toISOString(), 'utf8');
  } catch (error) {
    logger.error({ error }, 'Failed to write worker heartbeat');
  }
}

async function updateQueueMetrics(): Promise<void> {
  try {
    const waitingDepth = await documentQueue.getWaitingCount();
    queueDepthGauge.set(waitingDepth);

    const counts = await documentQueue.getJobCounts('completed', 'failed');
    const completedCount = counts.completed || 0;
    const failedCount = counts.failed || 0;

    const completedDelta = completedCount - previousCompletedCount;
    const failedDelta = failedCount - previousFailedCount;

    if (completedDelta > 0) {
      jobsProcessedCounter.inc({ status: 'completed' }, completedDelta);
    }
    if (failedDelta > 0) {
      jobsProcessedCounter.inc({ status: 'failed' }, failedDelta);
    }

    previousCompletedCount = completedCount;
    previousFailedCount = failedCount;
  } catch (error) {
    logger.warn({ error }, 'Failed to update worker queue metrics');
  }
}

logger.info('Starting EvidentIS worker process...');

// Start all BullMQ workers
startWorkers();
logger.info('All workers started successfully');

// Write heartbeat to support liveness probing
writeHeartbeat();
const heartbeatInterval = setInterval(() => {
  writeHeartbeat();
}, HEARTBEAT_INTERVAL_MS);

void updateQueueMetrics();
const metricsInterval = setInterval(() => {
  void updateQueueMetrics();
}, METRICS_INTERVAL_MS);

const metricsServer = http.createServer(async (req, res) => {
  if (req.url === '/metrics') {
    try {
      res.setHeader('Content-Type', register.contentType);
      res.end(await register.metrics());
    } catch (error) {
      logger.error({ error }, 'Failed to render metrics output');
      res.writeHead(500);
      res.end('metrics_error');
    }
    return;
  }

  res.writeHead(404);
  res.end();
});

metricsServer.on('error', (error) => {
  logger.error({ error }, 'Metrics server error');
});

metricsServer.listen(METRICS_PORT, () => {
  logger.info({ port: METRICS_PORT }, 'Metrics server listening');
});

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Worker received shutdown signal...');
  await new Promise<void>((resolve) => {
    metricsServer.close(() => resolve());
  });
  clearInterval(metricsInterval);
  clearInterval(heartbeatInterval);
  
  // 1. Drain BullMQ workers and close Redis
  await drainWorkers();
  
  // 2. Close database connections
  await closeDatabasePool();
  
  logger.info('Worker shutdown complete');
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// ============================================================
// ERROR HANDLING
// ============================================================

process.on('uncaughtException', (err) => {
  logger.error({ err }, 'Uncaught exception in worker');
  // Don't exit - let BullMQ handle job failures
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection in worker');
  // Don't exit - let BullMQ handle job failures
});

// Keep process alive - workers run indefinitely
logger.info('Worker process running. Press Ctrl+C to stop.');
