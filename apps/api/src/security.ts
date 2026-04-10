/**
 * EvidentIS Security Module
 * Cryptographic utilities for password hashing, encryption, and token generation
 */

import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { config } from './config.js';

// ============================================================
// CONSTANTS
// ============================================================

const BCRYPT_COST = 12;
const AES_ALGORITHM = 'aes-256-gcm';
const TOKEN_BYTES = 32;

// ============================================================
// PASSWORD HASHING (bcrypt)
// ============================================================

/**
 * Hash a password using bcrypt with cost factor 12
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify a password against a bcrypt hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Validate password against policy
 */
export function validatePasswordPolicy(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (password.length < 12) {
    errors.push('Password must be at least 12 characters');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  if (!/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }

  return { valid: errors.length === 0, errors };
}

// ============================================================
// AES-256-GCM ENCRYPTION
// ============================================================

/**
 * Get encryption key from config (32 bytes)
 */
function getEncryptionKey(): Buffer {
  const key = config.APP_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('APP_ENCRYPTION_KEY is not configured');
  }
  return Buffer.from(key, 'hex');
}

/**
 * Encrypt a string using AES-256-GCM
 * Returns: base64 encoded string with format: iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(AES_ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  const authTag = cipher.getAuthTag();

  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with AES-256-GCM
 */
export function decrypt(encrypted: string): string {
  const key = getEncryptionKey();
  const [ivBase64, authTagBase64, ciphertext] = encrypted.split(':');

  if (!ivBase64 || !authTagBase64 || !ciphertext) {
    throw new Error('Invalid encrypted format');
  }

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');
  const decipher = crypto.createDecipheriv(AES_ALGORITHM, key, iv, { authTagLength: 16 });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}

// ============================================================
// TOKEN GENERATION
// ============================================================

/**
 * Generate a cryptographically secure random token
 * Returns a hex string
 */
export function generateSecureToken(bytes = TOKEN_BYTES): string {
  return crypto.randomBytes(bytes).toString('hex');
}

// Backward-compatible aliases used by legacy tests
export const generateToken = generateSecureToken;
export const encryptField = encrypt;
export const decryptField = decrypt;

/**
 * Generate a SHA-256 hash of a token (for storage)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate an API key with prefix
 * Returns: { key: 'lx_abc123...', prefix: 'lx_abc', hash: 'sha256hash' }
 */
export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const token = generateSecureToken(32);
  const key = `lx_${token}`;
  const prefix = `lx_${token.slice(0, 8)}`;
  const hash = hashToken(key);

  return { key, prefix, hash };
}

/**
 * Generate SCIM bearer token
 */
export function generateScimToken(): { token: string; prefix: string; hash: string } {
  const token = generateSecureToken(32);
  const bearerToken = `scim_${token}`;
  const prefix = `scim_${token.slice(0, 8)}`;
  const hash = hashToken(bearerToken);

  return { token: bearerToken, prefix, hash };
}

// ============================================================
// MFA UTILITIES
// ============================================================

/**
 * Generate recovery codes (10 codes, 8 chars each)
 */
export function generateRecoveryCodes(count = 10): string[] {
  return Array.from({ length: count }, () =>
    crypto.randomBytes(4).toString('hex').toUpperCase()
  );
}

/**
 * Hash recovery codes for storage
 */
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((code) => bcrypt.hash(code, BCRYPT_COST)));
}

/**
 * Verify a recovery code against hashed codes
 * Returns the index of matching code, or -1 if not found
 */
export async function verifyRecoveryCode(
  code: string,
  hashedCodes: string[]
): Promise<number> {
  for (let i = 0; i < hashedCodes.length; i++) {
    const match = await bcrypt.compare(code.toUpperCase(), hashedCodes[i]);
    if (match) return i;
  }
  return -1;
}

// ============================================================
// SHA-256 HASH
// ============================================================

/**
 * Compute SHA-256 hash of data
 */
export function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Compute SHA-256 hash of a file stream
 */
export async function sha256Stream(stream: NodeJS.ReadableStream): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}
