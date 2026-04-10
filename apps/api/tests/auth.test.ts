/**
 * EvidentIS API Test Suite - Part 1: Authentication Tests
 * Comprehensive testing for all auth endpoints and security
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { build } from '../src/index';
import { pool } from '../src/database';
import { hashPassword, verifyPassword, generateSecureToken } from '../src/security';
import { createAccessToken, createRefreshToken, verifyAccessToken } from '../src/auth';
import crypto from 'crypto';

// Test fixtures
const TEST_TENANT = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Test Law Firm',
  slug: 'test-law-firm',
  plan: 'starter',
};

const TEST_ATTORNEY = {
  id: '00000000-0000-0000-0000-000000000002',
  email: 'test@testlawfirm.com',
  displayName: 'Test Attorney',
  password: 'SecurePassword123!',
  role: 'admin',
};

let app: any;

// ============================================================================
// Setup and Teardown
// ============================================================================

beforeAll(async () => {
  // Build the app
  app = await build();
  
  // Setup test data
  await pool.query(
    `INSERT INTO tenants (id, name, slug, plan) VALUES ($1, $2, $3, $4)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_TENANT.id, TEST_TENANT.name, TEST_TENANT.slug, TEST_TENANT.plan]
  );
  
  const passwordHash = await hashPassword(TEST_ATTORNEY.password);
  await pool.query(
    `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (id) DO UPDATE SET password_hash = $5`,
    [TEST_ATTORNEY.id, TEST_TENANT.id, TEST_ATTORNEY.email, TEST_ATTORNEY.displayName, passwordHash, TEST_ATTORNEY.role]
  );
});

afterAll(async () => {
  // Cleanup
  await pool.query(`DELETE FROM attorneys WHERE id = $1`, [TEST_ATTORNEY.id]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [TEST_TENANT.id]);
  await app.close();
});

// ============================================================================
// Password Security Tests
// ============================================================================

describe('Password Hashing', () => {
  it('should hash passwords with bcrypt', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    
    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);
    expect(hash.startsWith('$2b$')).toBe(true);
  });
  
  it('should verify correct passwords', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    
    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);
  });
  
  it('should reject incorrect passwords', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    
    const isValid = await verifyPassword('WrongPassword456!', hash);
    expect(isValid).toBe(false);
  });
  
  it('should use cost factor of 12', async () => {
    const password = 'TestPassword123!';
    const hash = await hashPassword(password);
    
    // bcrypt hash format: $2b$12$...
    expect(hash.split('$')[2]).toBe('12');
  });
  
  it('should generate unique hashes for same password', async () => {
    const password = 'TestPassword123!';
    const hash1 = await hashPassword(password);
    const hash2 = await hashPassword(password);
    
    expect(hash1).not.toBe(hash2);
  });
});

// ============================================================================
// Token Generation Tests
// ============================================================================

describe('Token Generation', () => {
  it('should generate secure tokens of specified length', () => {
    const token = generateSecureToken(32);
    expect(token).toBeDefined();
    expect(token.length).toBe(64); // 32 bytes = 64 hex chars
  });
  
  it('should generate unique tokens', () => {
    const tokens = new Set();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateSecureToken(32));
    }
    expect(tokens.size).toBe(100);
  });
  
  it('should only contain hex characters', () => {
    const token = generateSecureToken(32);
    expect(/^[a-f0-9]+$/.test(token)).toBe(true);
  });
});

// ============================================================================
// JWT Tests
// ============================================================================

describe('JWT Access Tokens', () => {
  it('should create valid access tokens', async () => {
    const token = await createAccessToken({
      sub: TEST_ATTORNEY.id,
      email: TEST_ATTORNEY.email,
      role: TEST_ATTORNEY.role,
      tenantId: TEST_TENANT.id,
    });
    
    expect(token).toBeDefined();
    expect(token.split('.').length).toBe(3); // JWT format
  });
  
  it('should verify valid tokens', async () => {
    const token = await createAccessToken({
      sub: TEST_ATTORNEY.id,
      email: TEST_ATTORNEY.email,
      role: TEST_ATTORNEY.role,
      tenantId: TEST_TENANT.id,
    });
    
    const decoded = await verifyAccessToken(token);
    expect(decoded.sub).toBe(TEST_ATTORNEY.id);
    expect(decoded.email).toBe(TEST_ATTORNEY.email);
    expect(decoded.role).toBe(TEST_ATTORNEY.role);
    expect(decoded.tenantId).toBe(TEST_TENANT.id);
  });
  
  it('should reject tampered tokens', async () => {
    const token = await createAccessToken({
      sub: TEST_ATTORNEY.id,
      email: TEST_ATTORNEY.email,
      role: TEST_ATTORNEY.role,
      tenantId: TEST_TENANT.id,
    });
    
    // Tamper with the token
    const parts = token.split('.');
    parts[1] = Buffer.from(JSON.stringify({ sub: 'hacker' })).toString('base64');
    const tamperedToken = parts.join('.');
    
    await expect(verifyAccessToken(tamperedToken)).rejects.toThrow();
  });
  
  it('should reject expired tokens', async () => {
    // Create a token that expires immediately
    vi.useFakeTimers();
    const token = await createAccessToken({
      sub: TEST_ATTORNEY.id,
      email: TEST_ATTORNEY.email,
      role: TEST_ATTORNEY.role,
      tenantId: TEST_TENANT.id,
    });
    
    // Advance time by 16 minutes (tokens expire in 15)
    vi.advanceTimersByTime(16 * 60 * 1000);
    
    await expect(verifyAccessToken(token)).rejects.toThrow();
    vi.useRealTimers();
  });
});

// ============================================================================
// Login Endpoint Tests
// ============================================================================

describe('POST /auth/login', () => {
  it('should login with valid credentials', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.accessToken).toBeDefined();
    expect(body.attorney.email).toBe(TEST_ATTORNEY.email);
  });
  
  it('should reject invalid email', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'nonexistent@test.com',
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    expect(response.statusCode).toBe(401);
  });
  
  it('should reject invalid password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: 'WrongPassword123!',
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    expect(response.statusCode).toBe(401);
  });
  
  it('should reject invalid tenant', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: TEST_ATTORNEY.password,
        tenantSlug: 'nonexistent-tenant',
      },
    });
    
    expect(response.statusCode).toBe(401);
  });
  
  it('should set refresh token cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeDefined();
    expect(response.headers['set-cookie']).toMatch(/refreshToken=/);
    expect(response.headers['set-cookie']).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie']).toMatch(/SameSite=Strict/);
  });
  
  it('should validate email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: 'invalid-email',
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    expect(response.statusCode).toBe(400);
  });
  
  it('should lock account after 5 failed attempts', async () => {
    // Create a test user for this specific test
    const lockTestEmail = 'locktest@test.com';
    const passwordHash = await hashPassword('TestPassword123!');
    
    await pool.query(
      `INSERT INTO attorneys (tenant_id, email, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (tenant_id, email) DO UPDATE SET failed_login_attempts = 0, locked_until = NULL`,
      [TEST_TENANT.id, lockTestEmail, 'Lock Test', passwordHash, 'attorney']
    );
    
    // Attempt 5 failed logins
    for (let i = 0; i < 5; i++) {
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: lockTestEmail,
          password: 'WrongPassword',
          tenantSlug: TEST_TENANT.slug,
        },
      });
    }
    
    // 6th attempt should show locked
    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: lockTestEmail,
        password: 'WrongPassword',
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    expect(response.statusCode).toBe(423); // Locked
    
    // Cleanup
    await pool.query(
      `DELETE FROM attorneys WHERE email = $1`,
      [lockTestEmail]
    );
  });
});

// ============================================================================
// Token Refresh Tests
// ============================================================================

describe('POST /auth/refresh', () => {
  it('should refresh tokens with valid refresh token', async () => {
    // First login
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    const cookies = loginResponse.headers['set-cookie'];
    
    // Refresh
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: cookies,
      },
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.accessToken).toBeDefined();
  });
  
  it('should reject missing refresh token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
    });
    
    expect(response.statusCode).toBe(401);
  });
  
  it('should reject invalid refresh token', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: {
        cookie: 'refreshToken=invalid-token',
      },
    });
    
    expect(response.statusCode).toBe(401);
  });
  
  it('should rotate refresh token on use', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    const cookies1 = loginResponse.headers['set-cookie'];
    
    // First refresh
    const refresh1 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: cookies1 },
    });
    
    const cookies2 = refresh1.headers['set-cookie'];
    
    // Tokens should be different
    expect(cookies1).not.toBe(cookies2);
    
    // Using old token should fail (token reuse detection)
    const refresh2 = await app.inject({
      method: 'POST',
      url: '/auth/refresh',
      headers: { cookie: cookies1 },
    });
    
    expect(refresh2.statusCode).toBe(401);
  });
});

// ============================================================================
// Logout Tests
// ============================================================================

describe('POST /auth/logout', () => {
  it('should logout and clear cookie', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    const cookies = loginResponse.headers['set-cookie'];
    const body = JSON.parse(loginResponse.body);
    
    const response = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: {
        authorization: `Bearer ${body.accessToken}`,
        cookie: cookies,
      },
    });
    
    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toMatch(/refreshToken=;/);
  });
});

// ============================================================================
// Current User Tests
// ============================================================================

describe('GET /auth/me', () => {
  it('should return current user with valid token', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    const { accessToken } = JSON.parse(loginResponse.body);
    
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.email).toBe(TEST_ATTORNEY.email);
    expect(body.displayName).toBe(TEST_ATTORNEY.displayName);
  });
  
  it('should reject missing token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
    });
    
    expect(response.statusCode).toBe(401);
  });
  
  it('should reject invalid token', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: {
        authorization: 'Bearer invalid-token',
      },
    });
    
    expect(response.statusCode).toBe(401);
  });
});

// ============================================================================
// Password Reset Tests
// ============================================================================

describe('Password Reset Flow', () => {
  it('should send reset email for valid user', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {
        email: TEST_ATTORNEY.email,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    // Should always return 200 to prevent email enumeration
    expect(response.statusCode).toBe(200);
  });
  
  it('should return 200 for nonexistent email (prevent enumeration)', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/forgot-password',
      payload: {
        email: 'nonexistent@test.com',
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    // Should return same response to prevent email enumeration
    expect(response.statusCode).toBe(200);
  });
  
  it('should reset password with valid token', async () => {
    // Create a password reset token
    const token = generateSecureToken(32);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await pool.query(
      `INSERT INTO password_reset_tokens (attorney_id, token_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '1 hour')`,
      [TEST_ATTORNEY.id, tokenHash]
    );
    
    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token,
        newPassword: 'NewSecurePassword456!',
      },
    });
    
    expect(response.statusCode).toBe(200);
    
    // Should be able to login with new password
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: 'NewSecurePassword456!',
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    expect(loginResponse.statusCode).toBe(200);
    
    // Reset password back
    const newHash = await hashPassword(TEST_ATTORNEY.password);
    await pool.query(
      `UPDATE attorneys SET password_hash = $2 WHERE id = $1`,
      [TEST_ATTORNEY.id, newHash]
    );
  });
  
  it('should reject expired reset token', async () => {
    const token = generateSecureToken(32);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await pool.query(
      `INSERT INTO password_reset_tokens (attorney_id, token_hash, expires_at)
       VALUES ($1, $2, now() - INTERVAL '1 hour')`,
      [TEST_ATTORNEY.id, tokenHash]
    );
    
    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token,
        newPassword: 'NewSecurePassword456!',
      },
    });
    
    expect(response.statusCode).toBe(400);
  });
  
  it('should reject weak passwords', async () => {
    const token = generateSecureToken(32);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await pool.query(
      `INSERT INTO password_reset_tokens (attorney_id, token_hash, expires_at)
       VALUES ($1, $2, now() + INTERVAL '1 hour')`,
      [TEST_ATTORNEY.id, tokenHash]
    );
    
    const response = await app.inject({
      method: 'POST',
      url: '/auth/reset-password',
      payload: {
        token,
        newPassword: 'weak', // Too short, no complexity
      },
    });
    
    expect(response.statusCode).toBe(400);
  });
});

// ============================================================================
// MFA Tests
// ============================================================================

describe('MFA Setup Flow', () => {
  it('should initiate MFA setup', async () => {
    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: TEST_ATTORNEY.email,
        password: TEST_ATTORNEY.password,
        tenantSlug: TEST_TENANT.slug,
      },
    });
    
    const { accessToken } = JSON.parse(loginResponse.body);
    
    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.qrCodeUrl).toBeDefined();
    expect(body.secret).toBeDefined();
  });
  
  it('should require authentication for MFA setup', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/auth/mfa/setup',
    });
    
    expect(response.statusCode).toBe(401);
  });
});

// ============================================================================
// Rate Limiting Tests
// ============================================================================

describe('Rate Limiting', () => {
  it('should rate limit login attempts', async () => {
    const promises = [];
    
    // Make 15 rapid login attempts (limit is 10 per 15 min)
    for (let i = 0; i < 15; i++) {
      promises.push(
        app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: {
            email: `test${i}@test.com`,
            password: 'password',
            tenantSlug: TEST_TENANT.slug,
          },
        })
      );
    }
    
    const responses = await Promise.all(promises);
    
    // Some should be rate limited
    const rateLimited = responses.filter(r => r.statusCode === 429);
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// CORS Tests
// ============================================================================

describe('CORS', () => {
  it('should include CORS headers', async () => {
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/auth/login',
      headers: {
        origin: 'http://localhost:3000',
      },
    });
    
    expect(response.headers['access-control-allow-origin']).toBeDefined();
    expect(response.headers['access-control-allow-methods']).toBeDefined();
  });
});

// ============================================================================
// Security Headers Tests
// ============================================================================

describe('Security Headers', () => {
  it('should include security headers', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/health/live',
    });
    
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');
  });
});
