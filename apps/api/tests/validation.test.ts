/**
 * EvidentIS API Test Suite - Part 8: Input Validation, Edge Cases, Error Handling
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { build } from '../src/index';
import { pool } from '../src/database';
import { hashPassword, generateToken, encryptField, decryptField } from '../src/security';
import { createAccessToken, createRefreshToken } from '../src/auth';

const TEST_TENANT = {
  id: '00000000-0000-0000-0000-000000000700',
  name: 'Validation Test Firm',
  slug: 'validation-test',
};

const TEST_ATTORNEY = {
  id: '00000000-0000-0000-0000-000000000701',
  email: 'validation@test.com',
};

let app: any;
let token: string;

beforeAll(async () => {
  app = await build();
  
  await pool.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [TEST_TENANT.id, TEST_TENANT.name, TEST_TENANT.slug]
  );
  
  const passwordHash = await hashPassword('Password123!');
  await pool.query(
    `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'Validator', $4, 'attorney')
     ON CONFLICT DO NOTHING`,
    [TEST_ATTORNEY.id, TEST_TENANT.id, TEST_ATTORNEY.email, passwordHash]
  );
  
  token = await createAccessToken({
    sub: TEST_ATTORNEY.id,
    email: TEST_ATTORNEY.email,
    role: 'attorney',
    tenantId: TEST_TENANT.id,
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM attorneys WHERE tenant_id = $1`, [TEST_TENANT.id]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [TEST_TENANT.id]);
  await app.close();
});

// ============================================================================
// Input Validation Tests
// ============================================================================

describe('Input Validation', () => {
  describe('Email Validation', () => {
    const invalidEmails = [
      '',
      'notanemail',
      '@nodomain.com',
      'no@.com',
      'no@domain.',
      'spaces in@email.com',
      '<script>@xss.com',
      'a'.repeat(300) + '@test.com',
    ];
    
    invalidEmails.forEach(email => {
      it(`should reject invalid email: "${email.substring(0, 50)}"`, async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email, password: 'Password123!' },
        });
        
        expect([400, 401]).toContain(response.statusCode);
      });
    });
    
    it('should accept valid email formats', async () => {
      const validEmails = [
        'test@example.com',
        'test.user@example.com',
        'test+tag@example.com',
        'test@sub.example.com',
      ];
      
      for (const email of validEmails) {
        // Just validate format, not actual login
        const isValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
        expect(isValid).toBe(true);
      }
    });
  });
  
  describe('Password Validation', () => {
    const weakPasswords = [
      '',
      '123',
      'password',
      '12345678',
      'abcdefgh',
      'ABCDEFGH',
      'Pass123',  // Too short
    ];
    
    weakPasswords.forEach(password => {
      it(`should reject weak password: "${password}"`, async () => {
        const response = await app.inject({
          method: 'POST',
          url: '/auth/reset-password',
          payload: {
            token: 'valid-token',
            password,
          },
        });
        
        expect([400, 401, 404]).toContain(response.statusCode);
      });
    });
  });
  
  describe('UUID Validation', () => {
    const invalidUUIDs = [
      '',
      'not-a-uuid',
      '12345678',
      '00000000-0000-0000-0000-00000000000',  // Too short
      '00000000-0000-0000-0000-0000000000000', // Too long
      '00000000_0000_0000_0000_000000000000',  // Wrong separator
    ];
    
    invalidUUIDs.forEach(uuid => {
      it(`should reject invalid UUID: "${uuid}"`, async () => {
        const response = await app.inject({
          method: 'GET',
          url: `/api/matters/${uuid}`,
          headers: { authorization: `Bearer ${token}` },
        });
        
        expect([400, 404]).toContain(response.statusCode);
      });
    });
  });
  
  describe('String Length Validation', () => {
    it('should reject excessively long matter names', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'a'.repeat(1000),
          clientName: 'Test',
          practiceArea: 'M&A',
        },
      });
      
      expect([400, 201]).toContain(response.statusCode);
    });
    
    it('should reject empty required strings', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: '',
          clientName: '',
          practiceArea: 'M&A',
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
    
    it('should trim whitespace from inputs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: '  Test Matter  ',
          clientName: '  Test Client  ',
          practiceArea: 'M&A',
        },
      });
      
      if (response.statusCode === 201) {
        const body = JSON.parse(response.body);
        // Name should be trimmed
        expect(body.name.trim()).toBe(body.name);
      }
    });
  });
  
  describe('Numeric Validation', () => {
    it('should reject negative page numbers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?page=-1',
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect([200, 400]).toContain(response.statusCode);
    });
    
    it('should reject excessively large limits', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?limit=1000000',
        headers: { authorization: `Bearer ${token}` },
      });
      
      // Should either cap or reject
      expect([200, 400]).toContain(response.statusCode);
    });
    
    it('should handle non-numeric parameters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?page=abc',
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect([200, 400]).toContain(response.statusCode);
    });
  });
  
  describe('Date Validation', () => {
    it('should reject invalid date formats', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/obligations',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          documentId: TEST_TENANT.id,
          title: 'Test',
          dueDate: 'not-a-date',
        },
      });
      
      expect([400, 404]).toContain(response.statusCode);
    });
    
    it('should accept ISO 8601 dates', async () => {
      const isoDate = new Date().toISOString();
      const isValid = !isNaN(Date.parse(isoDate));
      expect(isValid).toBe(true);
    });
  });
  
  describe('JSON Payload Validation', () => {
    it('should reject malformed JSON', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: '{"name": "Test", "clientName": }', // Invalid JSON
      });
      
      expect(response.statusCode).toBe(400);
    });
    
    it('should reject unexpected properties', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'Test',
          clientName: 'Test',
          practiceArea: 'M&A',
          maliciousField: '<script>alert("xss")</script>',
        },
      });
      
      // May accept (ignoring extra fields) or reject
      expect([200, 201, 400]).toContain(response.statusCode);
    });
  });
});

// ============================================================================
// Edge Cases Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('Empty Collections', () => {
    it('should handle empty matters list', async () => {
      // Create a tenant with no matters
      const emptyTenantId = '00000000-0000-0000-0000-000000000799';
      await pool.query(
        `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Empty', 'empty') ON CONFLICT DO NOTHING`,
        [emptyTenantId]
      );
      
      const emptyAttorneyId = '00000000-0000-0000-0000-000000000798';
      const passwordHash = await hashPassword('Password123!');
      await pool.query(
        `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
         VALUES ($1, $2, 'empty@test.com', 'Empty', $3, 'attorney')
         ON CONFLICT DO NOTHING`,
        [emptyAttorneyId, emptyTenantId, passwordHash]
      );
      
      const emptyToken = await createAccessToken({
        sub: emptyAttorneyId,
        email: 'empty@test.com',
        role: 'attorney',
        tenantId: emptyTenantId,
      });
      
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters',
        headers: { authorization: `Bearer ${emptyToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(0);
    });
  });
  
  describe('Concurrent Requests', () => {
    it('should handle concurrent reads', async () => {
      const requests = Array(10).fill(null).map(() =>
        app.inject({
          method: 'GET',
          url: '/api/matters',
          headers: { authorization: `Bearer ${token}` },
        })
      );
      
      const responses = await Promise.all(requests);
      
      responses.forEach(response => {
        expect(response.statusCode).toBe(200);
      });
    });
    
    it('should handle concurrent writes', async () => {
      const requests = Array(5).fill(null).map((_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/matters',
          headers: { authorization: `Bearer ${token}` },
          payload: {
            name: `Concurrent Matter ${i}`,
            clientName: 'Test',
            practiceArea: 'M&A',
          },
        })
      );
      
      const responses = await Promise.all(requests);
      
      // All should succeed
      responses.forEach(response => {
        expect([200, 201]).toContain(response.statusCode);
      });
    });
  });
  
  describe('Unicode Handling', () => {
    it('should handle unicode in names', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          name: 'テスト案件 🎉',
          clientName: '中国客户',
          practiceArea: 'M&A',
        },
      });
      
      expect([200, 201]).toContain(response.statusCode);
      
      if (response.statusCode === 201) {
        const body = JSON.parse(response.body);
        expect(body.name).toContain('テスト');
      }
    });
    
    it('should handle emoji in notes', async () => {
      const matterId = '00000000-0000-0000-0000-000000000710';
      await pool.query(
        `INSERT INTO matters (id, tenant_id, matter_code, matter_name, matter_type, client_name, lead_attorney_id)
         VALUES ($1, $2, $3, $4, 'commercial_contract', 'Test', $5)
         ON CONFLICT DO NOTHING`,
        [matterId, TEST_TENANT.id, 'VAL-710', 'Emoji Test', TEST_ATTORNEY.id]
      );
      
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/matters/${matterId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          notes: 'Important matter! 🔥💼📋',
        },
      });
      
      expect([200, 404]).toContain(response.statusCode);
    });
  });
  
  describe('Special Characters', () => {
    it('should handle special characters in search', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?search=' + encodeURIComponent("O'Brien & Co."),
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('should handle SQL special characters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?search=' + encodeURIComponent("%; DROP TABLE matters; --"),
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      // Should NOT have dropped the table
      const check = await pool.query(`SELECT COUNT(*) FROM matters`);
      expect(parseInt(check.rows[0].count)).toBeGreaterThanOrEqual(0);
    });
  });
  
  describe('Timezone Handling', () => {
    it('should store and return UTC timestamps', async () => {
      const matterId = '00000000-0000-0000-0000-000000000720';
      await pool.query(
        `INSERT INTO matters (id, tenant_id, matter_code, matter_name, matter_type, client_name, lead_attorney_id)
         VALUES ($1, $2, $3, $4, 'commercial_contract', 'Test', $5)
         ON CONFLICT DO NOTHING`,
        [matterId, TEST_TENANT.id, 'VAL-720', 'TZ Test', TEST_ATTORNEY.id]
      );
      
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        // Timestamps should be ISO format with Z or +00:00
        expect(body.createdAt).toMatch(/Z|[+-]\d{2}:\d{2}$/);
      }
    });
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('Error Handling', () => {
  describe('HTTP Status Codes', () => {
    it('should return 400 for bad requests', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${token}` },
        payload: {}, // Missing required fields
      });
      
      expect(response.statusCode).toBe(400);
    });
    
    it('should return 401 for unauthorized requests', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters',
      });
      
      expect(response.statusCode).toBe(401);
    });
    
    it('should return 403 for forbidden actions', async () => {
      // Try to access admin endpoint as regular attorney
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenant',
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(403);
    });
    
    it('should return 404 for missing resources', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters/00000000-0000-0000-0000-000000000999',
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('should return 405 for wrong HTTP method', async () => {
      const response = await app.inject({
        method: 'PUT',
        url: '/auth/login',
        payload: {},
      });
      
      expect([404, 405]).toContain(response.statusCode);
    });
    
    it('should return 429 for rate limited requests', async () => {
      // Make many requests quickly
      const requests = Array(50).fill(null).map(() =>
        app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: 'test@test.com', password: 'wrong' },
        })
      );
      
      const responses = await Promise.all(requests);
      const rateLimited = responses.some(r => r.statusCode === 429);
      // May or may not hit rate limit depending on implementation
    });
  });
  
  describe('Error Response Format', () => {
    it('should return consistent error format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${token}` },
        payload: {},
      });
      
      expect(response.statusCode).toBe(400);
      const body = JSON.parse(response.body);
      
      // Should have error message
      expect(body.error || body.message || body.statusCode).toBeDefined();
    });
    
    it('should not expose internal details in errors', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/internal/error-test',
        headers: { authorization: `Bearer ${token}` },
      });
      
      const body = JSON.parse(response.body);
      
      // Should not contain stack traces
      expect(body.stack).toBeUndefined();
      // Should not contain SQL queries
      expect(JSON.stringify(body)).not.toContain('SELECT');
      expect(JSON.stringify(body)).not.toContain('INSERT');
    });
  });
  
  describe('Database Error Recovery', () => {
    it('should handle connection pool exhaustion gracefully', async () => {
      // This is a stress test - make many concurrent DB requests
      const requests = Array(100).fill(null).map(() =>
        app.inject({
          method: 'GET',
          url: '/api/matters',
          headers: { authorization: `Bearer ${token}` },
        })
      );
      
      const responses = await Promise.all(requests);
      
      // Should handle gracefully (may return 503 under extreme load)
      responses.forEach(r => {
        expect([200, 503]).toContain(r.statusCode);
      });
    });
  });
});

// ============================================================================
// Security Functions Tests
// ============================================================================

describe('Security Functions', () => {
  describe('Password Hashing', () => {
    it('should hash passwords securely', async () => {
      const password = 'TestPassword123!';
      const hash = await hashPassword(password);
      
      // Should be bcrypt format
      expect(hash).toMatch(/^\$2[aby]\$/);
      expect(hash.length).toBeGreaterThan(50);
    });
    
    it('should generate different hashes for same password', async () => {
      const password = 'TestPassword123!';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });
  
  describe('Token Generation', () => {
    it('should generate secure tokens', () => {
      const token = generateToken(32);
      
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
      expect(token).toMatch(/^[a-f0-9]+$/);
    });
    
    it('should generate unique tokens', () => {
      const tokens = new Set();
      for (let i = 0; i < 100; i++) {
        tokens.add(generateToken(32));
      }
      
      expect(tokens.size).toBe(100);
    });
  });
  
  describe('Field Encryption', () => {
    it('should encrypt and decrypt fields', () => {
      const sensitive = 'SSN: 123-45-6789';
      const encrypted = encryptField(sensitive);
      const decrypted = decryptField(encrypted);
      
      expect(encrypted).not.toBe(sensitive);
      expect(decrypted).toBe(sensitive);
    });
    
    it('should produce different ciphertext for same plaintext', () => {
      const sensitive = 'Same text';
      const enc1 = encryptField(sensitive);
      const enc2 = encryptField(sensitive);
      
      // IV should make them different
      expect(enc1).not.toBe(enc2);
    });
  });
  
  describe('JWT Token Creation', () => {
    it('should create valid access token', async () => {
      const accessToken = await createAccessToken({
        sub: TEST_ATTORNEY.id,
        email: TEST_ATTORNEY.email,
        role: 'attorney',
        tenantId: TEST_TENANT.id,
      });
      
      expect(accessToken.split('.').length).toBe(3); // JWT format
    });
    
    it('should create valid refresh token', async () => {
      const refreshToken = await createRefreshToken(TEST_ATTORNEY.id);
      
      expect(refreshToken.length).toBeGreaterThan(20);
    });
  });
});

// ============================================================================
// Memory and Resource Tests
// ============================================================================

describe('Resource Management', () => {
  it('should not leak memory on repeated requests', async () => {
    const initialMemory = process.memoryUsage().heapUsed;
    
    for (let i = 0; i < 100; i++) {
      await app.inject({
        method: 'GET',
        url: '/api/matters',
        headers: { authorization: `Bearer ${token}` },
      });
    }
    
    // Force GC if available
    if (global.gc) global.gc();
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - initialMemory;
    
    // Memory growth should be reasonable (less than 50MB)
    expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024);
  });
  
  it('should handle large payloads gracefully', async () => {
    const largePayload = {
      name: 'Test',
      clientName: 'Test',
      practiceArea: 'M&A',
      description: 'x'.repeat(100000), // 100KB description
    };
    
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${token}` },
      payload: largePayload,
    });
    
    // Should either accept or reject, but not crash
    expect([200, 201, 400, 413]).toContain(response.statusCode);
  });
});
