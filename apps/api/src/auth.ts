/**
 * EvidentIS JWT Authentication Module
 * RS256 JWT token issuance and validation
 */

import fs from 'fs';
import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { config, isProduction } from './config.js';
import { logger } from './logger.js';

// ============================================================
// TYPES
// ============================================================

export interface TokenPayload extends JWTPayload {
  sub: string; // Attorney ID
  tenantId: string;
  email: string;
  role: string;
  type: 'access' | 'refresh';
}

export interface AccessTokenPayload extends TokenPayload {
  type: 'access';
}

export interface RefreshTokenPayload extends TokenPayload {
  type: 'refresh';
  tokenId: string; // For refresh token rotation tracking
}

// ============================================================
// KEY LOADING
// ============================================================

let privateKey: CryptoKey | null = null;
let publicKey: CryptoKey | null = null;

async function loadKeys(): Promise<void> {
  if (privateKey && publicKey) return;

  try {
    // In development/test without keys, generate ephemeral keys
    if (!fs.existsSync(config.JWT_PRIVATE_KEY_PATH) && !isProduction) {
      logger.warn('JWT keys not found, using ephemeral keys (development only)');
      const keyPair = await crypto.subtle.generateKey(
        {
          name: 'RSASSA-PKCS1-v1_5',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['sign', 'verify']
      );
      privateKey = keyPair.privateKey;
      publicKey = keyPair.publicKey;
      return;
    }

    const privateKeyPem = fs.readFileSync(config.JWT_PRIVATE_KEY_PATH, 'utf8');
    const publicKeyPem = fs.readFileSync(config.JWT_PUBLIC_KEY_PATH, 'utf8');

    privateKey = await crypto.subtle.importKey(
      'pkcs8',
      pemToBuffer(privateKeyPem, 'PRIVATE'),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['sign']
    );

    publicKey = await crypto.subtle.importKey(
      'spki',
      pemToBuffer(publicKeyPem, 'PUBLIC'),
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );

    logger.info('JWT keys loaded successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to load JWT keys');
    throw error;
  }
}

function pemToBuffer(pem: string, type: 'PRIVATE' | 'PUBLIC'): ArrayBuffer {
  const header = `-----BEGIN ${type} KEY-----`;
  const footer = `-----END ${type} KEY-----`;
  const base64 = pem.replace(header, '').replace(footer, '').replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

// ============================================================
// TOKEN ISSUANCE
// ============================================================

/**
 * Generate an access token (15 minute expiry)
 */
export async function generateAccessToken(payload: {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
}): Promise<string> {
  await loadKeys();
  if (!privateKey) throw new Error('Private key not loaded');

  const token = await new SignJWT({
    ...payload,
    type: 'access',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setExpirationTime(config.JWT_ACCESS_EXPIRES_IN)
    .sign(privateKey);

  return token;
}

/**
 * Generate a refresh token (7 day expiry)
 */
export async function generateRefreshToken(payload: {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  tokenId: string;
}): Promise<string> {
  await loadKeys();
  if (!privateKey) throw new Error('Private key not loaded');

  const token = await new SignJWT({
    ...payload,
    type: 'refresh',
  })
    .setProtectedHeader({ alg: 'RS256', typ: 'JWT' })
    .setIssuedAt()
    .setIssuer(config.JWT_ISSUER)
    .setAudience(config.JWT_AUDIENCE)
    .setExpirationTime(`${config.JWT_REFRESH_EXPIRES_DAYS}d`)
    .sign(privateKey);

  return token;
}

// Backward-compatible aliases used by legacy tests and older call sites
export async function createAccessToken(payload: {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
}): Promise<string> {
  return generateAccessToken(payload);
}

export async function createRefreshToken(
  payloadOrSub:
    | string
    | {
        sub: string;
        tenantId: string;
        email: string;
        role: string;
        tokenId?: string;
      }
): Promise<string> {
  if (typeof payloadOrSub === 'string') {
    return generateRefreshToken({
      sub: payloadOrSub,
      tenantId: 'legacy-tenant',
      email: 'legacy@example.com',
      role: 'attorney',
      tokenId: crypto.randomUUID(),
    });
  }

  return generateRefreshToken({
    ...payloadOrSub,
    tokenId: payloadOrSub.tokenId ?? crypto.randomUUID(),
  });
}

// ============================================================
// TOKEN VERIFICATION
// ============================================================

/**
 * Verify and decode an access token
 */
export async function verifyAccessToken(token: string): Promise<AccessTokenPayload> {
  await loadKeys();
  if (!publicKey) throw new Error('Public key not loaded');

  const { payload } = await jwtVerify(token, publicKey, {
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });

  const typedPayload = payload as unknown as AccessTokenPayload;
  if (typedPayload.type !== 'access') {
    throw new Error('Invalid token type');
  }

  return typedPayload;
}

/**
 * Verify and decode a refresh token
 */
export async function verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
  await loadKeys();
  if (!publicKey) throw new Error('Public key not loaded');

  const { payload } = await jwtVerify(token, publicKey, {
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
  });

  const typedPayload = payload as unknown as RefreshTokenPayload;
  if (typedPayload.type !== 'refresh') {
    throw new Error('Invalid token type');
  }

  return typedPayload;
}

// ============================================================
// INITIALIZATION
// ============================================================

export async function initializeAuth(): Promise<void> {
  await loadKeys();
}
