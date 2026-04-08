/**
 * LexOS Worker Entry Point
 * Starts all BullMQ workers for async document processing pipeline
 */

import { startWorkers, gracefulShutdown as drainWorkers } from './worker.js';
import { logger } from './logger.js';
import { closeDatabasePool } from './database.js';
import fs from 'node:fs';

const HEARTBEAT_PATH = '/tmp/worker-heartbeat';
const HEARTBEAT_INTERVAL_MS = 30_000;

function writeHeartbeat(): void {
  try {
    fs.writeFileSync(HEARTBEAT_PATH, new Date().toISOString(), 'utf8');
  } catch (error) {
    logger.error({ error }, 'Failed to write worker heartbeat');
  }
}

logger.info('Starting LexOS worker process...');

// Start all BullMQ workers
startWorkers();
logger.info('All workers started successfully');

// Write heartbeat to support liveness probing
writeHeartbeat();
const heartbeatInterval = setInterval(() => {
  writeHeartbeat();
}, HEARTBEAT_INTERVAL_MS);

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Worker received shutdown signal...');
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
