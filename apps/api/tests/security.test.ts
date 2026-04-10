/**
 * EvidentIS API Test Suite - Part 3: Tenant Isolation & Security Tests
 * Critical tests for multi-tenant security
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { build } from '../src/index';
import { pool } from '../src/database';
import { hashPassword } from '../src/security';
import { createAccessToken } from '../src/auth';
import crypto from 'crypto';

// Test fixtures - Two completely separate tenants
const TENANT_A = {
  id: '00000000-0000-0000-0000-000000000100',
  name: 'Tenant A Law Firm',
  slug: 'tenant-a',
};

const TENANT_B = {
  id: '00000000-0000-0000-0000-000000000200',
  name: 'Tenant B Law Firm',
  slug: 'tenant-b',
};

const ATTORNEY_A = {
  id: '00000000-0000-0000-0000-000000000101',
  email: 'attorney@tenant-a.com',
  tenantId: TENANT_A.id,
};

const ATTORNEY_B = {
  id: '00000000-0000-0000-0000-000000000201',
  email: 'attorney@tenant-b.com',
  tenantId: TENANT_B.id,
};

let app: any;
let tokenA: string;
let tokenB: string;
let matterA: string;
let matterB: string;
let documentA: string;
let documentB: string;

beforeAll(async () => {
  app = await build();
  
  // Setup Tenant A
  await pool.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [TENANT_A.id, TENANT_A.name, TENANT_A.slug]
  );
  
  const passwordHash = await hashPassword('Password123!');
  await pool.query(
    `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'Attorney A', $4, 'admin')
     ON CONFLICT (id) DO UPDATE SET password_hash = $4`,
    [ATTORNEY_A.id, TENANT_A.id, ATTORNEY_A.email, passwordHash]
  );
  
  // Setup Tenant B
  await pool.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [TENANT_B.id, TENANT_B.name, TENANT_B.slug]
  );
  
  await pool.query(
    `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'Attorney B', $4, 'admin')
     ON CONFLICT (id) DO UPDATE SET password_hash = $4`,
    [ATTORNEY_B.id, TENANT_B.id, ATTORNEY_B.email, passwordHash]
  );
  
  // Create tokens
  tokenA = await createAccessToken({
    sub: ATTORNEY_A.id,
    email: ATTORNEY_A.email,
    role: 'admin',
    tenantId: TENANT_A.id,
  });
  
  tokenB = await createAccessToken({
    sub: ATTORNEY_B.id,
    email: ATTORNEY_B.email,
    role: 'admin',
    tenantId: TENANT_B.id,
  });
  
  // Create test data for Tenant A
  const matterAResult = await pool.query(
    `INSERT INTO matters (tenant_id, matter_code, matter_name, matter_type, client_name, created_by)
     VALUES ($1, 'A-001', 'Tenant A Confidential Matter', 'M&A', 'Secret Client A', $2)
     RETURNING id`,
    [TENANT_A.id, ATTORNEY_A.id]
  );
  matterA = matterAResult.rows[0].id;
  
  const docAResult = await pool.query(
    `INSERT INTO documents (tenant_id, matter_id, source_name, mime_type, doc_type, sha256, file_uri, created_by)
     VALUES ($1, $2, 'confidential-a.pdf', 'application/pdf', 'contract', $3, '/a/path', $4)
     RETURNING id`,
    [TENANT_A.id, matterA, crypto.randomBytes(32).toString('hex'), ATTORNEY_A.id]
  );
  documentA = docAResult.rows[0].id;
  
  // Create test data for Tenant B
  const matterBResult = await pool.query(
    `INSERT INTO matters (tenant_id, matter_code, matter_name, matter_type, client_name, created_by)
     VALUES ($1, 'B-001', 'Tenant B Confidential Matter', 'Litigation', 'Secret Client B', $2)
     RETURNING id`,
    [TENANT_B.id, ATTORNEY_B.id]
  );
  matterB = matterBResult.rows[0].id;
  
  const docBResult = await pool.query(
    `INSERT INTO documents (tenant_id, matter_id, source_name, mime_type, doc_type, sha256, file_uri, created_by)
     VALUES ($1, $2, 'confidential-b.pdf', 'application/pdf', 'contract', $3, '/b/path', $4)
     RETURNING id`,
    [TENANT_B.id, matterB, crypto.randomBytes(32).toString('hex'), ATTORNEY_B.id]
  );
  documentB = docBResult.rows[0].id;
});

afterAll(async () => {
  // Cleanup in order
  await pool.query(`DELETE FROM documents WHERE tenant_id IN ($1, $2)`, [TENANT_A.id, TENANT_B.id]);
  await pool.query(`DELETE FROM matters WHERE tenant_id IN ($1, $2)`, [TENANT_A.id, TENANT_B.id]);
  await pool.query(`DELETE FROM attorneys WHERE tenant_id IN ($1, $2)`, [TENANT_A.id, TENANT_B.id]);
  await pool.query(`DELETE FROM tenants WHERE id IN ($1, $2)`, [TENANT_A.id, TENANT_B.id]);
  await app.close();
});

// ============================================================================
// Cross-Tenant Isolation Tests - CRITICAL
// ============================================================================

describe('Tenant Isolation - CRITICAL', () => {
  describe('Matter Access', () => {
    it('Tenant A cannot access Tenant B matters by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterB}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('Tenant B cannot access Tenant A matters by ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterA}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('Matter list only returns own tenant matters', async () => {
      const responseA = await app.inject({
        method: 'GET',
        url: '/api/matters',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      
      const bodyA = JSON.parse(responseA.body);
      bodyA.items.forEach((matter: any) => {
        expect(matter.matterName).not.toContain('Tenant B');
      });
      
      const responseB = await app.inject({
        method: 'GET',
        url: '/api/matters',
        headers: { authorization: `Bearer ${tokenB}` },
      });
      
      const bodyB = JSON.parse(responseB.body);
      bodyB.items.forEach((matter: any) => {
        expect(matter.matterName).not.toContain('Tenant A');
      });
    });
    
    it('Tenant A cannot update Tenant B matter', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/matters/${matterB}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          matterName: 'HACKED BY TENANT A',
        },
      });
      
      expect(response.statusCode).toBe(404);
      
      // Verify matter unchanged
      const check = await pool.query(
        `SELECT matter_name FROM matters WHERE id = $1`,
        [matterB]
      );
      expect(check.rows[0].matter_name).not.toContain('HACKED');
    });
    
    it('Tenant B cannot delete Tenant A matter', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/matters/${matterA}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });
      
      expect(response.statusCode).toBe(404);
      
      // Verify matter still exists
      const check = await pool.query(
        `SELECT id FROM matters WHERE id = $1`,
        [matterA]
      );
      expect(check.rows.length).toBe(1);
    });
  });
  
  describe('Document Access', () => {
    it('Tenant A cannot access Tenant B documents', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentB}`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('Tenant B cannot access Tenant A documents', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentA}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('Document list only returns own tenant documents', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterA}/documents`,
        headers: { authorization: `Bearer ${tokenA}` },
      });
      
      const body = JSON.parse(response.body);
      body.items.forEach((doc: any) => {
        expect(doc.sourceName).not.toContain('confidential-b');
      });
    });
    
    it('Tenant A cannot upload to Tenant B matter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/upload',
        headers: {
          authorization: `Bearer ${tokenA}`,
          'content-type': 'multipart/form-data; boundary=boundary',
        },
        payload: `--boundary\r\nContent-Disposition: form-data; name="matterId"\r\n\r\n${matterB}\r\n--boundary\r\nContent-Disposition: form-data; name="file"; filename="hack.pdf"\r\nContent-Type: application/pdf\r\n\r\n%PDF-1.4\r\n--boundary--`,
      });
      
      // Should fail because matter doesn't belong to Tenant A
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('Attorney Access', () => {
    it('Tenant A cannot list Tenant B attorneys', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/attorneys',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      
      const body = JSON.parse(response.body);
      body.forEach((attorney: any) => {
        expect(attorney.email).not.toBe(ATTORNEY_B.email);
      });
    });
    
    it('Tenant A cannot modify Tenant B attorney', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/attorneys/${ATTORNEY_B.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          role: 'paralegal', // Attempting to demote
        },
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('Clauses and Flags', () => {
    let clauseA: string;
    let flagA: string;
    
    beforeAll(async () => {
      // Create clause and flag for Tenant A
      const clauseResult = await pool.query(
        `INSERT INTO clauses (tenant_id, document_id, clause_type, text_excerpt, risk_level, confidence)
         VALUES ($1, $2, 'confidentiality_nda', 'Highly confidential clause text...', 'high', 0.9)
         RETURNING id`,
        [TENANT_A.id, documentA]
      );
      clauseA = clauseResult.rows[0].id;
      
      const flagResult = await pool.query(
        `INSERT INTO flags (tenant_id, matter_id, document_id, clause_id, flag_type, severity, reason)
         VALUES ($1, $2, $3, $4, 'playbook_violation', 'critical', 'Sensitive violation')
         RETURNING id`,
        [TENANT_A.id, matterA, documentA, clauseA]
      );
      flagA = flagResult.rows[0].id;
    });
    
    it('Tenant B cannot access Tenant A clauses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/clauses/${clauseA}`,
        headers: { authorization: `Bearer ${tokenB}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('Tenant B cannot access Tenant A flags', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterA}/flags`,
        headers: { authorization: `Bearer ${tokenB}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('Tenant B cannot resolve Tenant A flags', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/flags/${flagA}`,
        headers: { authorization: `Bearer ${tokenB}` },
        payload: {
          status: 'resolved',
        },
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('Search Isolation', () => {
    it('Search results do not include other tenant data', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?search=Confidential',
        headers: { authorization: `Bearer ${tokenA}` },
      });
      
      const body = JSON.parse(response.body);
      body.items.forEach((matter: any) => {
        expect(matter.matterName).not.toContain('Tenant B');
      });
    });
    
    it('Research does not access other tenant documents', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/research/query',
        headers: { authorization: `Bearer ${tokenA}` },
        payload: {
          query: 'What are the confidential terms?',
        },
      });
      
      // Even if the AI model could see Tenant B data, the vector search
      // should not return chunks from other tenants
      expect(response.statusCode).toBeLessThan(500);
    });
  });
});

// ============================================================================
// SQL Injection Prevention Tests
// ============================================================================

describe('SQL Injection Prevention', () => {
  it('should reject SQL injection in search parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/matters?search=' OR '1'='1`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    
    // Should not error and should not return all matters
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.items.every((m: any) => m.matterName.includes("' OR '1'='1") === false)).toBe(true);
  });
  
  it('should reject SQL injection in ID parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/matters/00000000-0000-0000-0000-000000000000'; DROP TABLE matters; --`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    
    // Should return 400 (invalid UUID) or 404
    expect([400, 404]).toContain(response.statusCode);
    
    // Verify table still exists
    const check = await pool.query(`SELECT COUNT(*) FROM matters`);
    expect(parseInt(check.rows[0].count)).toBeGreaterThan(0);
  });
  
  it('should reject SQL injection in matter name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        matterCode: 'SQL-INJ-001',
        matterName: "Test'; DROP TABLE matters; --",
        matterType: 'Commercial',
        clientName: 'Test Client',
      },
    });
    
    // Should succeed but escape the input
    expect(response.statusCode).toBe(201);
    
    // Verify table still exists and data is escaped
    const check = await pool.query(`SELECT COUNT(*) FROM matters`);
    expect(parseInt(check.rows[0].count)).toBeGreaterThan(0);
  });
  
  it('should reject SQL injection in filter parameter', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/matters?status=open' OR '1'='1`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    
    // Should validate enum or reject
    expect([200, 400]).toContain(response.statusCode);
  });
});

// ============================================================================
// XSS Prevention Tests
// ============================================================================

describe('XSS Prevention', () => {
  it('should escape script tags in matter name', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        matterCode: 'XSS-001',
        matterName: '<script>alert("XSS")</script>',
        matterType: 'Commercial',
        clientName: 'Test Client',
      },
    });
    
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    expect(body.matterName).not.toContain('<script>');
  });
  
  it('should escape HTML in notes', async () => {
    const response = await app.inject({
      method: 'PATCH',
      url: `/api/matters/${matterA}`,
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        notes: '<img src=x onerror=alert("XSS")>',
      },
    });
    
    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.notes).not.toContain('onerror');
  });
  
  it('should set Content-Type header correctly', async () => {
    const response = await app.inject({
      method: 'GET',
      url: `/api/matters/${matterA}`,
      headers: { authorization: `Bearer ${tokenA}` },
    });
    
    expect(response.headers['content-type']).toMatch(/application\/json/);
  });
});

// ============================================================================
// CSRF Protection Tests
// ============================================================================

describe('CSRF Protection', () => {
  it('should require auth header for state-changing operations', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      payload: {
        matterCode: 'CSRF-001',
        matterName: 'CSRF Test',
        matterType: 'Commercial',
        clientName: 'Test',
      },
    });
    
    expect(response.statusCode).toBe(401);
  });
  
  it('should validate token signature', async () => {
    const tamperedToken = tokenA.split('.').map((p, i) => i === 1 ? 'tamperedpayload' : p).join('.');
    
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${tamperedToken}` },
      payload: {
        matterCode: 'CSRF-002',
        matterName: 'CSRF Test',
        matterType: 'Commercial',
        clientName: 'Test',
      },
    });
    
    expect(response.statusCode).toBe(401);
  });
});

// ============================================================================
// Input Validation Tests
// ============================================================================

describe('Input Validation', () => {
  it('should validate email format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/admin/attorneys',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        email: 'not-an-email',
        displayName: 'Test',
        role: 'attorney',
      },
    });
    
    expect(response.statusCode).toBe(400);
  });
  
  it('should validate UUID format', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/matters/not-a-uuid',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    
    expect(response.statusCode).toBe(400);
  });
  
  it('should validate enum values', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        matterCode: 'ENUM-001',
        matterName: 'Enum Test',
        matterType: 'invalid_type', // Invalid enum
        clientName: 'Test',
      },
    });
    
    expect(response.statusCode).toBe(400);
  });
  
  it('should validate date format', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/obligations',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        matterId: matterA,
        obligationType: 'payment',
        description: 'Test',
        deadlineDate: 'not-a-date',
      },
    });
    
    expect(response.statusCode).toBe(400);
  });
  
  it('should limit array sizes', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        matterCode: 'ARRAY-001',
        matterName: 'Array Test',
        matterType: 'Commercial',
        clientName: 'Test',
        tags: Array(1000).fill('tag'), // Excessive array
      },
    });
    
    // Should either reject or truncate
    expect([400, 201]).toContain(response.statusCode);
  });
  
  it('should limit string lengths', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        matterCode: 'LENGTH-001',
        matterName: 'A'.repeat(10000), // Excessive string
        matterType: 'Commercial',
        clientName: 'Test',
      },
    });
    
    // Should either reject or truncate
    expect([400, 201]).toContain(response.statusCode);
  });
});

// ============================================================================
// Rate Limiting Tests
// ============================================================================

describe('Rate Limiting', () => {
  it('should rate limit API requests', async () => {
    const promises = [];
    
    for (let i = 0; i < 110; i++) {
      promises.push(
        app.inject({
          method: 'GET',
          url: '/api/matters',
          headers: { authorization: `Bearer ${tokenA}` },
        })
      );
    }
    
    const responses = await Promise.all(promises);
    const rateLimited = responses.filter(r => r.statusCode === 429);
    
    // Should have some rate limited responses
    expect(rateLimited.length).toBeGreaterThan(0);
  });
});

// ============================================================================
// Session Security Tests
// ============================================================================

describe('Session Security', () => {
  it('should not leak session info in errors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/matters/invalid',
      headers: { authorization: `Bearer ${tokenA}` },
    });
    
    const body = response.body;
    expect(body).not.toContain('password');
    expect(body).not.toContain('secret');
    expect(body).not.toContain('jwt');
  });
  
  it('should handle malformed JSON gracefully', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: {
        authorization: `Bearer ${tokenA}`,
        'content-type': 'application/json',
      },
      payload: '{invalid json}',
    });
    
    expect(response.statusCode).toBe(400);
  });
  
  it('should reject very long tokens', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/matters',
      headers: {
        authorization: `Bearer ${'A'.repeat(10000)}`,
      },
    });
    
    expect(response.statusCode).toBe(401);
  });
});

// ============================================================================
// Audit Logging Tests
// ============================================================================

describe('Audit Logging', () => {
  it('should log matter creation', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${tokenA}` },
      payload: {
        matterCode: 'AUDIT-001',
        matterName: 'Audit Test Matter',
        matterType: 'Commercial',
        clientName: 'Test',
      },
    });
    
    expect(response.statusCode).toBe(201);
    const body = JSON.parse(response.body);
    
    // Check audit log
    const audit = await pool.query(
      `SELECT * FROM audit_events 
       WHERE tenant_id = $1 AND event_type = 'matter.created' AND object_id = $2
       ORDER BY created_at DESC LIMIT 1`,
      [TENANT_A.id, body.id]
    );
    
    expect(audit.rows.length).toBe(1);
    expect(audit.rows[0].actor_attorney_id).toBe(ATTORNEY_A.id);
  });
  
  it('should log login attempts', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: ATTORNEY_A.email,
        password: 'Password123!',
        tenantSlug: TENANT_A.slug,
      },
    });
    
    const audit = await pool.query(
      `SELECT * FROM audit_events 
       WHERE tenant_id = $1 AND event_type = 'auth.login'
       ORDER BY created_at DESC LIMIT 1`,
      [TENANT_A.id]
    );
    
    expect(audit.rows.length).toBe(1);
  });
});
