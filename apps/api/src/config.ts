/**
 * EvidentIS API Configuration
 * Zod-validated environment configuration with 80+ variables
 */

import { z } from 'zod';

// ============================================================
// CONFIGURATION SCHEMA
// ============================================================

// Detect production early for schema validation
const isProductionEnv = process.env.NODE_ENV === 'production';

const configSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  HOST: z.string().default('0.0.0.0'),

  // Auth - JWT RS256
  JWT_PRIVATE_KEY_PATH: z.string().default('./keys/private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().default('./keys/public.pem'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_DAYS: z.coerce.number().default(7),
  JWT_ISSUER: z.string().default('evidentis'),
  JWT_AUDIENCE: z.string().default('evidentis-api'),

  // Encryption - REQUIRED in production (Issue #4 fix)
  APP_ENCRYPTION_KEY: isProductionEnv 
    ? z.string().min(64, 'APP_ENCRYPTION_KEY must be at least 64 chars in production')
    : z.string().min(64).optional(), // 32-byte hex

  // Database
  DATABASE_URL: z.string().url(),
  DB_POOL_MAX: z.coerce.number().default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().default(30000),
  DB_CONNECT_TIMEOUT_MS: z.coerce.number().default(5000),
  DB_SSL: z.enum(['true', 'false']).default('false'),
  DB_SSL_CA: z.string().optional(),

  // Seed
  SEED_DEMO_DATA: z.enum(['true', 'false']).default('false'),

  // Redis
  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  REDIS_DB_QUEUE: z.coerce.number().default(0),
  REDIS_DB_CACHE: z.coerce.number().default(3),

  // Storage
  STORAGE_BACKEND: z.enum(['local', 's3']).default('local'),
  LOCAL_STORAGE_PATH: z.string().default('./storage'),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default('evidentis-documents'),
  S3_ENDPOINT: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('false'),

  // AI Service
  AI_SERVICE_URL: z.string().url().default('http://localhost:5000'),
  AI_SERVICE_TIMEOUT_MS: z.coerce.number().default(60000),

  // Malware Scanner
  MALWARE_SCANNER: z.enum(['clamav', 'none']).default('clamav'),
  CLAMAV_HOST: z.string().default('localhost'),
  CLAMAV_PORT: z.coerce.number().default(3310),

  // Email
  EMAIL_DELIVERY_MODE: z.enum(['log', 'smtp']).default('log'),
  MAIL_FROM: z.string().email().default('noreply@evidentis.law'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),

  // Paddle
  PADDLE_VENDOR_ID: z.string().optional(),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_PRICE_STARTER: z.string().optional(),
  PADDLE_PRICE_GROWTH: z.string().optional(),
  PADDLE_PRICE_PROFESSIONAL: z.string().optional(),

  // Observability
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  OTEL_SERVICE_NAME: z.string().default('evidentis-api'),

  // OpenAI (Premium fallback)
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default('gpt-4o'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),

  // Frontend URL
  FRONTEND_URL: z.string().url().default('http://localhost:3000'),

  // CORS
  CORS_ORIGINS: z.string().default('http://localhost:3000'),

  // Rate Limits
  RATE_LIMIT_AUTH_REQUESTS: z.coerce.number().default(10),
  RATE_LIMIT_AUTH_WINDOW_MINUTES: z.coerce.number().default(15),
  RATE_LIMIT_UPLOAD_REQUESTS: z.coerce.number().default(20),
  RATE_LIMIT_UPLOAD_WINDOW_MINUTES: z.coerce.number().default(60),
  RATE_LIMIT_RESEARCH_REQUESTS: z.coerce.number().default(100),
  RATE_LIMIT_RESEARCH_WINDOW_MINUTES: z.coerce.number().default(60),
  RATE_LIMIT_GENERAL_REQUESTS: z.coerce.number().default(1000),
  RATE_LIMIT_GENERAL_WINDOW_MINUTES: z.coerce.number().default(60),

  // File Uploads
  MAX_FILE_SIZE_BYTES: z.coerce.number().default(50 * 1024 * 1024), // 50MB
  MAX_BATCH_SIZE_BYTES: z.coerce.number().default(200 * 1024 * 1024), // 200MB

  // Password Policy
  PASSWORD_MIN_LENGTH: z.coerce.number().default(12),
  PASSWORD_REQUIRE_UPPERCASE: z.enum(['true', 'false']).default('true'),
  PASSWORD_REQUIRE_LOWERCASE: z.enum(['true', 'false']).default('true'),
  PASSWORD_REQUIRE_NUMBER: z.enum(['true', 'false']).default('true'),
  PASSWORD_REQUIRE_SPECIAL: z.enum(['true', 'false']).default('true'),

  // Account Lockout
  MAX_FAILED_LOGIN_ATTEMPTS: z.coerce.number().default(5),
  LOCKOUT_DURATION_MINUTES: z.coerce.number().default(15),

  // WebAuthn
  WEBAUTHN_RP_NAME: z.string().default('EvidentIS'),
  WEBAUTHN_RP_ID: z.string().default('localhost'),
  WEBAUTHN_ORIGIN: z.string().default('http://localhost:3000'),
});

// ============================================================
// PARSE AND EXPORT CONFIG
// ============================================================

function loadConfig() {
  const result = configSchema.safeParse(process.env);

  if (!result.success) {
    console.error('❌ Invalid environment configuration:');
    for (const error of result.error.errors) {
      console.error(`  - ${error.path.join('.')}: ${error.message}`);
    }
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();

// ============================================================
// DERIVED HELPERS
// ============================================================

export const isProduction = config.NODE_ENV === 'production';
export const isDevelopment = config.NODE_ENV === 'development';
export const isTest = config.NODE_ENV === 'test';

export const corsOrigins = config.CORS_ORIGINS.split(',').map((o) => o.trim());

export const passwordPolicy = {
  minLength: config.PASSWORD_MIN_LENGTH,
  requireUppercase: config.PASSWORD_REQUIRE_UPPERCASE === 'true',
  requireLowercase: config.PASSWORD_REQUIRE_LOWERCASE === 'true',
  requireNumber: config.PASSWORD_REQUIRE_NUMBER === 'true',
  requireSpecial: config.PASSWORD_REQUIRE_SPECIAL === 'true',
};

export const rateLimits = {
  auth: {
    requests: config.RATE_LIMIT_AUTH_REQUESTS,
    windowMs: config.RATE_LIMIT_AUTH_WINDOW_MINUTES * 60 * 1000,
  },
  upload: {
    requests: config.RATE_LIMIT_UPLOAD_REQUESTS,
    windowMs: config.RATE_LIMIT_UPLOAD_WINDOW_MINUTES * 60 * 1000,
  },
  research: {
    requests: config.RATE_LIMIT_RESEARCH_REQUESTS,
    windowMs: config.RATE_LIMIT_RESEARCH_WINDOW_MINUTES * 60 * 1000,
  },
  general: {
    requests: config.RATE_LIMIT_GENERAL_REQUESTS,
    windowMs: config.RATE_LIMIT_GENERAL_WINDOW_MINUTES * 60 * 1000,
  },
};
