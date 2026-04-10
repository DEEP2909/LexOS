/**
 * EvidentIS API Test Suite - Part 2: Matters & Documents Tests
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { build } from '../src/index';
import { pool } from '../src/database';
import { hashPassword } from '../src/security';
import { createAccessToken } from '../src/auth';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Test fixtures
const TEST_TENANT = {
  id: '00000000-0000-0000-0000-000000000010',
  name: 'Test Matters Firm',
  slug: 'test-matters-firm',
};

const TEST_ATTORNEY = {
  id: '00000000-0000-0000-0000-000000000011',
  email: 'matters@test.com',
  password: 'SecurePassword123!',
  role: 'admin',
};

let app: any;
let accessToken: string;

beforeAll(async () => {
  app = await build();
  
  await pool.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [TEST_TENANT.id, TEST_TENANT.name, TEST_TENANT.slug]
  );
  
  const passwordHash = await hashPassword(TEST_ATTORNEY.password);
  await pool.query(
    `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'Test Attorney', $4, $5)
     ON CONFLICT (id) DO UPDATE SET password_hash = $4`,
    [TEST_ATTORNEY.id, TEST_TENANT.id, TEST_ATTORNEY.email, passwordHash, TEST_ATTORNEY.role]
  );
  
  accessToken = await createAccessToken({
    sub: TEST_ATTORNEY.id,
    email: TEST_ATTORNEY.email,
    role: TEST_ATTORNEY.role,
    tenantId: TEST_TENANT.id,
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM documents WHERE tenant_id = $1`, [TEST_TENANT.id]);
  await pool.query(`DELETE FROM matters WHERE tenant_id = $1`, [TEST_TENANT.id]);
  await pool.query(`DELETE FROM attorneys WHERE tenant_id = $1`, [TEST_TENANT.id]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [TEST_TENANT.id]);
  await app.close();
});

// ============================================================================
// Matter CRUD Tests
// ============================================================================

describe('Matters API', () => {
  let createdMatterId: string;
  
  describe('POST /api/matters', () => {
    it('should create a matter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          matterCode: 'M-2024-001',
          matterName: 'Test Acquisition',
          matterType: 'M&A',
          clientName: 'Acme Corp',
          counterpartyName: 'Target Inc',
          governingLawState: 'DE',
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.matterCode).toBe('M-2024-001');
      expect(body.matterName).toBe('Test Acquisition');
      expect(body.governingLawState).toBe('DE');
      expect(body.healthScore).toBe(100);
      createdMatterId = body.id;
    });
    
    it('should reject duplicate matter code', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          matterCode: 'M-2024-001', // Same as above
          matterName: 'Another Matter',
          matterType: 'Commercial',
          clientName: 'Another Client',
        },
      });
      
      expect(response.statusCode).toBe(409);
    });
    
    it('should validate required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          // Missing required fields
          matterName: 'Incomplete Matter',
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
    
    it('should validate governing law state', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          matterCode: 'M-2024-002',
          matterName: 'Invalid State Matter',
          matterType: 'Commercial',
          clientName: 'Test Client',
          governingLawState: 'XX', // Invalid state
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
    
    it('should require authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/matters',
        payload: {
          matterCode: 'M-2024-003',
          matterName: 'Unauth Matter',
          matterType: 'Commercial',
          clientName: 'Test Client',
        },
      });
      
      expect(response.statusCode).toBe(401);
    });
  });
  
  describe('GET /api/matters', () => {
    it('should list matters', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toBeDefined();
      expect(Array.isArray(body.items)).toBe(true);
      expect(body.total).toBeGreaterThanOrEqual(1);
    });
    
    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?status=open',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.items.forEach((matter: any) => {
        expect(matter.status).toBe('open');
      });
    });
    
    it('should search by name', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?search=Acquisition',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should paginate results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters?limit=1&offset=0',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items.length).toBeLessThanOrEqual(1);
    });
  });
  
  describe('GET /api/matters/:id', () => {
    it('should get matter by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${createdMatterId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(createdMatterId);
      expect(body.matterName).toBe('Test Acquisition');
    });
    
    it('should return 404 for nonexistent matter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/matters/00000000-0000-0000-0000-000000000999',
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('should not return matters from other tenants', async () => {
      // Create a matter in another tenant
      const otherTenantId = '00000000-0000-0000-0000-000000000099';
      await pool.query(
        `INSERT INTO tenants (id, name, slug) VALUES ($1, 'Other Firm', 'other-firm')
         ON CONFLICT DO NOTHING`,
        [otherTenantId]
      );
      
      const result = await pool.query(
        `INSERT INTO matters (tenant_id, matter_code, matter_name, matter_type, client_name, created_by)
         VALUES ($1, 'OTHER-001', 'Other Matter', 'Other', 'Other Client', $2)
         RETURNING id`,
        [otherTenantId, TEST_ATTORNEY.id]
      );
      
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${result.rows[0].id}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      // Should not find it (tenant isolation)
      expect(response.statusCode).toBe(404);
      
      // Cleanup
      await pool.query(`DELETE FROM matters WHERE tenant_id = $1`, [otherTenantId]);
      await pool.query(`DELETE FROM tenants WHERE id = $1`, [otherTenantId]);
    });
  });
  
  describe('PATCH /api/matters/:id', () => {
    it('should update matter', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/matters/${createdMatterId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          matterName: 'Updated Acquisition Name',
          status: 'under_review',
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.matterName).toBe('Updated Acquisition Name');
      expect(body.status).toBe('under_review');
    });
    
    it('should validate status values', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/matters/${createdMatterId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          status: 'invalid_status',
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
  
  describe('DELETE /api/matters/:id', () => {
    it('should archive (soft delete) matter', async () => {
      // Create a matter to delete
      const createResponse = await app.inject({
        method: 'POST',
        url: '/api/matters',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          matterCode: 'M-DELETE-001',
          matterName: 'Matter to Delete',
          matterType: 'Commercial',
          clientName: 'Delete Client',
        },
      });
      
      const matterId = JSON.parse(createResponse.body).id;
      
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/matters/${matterId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(204);
      
      // Verify it's archived
      const getResponse = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      const matter = JSON.parse(getResponse.body);
      expect(matter.status).toBe('archived');
    });
  });
  
  describe('GET /api/matters/:id/analytics', () => {
    it('should return matter analytics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${createdMatterId}/analytics`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalDocuments).toBeDefined();
      expect(body.totalClauses).toBeDefined();
      expect(body.flagsByRisk).toBeDefined();
    });
  });
});

// ============================================================================
// Document Tests
// ============================================================================

describe('Documents API', () => {
  let matterId: string;
  let documentId: string;
  
  beforeAll(async () => {
    // Create a matter for document tests
    const response = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        matterCode: 'M-DOC-001',
        matterName: 'Document Test Matter',
        matterType: 'Commercial',
        clientName: 'Doc Test Client',
      },
    });
    matterId = JSON.parse(response.body).id;
  });
  
  describe('POST /api/documents/upload', () => {
    it('should upload a document', async () => {
      // Create a simple test PDF buffer
      const pdfContent = Buffer.from('%PDF-1.4 test content');
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/upload',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'multipart/form-data; boundary=boundary',
        },
        payload: `--boundary\r\nContent-Disposition: form-data; name="matterId"\r\n\r\n${matterId}\r\n--boundary\r\nContent-Disposition: form-data; name="docType"\r\n\r\ncontract\r\n--boundary\r\nContent-Disposition: form-data; name="file"; filename="test.pdf"\r\nContent-Type: application/pdf\r\n\r\n${pdfContent}\r\n--boundary--`,
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.id).toBeDefined();
      expect(body.sourceName).toBe('test.pdf');
      expect(body.ingestionStatus).toBe('uploaded');
      documentId = body.id;
    });
    
    it('should reject files exceeding size limit', async () => {
      // Create a large buffer (51MB)
      const largeContent = Buffer.alloc(51 * 1024 * 1024);
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/upload',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'multipart/form-data; boundary=boundary',
        },
        payload: `--boundary\r\nContent-Disposition: form-data; name="matterId"\r\n\r\n${matterId}\r\n--boundary\r\nContent-Disposition: form-data; name="file"; filename="large.pdf"\r\nContent-Type: application/pdf\r\n\r\n${largeContent}\r\n--boundary--`,
      });
      
      expect(response.statusCode).toBe(413);
    });
    
    it('should reject invalid MIME types', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/upload',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'multipart/form-data; boundary=boundary',
        },
        payload: `--boundary\r\nContent-Disposition: form-data; name="matterId"\r\n\r\n${matterId}\r\n--boundary\r\nContent-Disposition: form-data; name="file"; filename="test.exe"\r\nContent-Type: application/x-msdownload\r\n\r\nMZ\r\n--boundary--`,
      });
      
      expect(response.statusCode).toBe(400);
    });
    
    it('should detect duplicate files by SHA256', async () => {
      const content = '%PDF-1.4 unique test content';
      
      // First upload
      await app.inject({
        method: 'POST',
        url: '/api/documents/upload',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'multipart/form-data; boundary=boundary',
        },
        payload: `--boundary\r\nContent-Disposition: form-data; name="matterId"\r\n\r\n${matterId}\r\n--boundary\r\nContent-Disposition: form-data; name="file"; filename="dup1.pdf"\r\nContent-Type: application/pdf\r\n\r\n${content}\r\n--boundary--`,
      });
      
      // Second upload with same content
      const response = await app.inject({
        method: 'POST',
        url: '/api/documents/upload',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'multipart/form-data; boundary=boundary',
        },
        payload: `--boundary\r\nContent-Disposition: form-data; name="matterId"\r\n\r\n${matterId}\r\n--boundary\r\nContent-Disposition: form-data; name="file"; filename="dup2.pdf"\r\nContent-Type: application/pdf\r\n\r\n${content}\r\n--boundary--`,
      });
      
      expect(response.statusCode).toBe(409);
    });
  });
  
  describe('GET /api/documents/:id', () => {
    it('should get document by id', async () => {
      if (!documentId) return;
      
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(documentId);
    });
  });
  
  describe('GET /api/matters/:id/documents', () => {
    it('should list documents in matter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}/documents`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items).toBeDefined();
      expect(body.items.length).toBeGreaterThanOrEqual(1);
    });
  });
  
  describe('GET /api/documents/:id/clauses', () => {
    it('should return empty array for unprocessed document', async () => {
      if (!documentId) return;
      
      const response = await app.inject({
        method: 'GET',
        url: `/api/documents/${documentId}/clauses`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });
});

// ============================================================================
// Clause Tests
// ============================================================================

describe('Clauses API', () => {
  let matterId: string;
  let documentId: string;
  let clauseId: string;
  
  beforeAll(async () => {
    // Create matter
    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        matterCode: 'M-CLAUSE-001',
        matterName: 'Clause Test Matter',
        matterType: 'Commercial',
        clientName: 'Clause Client',
      },
    });
    matterId = JSON.parse(matterResponse.body).id;
    
    // Create document
    const docResult = await pool.query(
      `INSERT INTO documents (tenant_id, matter_id, source_name, mime_type, doc_type, sha256, file_uri, created_by, ingestion_status)
       VALUES ($1, $2, 'test-clause.pdf', 'application/pdf', 'contract', $3, '/test/path', $4, 'normalized')
       RETURNING id`,
      [TEST_TENANT.id, matterId, crypto.randomBytes(32).toString('hex'), TEST_ATTORNEY.id]
    );
    documentId = docResult.rows[0].id;
    
    // Create clause
    const clauseResult = await pool.query(
      `INSERT INTO clauses (tenant_id, document_id, clause_type, text_excerpt, risk_level, confidence)
       VALUES ($1, $2, 'indemnity', 'Seller shall indemnify and hold harmless...', 'high', 0.92)
       RETURNING id`,
      [TEST_TENANT.id, documentId]
    );
    clauseId = clauseResult.rows[0].id;
  });
  
  describe('GET /api/clauses/:id', () => {
    it('should get clause by id', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/clauses/${clauseId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(clauseId);
      expect(body.clauseType).toBe('indemnity');
      expect(body.riskLevel).toBe('high');
    });
  });
  
  describe('GET /api/matters/:id/clauses', () => {
    it('should list clauses in matter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}/clauses`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should filter by clause type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}/clauses?clauseType=indemnity`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.forEach((clause: any) => {
        expect(clause.clauseType).toBe('indemnity');
      });
    });
    
    it('should filter by risk level', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}/clauses?riskLevel=high`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.forEach((clause: any) => {
        expect(clause.riskLevel).toBe('high');
      });
    });
  });
  
  describe('POST /api/review/feedback', () => {
    it('should approve clause', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/review/feedback',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          clauseId,
          action: 'approve',
          note: 'Reviewed and approved',
        },
      });
      
      expect(response.statusCode).toBe(200);
      
      // Verify status updated
      const clauseResponse = await app.inject({
        method: 'GET',
        url: `/api/clauses/${clauseId}`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      const clause = JSON.parse(clauseResponse.body);
      expect(clause.reviewerStatus).toBe('approved');
    });
    
    it('should reject clause with note', async () => {
      // Create another clause to reject
      const clauseResult = await pool.query(
        `INSERT INTO clauses (tenant_id, document_id, clause_type, text_excerpt, risk_level, confidence)
         VALUES ($1, $2, 'non_compete', 'Excessive non-compete clause...', 'critical', 0.95)
         RETURNING id`,
        [TEST_TENANT.id, documentId]
      );
      
      const response = await app.inject({
        method: 'POST',
        url: '/api/review/feedback',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          clauseId: clauseResult.rows[0].id,
          action: 'reject',
          note: 'This clause is unenforceable in California',
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('should validate action values', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/review/feedback',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          clauseId,
          action: 'invalid_action',
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
});

// ============================================================================
// Flag Tests
// ============================================================================

describe('Flags API', () => {
  let matterId: string;
  let documentId: string;
  let flagId: string;
  
  beforeAll(async () => {
    // Create matter
    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        matterCode: 'M-FLAG-001',
        matterName: 'Flag Test Matter',
        matterType: 'Commercial',
        clientName: 'Flag Client',
      },
    });
    matterId = JSON.parse(matterResponse.body).id;
    
    // Create document
    const docResult = await pool.query(
      `INSERT INTO documents (tenant_id, matter_id, source_name, mime_type, doc_type, sha256, file_uri, created_by, ingestion_status)
       VALUES ($1, $2, 'test-flag.pdf', 'application/pdf', 'contract', $3, '/test/path', $4, 'normalized')
       RETURNING id`,
      [TEST_TENANT.id, matterId, crypto.randomBytes(32).toString('hex'), TEST_ATTORNEY.id]
    );
    documentId = docResult.rows[0].id;
    
    // Create flag
    const flagResult = await pool.query(
      `INSERT INTO flags (tenant_id, matter_id, document_id, flag_type, severity, reason, recommended_fix)
       VALUES ($1, $2, $3, 'playbook_violation', 'critical', 'Uncapped indemnity clause', 'Add liability cap')
       RETURNING id`,
      [TEST_TENANT.id, matterId, documentId]
    );
    flagId = flagResult.rows[0].id;
  });
  
  describe('GET /api/matters/:id/flags', () => {
    it('should list flags in matter', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}/flags`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.items.length).toBeGreaterThanOrEqual(1);
    });
    
    it('should filter by severity', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}/flags?severity=critical`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.items.forEach((flag: any) => {
        expect(flag.severity).toBe('critical');
      });
    });
    
    it('should filter by status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}/flags?status=open`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.items.forEach((flag: any) => {
        expect(flag.status).toBe('open');
      });
    });
  });
  
  describe('PATCH /api/flags/:id', () => {
    it('should resolve flag', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/flags/${flagId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          status: 'resolved',
          resolutionNote: 'Client accepted the risk',
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('should assign flag to attorney', async () => {
      // Create new flag for assignment
      const flagResult = await pool.query(
        `INSERT INTO flags (tenant_id, matter_id, document_id, flag_type, severity, reason)
         VALUES ($1, $2, $3, 'missing_clause', 'high', 'Missing LOL clause')
         RETURNING id`,
        [TEST_TENANT.id, matterId, documentId]
      );
      
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/flags/${flagResult.rows[0].id}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          assignedTo: TEST_ATTORNEY.id,
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
  });
});

// ============================================================================
// Obligation Tests
// ============================================================================

describe('Obligations API', () => {
  let matterId: string;
  let obligationId: string;
  
  beforeAll(async () => {
    const matterResponse = await app.inject({
      method: 'POST',
      url: '/api/matters',
      headers: { authorization: `Bearer ${accessToken}` },
      payload: {
        matterCode: 'M-OBLIG-001',
        matterName: 'Obligation Test Matter',
        matterType: 'Commercial',
        clientName: 'Oblig Client',
      },
    });
    matterId = JSON.parse(matterResponse.body).id;
    
    const obligResult = await pool.query(
      `INSERT INTO obligations (tenant_id, matter_id, obligation_type, party, description, deadline_date)
       VALUES ($1, $2, 'payment', 'Buyer', 'Payment due within 30 days', $3)
       RETURNING id`,
      [TEST_TENANT.id, matterId, new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)]
    );
    obligationId = obligResult.rows[0].id;
  });
  
  describe('POST /api/obligations', () => {
    it('should create obligation manually', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/obligations',
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          matterId,
          obligationType: 'notice',
          party: 'Seller',
          description: 'Provide 30-day notice before termination',
          deadlineText: '30 days prior to termination',
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.obligationType).toBe('notice');
    });
  });
  
  describe('GET /api/matters/:id/timeline', () => {
    it('should return obligations timeline', async () => {
      const response = await app.inject({
        method: 'GET',
        url: `/api/matters/${matterId}/timeline`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });
  
  describe('PATCH /api/obligations/:id', () => {
    it('should update obligation status', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/obligations/${obligationId}`,
        headers: { authorization: `Bearer ${accessToken}` },
        payload: {
          status: 'completed',
          notes: 'Payment received',
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
  });
  
  describe('POST /api/obligations/:id/calendar', () => {
    it('should generate iCal file', async () => {
      const response = await app.inject({
        method: 'POST',
        url: `/api/obligations/${obligationId}/calendar`,
        headers: { authorization: `Bearer ${accessToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toMatch(/text\/calendar/);
    });
  });
});
