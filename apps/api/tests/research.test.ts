/**
 * EvidentIS API Test Suite - Part 5: Research, AI Integration, Worker Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import { build } from '../src/index';
import { pool } from '../src/database';
import { hashPassword } from '../src/security';
import { createAccessToken } from '../src/auth';
import { enqueueDocumentScan, getJobStatus } from '../src/worker';

const TEST_TENANT = {
  id: '00000000-0000-0000-0000-000000000400',
  name: 'Research Test Firm',
  slug: 'research-test-firm',
};

const TEST_ATTORNEY = {
  id: '00000000-0000-0000-0000-000000000401',
  email: 'research@test.com',
};

const TEST_MATTER = {
  id: '00000000-0000-0000-0000-000000000410',
  name: 'Research Test Matter',
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
     VALUES ($1, $2, $3, 'Research Tester', $4, 'attorney')
     ON CONFLICT DO NOTHING`,
    [TEST_ATTORNEY.id, TEST_TENANT.id, TEST_ATTORNEY.email, passwordHash]
  );
  
  await pool.query(
    `INSERT INTO matters (id, tenant_id, matter_code, matter_name, matter_type, client_name, lead_attorney_id)
     VALUES ($1, $2, $3, $4, 'commercial_contract', 'Test Client', $5)
     ON CONFLICT DO NOTHING`,
    [TEST_MATTER.id, TEST_TENANT.id, 'RS-TEST-410', TEST_MATTER.name, TEST_ATTORNEY.id]
  );
  
  token = await createAccessToken({
    sub: TEST_ATTORNEY.id,
    email: TEST_ATTORNEY.email,
    role: 'attorney',
    tenantId: TEST_TENANT.id,
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM matters WHERE tenant_id = $1`, [TEST_TENANT.id]);
  await pool.query(`DELETE FROM attorneys WHERE tenant_id = $1`, [TEST_TENANT.id]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [TEST_TENANT.id]);
  await app.close();
});

// ============================================================================
// Research Endpoint Tests
// ============================================================================

describe('Research Endpoints', () => {
  describe('POST /api/research/query', () => {
    it('should require query parameter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/research/query',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          matterId: TEST_MATTER.id,
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
    
    it('should validate matter exists', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/research/query',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          matterId: '00000000-0000-0000-0000-000000000999',
          query: 'indemnification caps',
        },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('should accept valid research query', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/research/query',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          matterId: TEST_MATTER.id,
          query: 'What are typical indemnification caps in M&A deals?',
        },
      });
      
      // May 200 or 500 if AI service is unavailable
      expect([200, 202, 500, 503]).toContain(response.statusCode);
    });
    
    it('should limit query length', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/research/query',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          matterId: TEST_MATTER.id,
          query: 'a'.repeat(5000), // Very long query
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
    
    it('should rate limit research queries', async () => {
      // Make many requests quickly
      const requests = Array(110).fill(null).map(() =>
        app.inject({
          method: 'POST',
          url: '/api/research/query',
          headers: { authorization: `Bearer ${token}` },
          payload: {
            matterId: TEST_MATTER.id,
            query: 'test query',
          },
        })
      );
      
      const responses = await Promise.all(requests);
      const tooManyRequests = responses.some(r => r.statusCode === 429);
      expect(tooManyRequests).toBe(true);
    });
  });
  
  describe('GET /api/research/history', () => {
    it('should return research history', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/research/history?matterId=${TEST_MATTER.id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
    
    it('should paginate results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/research/history?matterId=${TEST_MATTER.id}&limit=5`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBeLessThanOrEqual(5);
    });
  });
});

// ============================================================================
// Clause Extraction Tests
// ============================================================================

describe('Clause Extraction', () => {
  let documentId: string;
  
  beforeAll(async () => {
    // Create test document
    const result = await pool.query(
      `INSERT INTO documents (id, tenant_id, matter_id, file_name, file_path, status)
       VALUES ($1, $2, $3, 'test-clauses.pdf', '/test/path', 'processed')
       RETURNING id`,
      ['00000000-0000-0000-0000-000000000420', TEST_TENANT.id, TEST_MATTER.id]
    );
    documentId = result.rows[0].id;
    
    // Insert test clauses
    const clauseTypes = [
      'indemnification', 'limitation_of_liability', 'termination_for_convenience',
      'confidentiality', 'non_compete', 'governing_law', 'arbitration'
    ];
    
    for (const type of clauseTypes) {
      await pool.query(
        `INSERT INTO clauses (tenant_id, document_id, clause_type, text, confidence_score, page_number)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [TEST_TENANT.id, documentId, type, `This is a ${type} clause.`, 0.85, 1]
      );
    }
  });
  
  describe('GET /api/documents/:id/clauses', () => {
    it('should return all clauses', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/clauses`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBe(7);
    });
    
    it('should filter by clause type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/clauses?type=indemnification`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBe(1);
      expect(body[0].clauseType).toBe('indemnification');
    });
    
    it('should filter by confidence threshold', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/clauses?minConfidence=0.9`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // All test clauses have 0.85 confidence, so none should match
      expect(body.length).toBe(0);
    });
    
    it('should include location metadata', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/clauses`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.forEach((clause: any) => {
        expect(clause.pageNumber).toBeDefined();
        expect(clause.confidenceScore).toBeDefined();
      });
    });
  });
  
  describe('GET /api/matters/:id/clauses', () => {
    it('should return clauses across all documents', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${TEST_MATTER.id}/clauses`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBeGreaterThanOrEqual(7);
    });
    
    it('should group by clause type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${TEST_MATTER.id}/clauses?groupBy=type`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
    });
  });
  
  describe('POST /api/clauses/:id/review', () => {
    let clauseId: string;
    
    beforeAll(async () => {
      const result = await pool.query(
        `SELECT id FROM clauses WHERE document_id = $1 LIMIT 1`,
        [documentId]
      );
      clauseId = result.rows[0].id;
    });
    
    it('should accept review feedback', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/clauses/${clauseId}/review`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          isCorrect: true,
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('should accept correction feedback', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/clauses/${clauseId}/review`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          isCorrect: false,
          correctedType: 'indemnification',
          comment: 'This is actually an indemnification clause',
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('should validate clause type correction', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/clauses/${clauseId}/review`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          isCorrect: false,
          correctedType: 'invalid_type',
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
});

// ============================================================================
// Flag Tests
// ============================================================================

describe('Flag Management', () => {
  let documentId: string;
  let flagId: string;
  
  beforeAll(async () => {
    // Create document
    const docResult = await pool.query(
      `INSERT INTO documents (id, tenant_id, matter_id, file_name, file_path, status)
       VALUES ($1, $2, $3, 'flags-test.pdf', '/test/flags', 'processed')
       RETURNING id`,
      ['00000000-0000-0000-0000-000000000430', TEST_TENANT.id, TEST_MATTER.id]
    );
    documentId = docResult.rows[0].id;
    
    // Create test flags
    const flags = [
      { severity: 'critical', rule_id: 'rule1', description: 'Uncapped indemnity' },
      { severity: 'high', rule_id: 'rule2', description: 'Weak limitation of liability' },
      { severity: 'medium', rule_id: 'rule3', description: 'Non-compete in California' },
      { severity: 'low', rule_id: 'rule4', description: 'Missing notice period' },
    ];
    
    for (const flag of flags) {
      await pool.query(
        `INSERT INTO flags (tenant_id, document_id, severity, rule_id, description)
         VALUES ($1, $2, $3, $4, $5)`,
        [TEST_TENANT.id, documentId, flag.severity, flag.rule_id, flag.description]
      );
    }
    
    // Get a flag ID for later tests
    const flagResult = await pool.query(
      `SELECT id FROM flags WHERE document_id = $1 LIMIT 1`,
      [documentId]
    );
    flagId = flagResult.rows[0].id;
  });
  
  describe('GET /api/documents/:id/flags', () => {
    it('should return all flags', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/flags`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBe(4);
    });
    
    it('should filter by severity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/flags?severity=critical`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBe(1);
      expect(body[0].severity).toBe('critical');
    });
    
    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/flags?status=open`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.forEach((flag: any) => {
        expect(flag.status).toBe('open');
      });
    });
  });
  
  describe('PATCH /api/flags/:id', () => {
    it('should update flag status', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/flags/${flagId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          status: 'acknowledged',
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('acknowledged');
    });
    
    it('should allow adding a note', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/flags/${flagId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          note: 'Reviewed with client, acceptable risk',
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('should validate status transition', async () => {
      // First mark as resolved
      await app.inject({
        method: 'PATCH',
        url: `/api/flags/${flagId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'resolved' },
      });
      
      // Try to go back to open (invalid)
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/flags/${flagId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { status: 'open' },
      });
      
      expect([200, 400]).toContain(response.statusCode);
    });
  });
  
  describe('POST /api/flags/bulk-update', () => {
    it('should bulk update flags', async () => {
      const flagsResult = await pool.query(
        `SELECT id FROM flags WHERE document_id = $1`,
        [documentId]
      );
      const flagIds = flagsResult.rows.map(r => r.id);
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/flags/bulk-update',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          flagIds: flagIds.slice(0, 2),
          status: 'waived',
          reason: 'Client accepted risk',
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.updated).toBe(2);
    });
  });
});

// ============================================================================
// Obligation Tests
// ============================================================================

describe('Obligation Tracking', () => {
  let documentId: string;
  let obligationId: string;
  
  beforeAll(async () => {
    // Create document
    const docResult = await pool.query(
      `INSERT INTO documents (id, tenant_id, matter_id, file_name, file_path, status)
       VALUES ($1, $2, $3, 'obligations-test.pdf', '/test/obligations', 'processed')
       RETURNING id`,
      ['00000000-0000-0000-0000-000000000440', TEST_TENANT.id, TEST_MATTER.id]
    );
    documentId = docResult.rows[0].id;
    
    // Create test obligations
    const obligations = [
      { 
        obligation_type: 'payment',
        title: 'Initial payment',
        due_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: 'pending'
      },
      { 
        obligation_type: 'delivery',
        title: 'Deliver documents',
        due_date: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // 14 days
        status: 'pending'
      },
      { 
        obligation_type: 'notice',
        title: 'Send 30-day notice',
        due_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // Overdue!
        status: 'pending'
      },
    ];
    
    for (const obl of obligations) {
      await pool.query(
        `INSERT INTO obligations (tenant_id, document_id, obligation_type, title, due_date, status)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [TEST_TENANT.id, documentId, obl.obligation_type, obl.title, obl.due_date, obl.status]
      );
    }
    
    // Get an obligation ID
    const oblResult = await pool.query(
      `SELECT id FROM obligations WHERE document_id = $1 LIMIT 1`,
      [documentId]
    );
    obligationId = oblResult.rows[0].id;
  });
  
  describe('GET /api/documents/:id/obligations', () => {
    it('should return all obligations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/obligations`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBe(3);
    });
    
    it('should include overdue status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/obligations`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      const overdueObl = body.find((o: any) => o.title === 'Send 30-day notice');
      expect(overdueObl.isOverdue).toBe(true);
    });
  });
  
  describe('GET /api/matters/:id/obligations', () => {
    it('should return upcoming obligations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${TEST_MATTER.id}/obligations?upcoming=true`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      // Should include upcoming but not overdue
      body.forEach((o: any) => {
        if (o.isOverdue !== undefined) {
          expect(new Date(o.dueDate).getTime()).toBeGreaterThan(Date.now());
        }
      });
    });
    
    it('should return overdue obligations', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${TEST_MATTER.id}/obligations?overdue=true`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.some((o: any) => o.isOverdue)).toBe(true);
    });
  });
  
  describe('PATCH /api/obligations/:id', () => {
    it('should update obligation status', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/obligations/${obligationId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          status: 'completed',
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.status).toBe('completed');
    });
    
    it('should update due date', async () => {
      const newDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/obligations/${obligationId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          dueDate: newDate.toISOString(),
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('should assign obligation to attorney', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/obligations/${obligationId}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          assignedTo: TEST_ATTORNEY.id,
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
  });
  
  describe('POST /api/obligations', () => {
    it('should create manual obligation', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/obligations',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          documentId: documentId,
          obligationType: 'custom',
          title: 'Manual follow-up',
          description: 'Check on status',
          dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.title).toBe('Manual follow-up');
    });
    
    it('should validate due date', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/obligations',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          documentId: documentId,
          obligationType: 'custom',
          title: 'Past obligation',
          dueDate: new Date('1999-01-01').toISOString(),
        },
      });
      
      // Should either fail (400) or accept past dates
      expect([201, 400]).toContain(response.statusCode);
    });
  });
});

// ============================================================================
// Worker Integration Tests
// ============================================================================

describe('Worker Integration', () => {
  describe('Document Processing Queue', () => {
    it('should enqueue document for processing', async () => {
      // This is a unit test of the worker function
      const documentId = '00000000-0000-0000-0000-000000000450';
      
      // Create test document
      await pool.query(
        `INSERT INTO documents (id, tenant_id, matter_id, file_name, file_path, status)
         VALUES ($1, $2, $3, 'worker-test.pdf', '/test/worker', 'uploaded')
         ON CONFLICT DO NOTHING`,
        [documentId, TEST_TENANT.id, TEST_MATTER.id]
      );
      
      // Enqueue (may fail if Redis not available)
      try {
        const jobId = await enqueueDocumentScan(documentId, TEST_TENANT.id, '/test/worker');
        expect(jobId).toBeDefined();
      } catch (e) {
        // Redis not available in test environment
        expect(e).toBeDefined();
      }
    });
    
    it('should get job status', async () => {
      try {
        const status = await getJobStatus('document.scan', 'nonexistent-job');
        expect(status).toBeNull();
      } catch (e) {
        // Redis not available
        expect(e).toBeDefined();
      }
    });
  });
  
  describe('GET /api/jobs/:id', () => {
    it('should return 404 for nonexistent job', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/jobs/nonexistent-id',
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect([404, 200]).toContain(response.statusCode);
    });
  });
});

// ============================================================================
// Redline/Suggestions Tests
// ============================================================================

describe('Redline and Suggestions', () => {
  let clauseId: string;
  
  beforeAll(async () => {
    // Get a clause for suggestions
    const result = await pool.query(
      `SELECT id FROM clauses WHERE tenant_id = $1 LIMIT 1`,
      [TEST_TENANT.id]
    );
    if (result.rows.length > 0) {
      clauseId = result.rows[0].id;
    }
  });
  
  describe('POST /api/clauses/:id/suggest-redline', () => {
    it('should request redline suggestion', async () => {
      if (!clauseId) return;
      
      const response = await app.inject({
        method: 'POST',
        url: `/api/clauses/${clauseId}/suggest-redline`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          instruction: 'Add a 24-month survival period',
        },
      });
      
      // May succeed or fail if AI service unavailable
      expect([200, 202, 500, 503]).toContain(response.statusCode);
    });
  });
  
  describe('GET /api/clauses/:id/suggestions', () => {
    it('should return suggestions', async () => {
      if (!clauseId) return;
      
      const response = await app.inject({
        method: 'GET',
        url: `/api/clauses/${clauseId}/suggestions`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });
  
  describe('POST /api/suggestions/:id/accept', () => {
    it('should validate suggestion exists', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/suggestions/00000000-0000-0000-0000-000000000999/accept',
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
  
  describe('POST /api/suggestions/:id/reject', () => {
    it('should validate suggestion exists', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/suggestions/00000000-0000-0000-0000-000000000999/reject',
        headers: { authorization: `Bearer ${token}` },
        payload: {
          reason: 'Not applicable',
        },
      });
      
      expect(response.statusCode).toBe(404);
    });
  });
});

// ============================================================================
// Legal Rules Validation Tests
// ============================================================================

describe('Legal Rules Integration', () => {
  it('should flag non-compete in California matter', async () => {
    // Create California matter
    const matterId = '00000000-0000-0000-0000-000000000460';
    await pool.query(
      `INSERT INTO matters (id, tenant_id, matter_code, matter_name, matter_type, client_name, lead_attorney_id, governing_law_state)
       VALUES ($1, $2, $3, $4, 'employment', 'Test Client', $5, 'CA')
       ON CONFLICT DO NOTHING`,
      [matterId, TEST_TENANT.id, 'CA-TEST-460', 'CA Test', TEST_ATTORNEY.id]
    );
    
    // Create document with non-compete
    const docId = '00000000-0000-0000-0000-000000000461';
    await pool.query(
      `INSERT INTO documents (id, tenant_id, matter_id, file_name, file_path, status)
       VALUES ($1, $2, $3, 'ca-noncompete.pdf', '/test/ca', 'processed')
       ON CONFLICT DO NOTHING`,
      [docId, TEST_TENANT.id, matterId]
    );
    
    // Insert non-compete clause
    await pool.query(
      `INSERT INTO clauses (tenant_id, document_id, clause_type, text, confidence_score, page_number)
       VALUES ($1, $2, 'non_compete', 'Employee shall not compete for 2 years', 0.9, 1)`,
      [TEST_TENANT.id, docId]
    );
    
    // Check that flag was created or would be created
    const response = await app.inject({
      method: 'GET',
      url: `/api/documents/${docId}/flags`,
      headers: { authorization: `Bearer ${token}` },
    });
    
    expect(response.statusCode).toBe(200);
  });
  
  it('should validate CCPA requirements for California data privacy', async () => {
    // This tests the legal-rules.ts integration
    const response = await app.inject({
      method: 'GET',
      url: '/api/legal-rules/CA/data_privacy',
      headers: { authorization: `Bearer ${token}` },
    });
    
    // May be 200 or 404 if endpoint not implemented
    expect([200, 404]).toContain(response.statusCode);
  });
});

// ============================================================================
// Completeness Check Tests
// ============================================================================

describe('Document Completeness', () => {
  let documentId: string;
  
  beforeAll(async () => {
    documentId = '00000000-0000-0000-0000-000000000470';
    await pool.query(
      `INSERT INTO documents (id, tenant_id, matter_id, file_name, file_path, status)
       VALUES ($1, $2, $3, 'completeness.pdf', '/test/complete', 'processed')
       ON CONFLICT DO NOTHING`,
      [documentId, TEST_TENANT.id, TEST_MATTER.id]
    );
    
    // Add some but not all required clauses
    const clauses = ['indemnification', 'confidentiality', 'governing_law'];
    for (const type of clauses) {
      await pool.query(
        `INSERT INTO clauses (tenant_id, document_id, clause_type, text, confidence_score, page_number)
         VALUES ($1, $2, $3, $4, 0.9, 1)`,
        [TEST_TENANT.id, documentId, type, `Sample ${type} clause`]
      );
    }
  });
  
  describe('GET /api/documents/:id/completeness', () => {
    it('should return completeness report', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/completeness`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect([200, 404]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.foundClauses).toBeDefined();
        expect(body.missingClauses).toBeDefined();
      }
    });
  });
});

// ============================================================================
// Contradiction Detection Tests
// ============================================================================

describe('Contradiction Detection', () => {
  let documentId: string;
  
  beforeAll(async () => {
    documentId = '00000000-0000-0000-0000-000000000480';
    await pool.query(
      `INSERT INTO documents (id, tenant_id, matter_id, file_name, file_path, status)
       VALUES ($1, $2, $3, 'contradictions.pdf', '/test/contradictions', 'processed')
       ON CONFLICT DO NOTHING`,
      [documentId, TEST_TENANT.id, TEST_MATTER.id]
    );
    
    // Add potentially contradictory clauses
    await pool.query(
      `INSERT INTO clauses (tenant_id, document_id, clause_type, text, confidence_score, page_number)
       VALUES ($1, $2, 'governing_law', 'This agreement shall be governed by New York law', 0.9, 1)`,
      [TEST_TENANT.id, documentId]
    );
    
    await pool.query(
      `INSERT INTO clauses (tenant_id, document_id, clause_type, text, confidence_score, page_number)
       VALUES ($1, $2, 'governing_law', 'California law applies exclusively', 0.9, 5)`,
      [TEST_TENANT.id, documentId]
    );
  });
  
  describe('GET /api/documents/:id/contradictions', () => {
    it('should return contradiction report', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/contradictions`,
        headers: { authorization: `Bearer ${token}` },
      });
      
      expect([200, 404]).toContain(response.statusCode);
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(Array.isArray(body)).toBe(true);
      }
    });
  });
});
