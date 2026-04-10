/**
 * EvidentIS Database Connection
 * PostgreSQL connection pool with proper connection management
 */

import pg from 'pg';
import fs from 'fs';
import { config } from './config.js';
import { logger } from './logger.js';

const { Pool } = pg;

// ============================================================
// CONNECTION POOL
// ============================================================

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DB_POOL_MAX,
  idleTimeoutMillis: config.DB_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: config.DB_CONNECT_TIMEOUT_MS,
  ssl: config.DB_SSL === 'true'
    ? {
        rejectUnauthorized: true,
        ca: config.DB_SSL_CA ? fs.readFileSync(config.DB_SSL_CA, 'utf8') : undefined,
      }
    : false,
});

// Connection event handlers
pool.on('connect', () => {
  logger.debug('Database client connected');
});

pool.on('error', (err) => {
  logger.error({ err }, 'Unexpected database pool error');
});

// ============================================================
// QUERY HELPERS
// ============================================================

export interface QueryResult<T> {
  rows: T[];
  rowCount: number;
}

/**
 * Execute a parameterized query
 * NEVER use string concatenation for values - always use $N placeholders
 */
export async function query<T = unknown>(
  text: string,
  values?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  const result = await pool.query(text, values);
  const duration = Date.now() - start;

  logger.debug({ query: text, duration, rows: result.rowCount }, 'Query executed');

  return {
    rows: result.rows as T[],
    rowCount: result.rowCount || 0,
  };
}

/**
 * Execute a query and return the first row or null
 */
export async function queryOne<T = unknown>(
  text: string,
  values?: unknown[]
): Promise<T | null> {
  const result = await query<T>(text, values);
  return result.rows[0] || null;
}

/**
 * Execute a query expecting exactly one row
 * Throws if no row or multiple rows found
 */
export async function queryExactlyOne<T = unknown>(
  text: string,
  values?: unknown[]
): Promise<T> {
  const result = await query<T>(text, values);
  if (result.rowCount === 0) {
    throw new Error('Expected exactly one row, got none');
  }
  if (result.rowCount > 1) {
    throw new Error(`Expected exactly one row, got ${result.rowCount}`);
  }
  return result.rows[0];
}

// ============================================================
// TRANSACTION SUPPORT
// ============================================================

export interface Transaction {
  query: <T>(text: string, values?: unknown[]) => Promise<QueryResult<T>>;
  queryOne: <T>(text: string, values?: unknown[]) => Promise<T | null>;
  commit: () => Promise<void>;
  rollback: () => Promise<void>;
}

/**
 * Start a database transaction
 * Usage:
 *   const tx = await beginTransaction();
 *   try {
 *     await tx.query('INSERT ...');
 *     await tx.commit();
 *   } catch (e) {
 *     await tx.rollback();
 *     throw e;
 *   }
 */
export async function beginTransaction(): Promise<Transaction> {
  const client = await pool.connect();
  await client.query('BEGIN');

  return {
    query: async <T>(text: string, values?: unknown[]): Promise<QueryResult<T>> => {
      const result = await client.query(text, values);
      return {
        rows: result.rows as T[],
        rowCount: result.rowCount || 0,
      };
    },
    queryOne: async <T>(text: string, values?: unknown[]): Promise<T | null> => {
      const result = await client.query(text, values);
      return (result.rows[0] as T) || null;
    },
    commit: async () => {
      await client.query('COMMIT');
      client.release();
    },
    rollback: async () => {
      await client.query('ROLLBACK');
      client.release();
    },
  };
}

/**
 * Execute a function within a transaction
 * Automatically commits on success, rolls back on error
 */
export async function withTransaction<T>(
  fn: (tx: Transaction) => Promise<T>
): Promise<T> {
  const tx = await beginTransaction();
  try {
    const result = await fn(tx);
    await tx.commit();
    return result;
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

// ============================================================
// HEALTH CHECK
// ============================================================

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    await query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

// ============================================================
// GRACEFUL SHUTDOWN
// ============================================================

export async function closeDatabasePool(): Promise<void> {
  logger.info('Closing database pool...');
  await pool.end();
  logger.info('Database pool closed');
}
