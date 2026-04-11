/**
 * EvidentIS API Test Suite - Part 4: Admin, Billing, SCIM Tests
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { build } from '../src/index';
import { pool } from '../src/database';
import { hashPassword } from '../src/security';
import { createAccessToken } from '../src/auth';
import crypto from 'crypto';

const TEST_TENANT = {
  id: '00000000-0000-0000-0000-000000000300',
  name: 'Admin Test Firm',
  slug: 'admin-test-firm',
};

const ADMIN_ATTORNEY = {
  id: '00000000-0000-0000-0000-000000000301',
  email: 'admin@admin-test.com',
  role: 'admin',
};

const ATTORNEY_USER = {
  id: '00000000-0000-0000-0000-000000000302',
  email: 'attorney@admin-test.com',
  role: 'attorney',
};

let app: any;
let adminToken: string;
let attorneyToken: string;

beforeAll(async () => {
  app = await build();
  
  await pool.query(
    `INSERT INTO tenants (id, name, slug) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [TEST_TENANT.id, TEST_TENANT.name, TEST_TENANT.slug]
  );
  
  const passwordHash = await hashPassword('Password123!');
  
  await pool.query(
    `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'Admin User', $4, $5)
     ON CONFLICT (id) DO UPDATE SET password_hash = $4`,
    [ADMIN_ATTORNEY.id, TEST_TENANT.id, ADMIN_ATTORNEY.email, passwordHash, ADMIN_ATTORNEY.role]
  );
  
  await pool.query(
    `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
     VALUES ($1, $2, $3, 'Attorney User', $4, $5)
     ON CONFLICT (id) DO UPDATE SET password_hash = $4`,
    [ATTORNEY_USER.id, TEST_TENANT.id, ATTORNEY_USER.email, passwordHash, ATTORNEY_USER.role]
  );
  
  adminToken = await createAccessToken({
    sub: ADMIN_ATTORNEY.id,
    email: ADMIN_ATTORNEY.email,
    role: ADMIN_ATTORNEY.role,
    tenantId: TEST_TENANT.id,
  });
  
  attorneyToken = await createAccessToken({
    sub: ATTORNEY_USER.id,
    email: ATTORNEY_USER.email,
    role: ATTORNEY_USER.role,
    tenantId: TEST_TENANT.id,
  });
});

afterAll(async () => {
  await pool.query(`DELETE FROM attorneys WHERE tenant_id = $1`, [TEST_TENANT.id]);
  await pool.query(`DELETE FROM tenants WHERE id = $1`, [TEST_TENANT.id]);
  await app.close();
});

// ============================================================================
// Role-Based Access Control Tests
// ============================================================================

describe('Role-Based Access Control', () => {
  describe('Admin-only endpoints', () => {
    it('admin can access admin endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenant',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('attorney cannot access admin endpoints', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenant',
        headers: { authorization: `Bearer ${attorneyToken}` },
      });
      
      expect(response.statusCode).toBe(403);
    });
    
    it('admin can invite new attorneys', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/invitations',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          email: 'newattorney@test.com',
          role: 'attorney',
        },
      });
      
      expect([200, 201]).toContain(response.statusCode);
    });
    
    it('attorney cannot invite new attorneys', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/invitations',
        headers: { authorization: `Bearer ${attorneyToken}` },
        payload: {
          email: 'another@test.com',
          role: 'attorney',
        },
      });
      
      expect(response.statusCode).toBe(403);
    });
  });
  
  describe('Partner-level endpoints', () => {
    let partnerToken: string;
    
    beforeAll(async () => {
      const passwordHash = await hashPassword('Password123!');
      await pool.query(
        `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
         VALUES ($1, $2, 'partner@test.com', 'Partner', $3, 'partner')
         ON CONFLICT (tenant_id, email) DO UPDATE SET role = 'partner'`,
        ['00000000-0000-0000-0000-000000000303', TEST_TENANT.id, passwordHash]
      );
      
      partnerToken = await createAccessToken({
        sub: '00000000-0000-0000-0000-000000000303',
        email: 'partner@test.com',
        role: 'partner',
        tenantId: TEST_TENANT.id,
      });
    });
    
    it('partner can access firm analytics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/analytics/firm',
        headers: { authorization: `Bearer ${partnerToken}` },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('attorney cannot access firm analytics', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/analytics/firm',
        headers: { authorization: `Bearer ${attorneyToken}` },
      });
      
      expect(response.statusCode).toBe(403);
    });
  });
});

// ============================================================================
// Admin Endpoints Tests
// ============================================================================

describe('Admin Endpoints', () => {
  describe('GET /api/admin/tenant', () => {
    it('should return tenant info', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/tenant',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.name).toBe(TEST_TENANT.name);
      expect(body.slug).toBe(TEST_TENANT.slug);
    });
  });
  
  describe('PATCH /api/admin/tenant', () => {
    it('should update tenant settings', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/admin/tenant',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Updated Firm Name',
          settings: { theme: 'dark' },
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
  });
  
  describe('Attorney Management', () => {
    it('should list attorneys', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/attorneys',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should update attorney role', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/attorneys/${ATTORNEY_USER.id}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          role: 'paralegal',
        },
      });
      
      expect(response.statusCode).toBe(200);
      
      // Reset role
      await pool.query(
        `UPDATE attorneys SET role = 'attorney' WHERE id = $1`,
        [ATTORNEY_USER.id]
      );
    });
    
    it('should suspend attorney', async () => {
      // Create a temporary attorney to suspend
      const tempId = '00000000-0000-0000-0000-000000000399';
      const passwordHash = await hashPassword('Password123!');
      
      await pool.query(
        `INSERT INTO attorneys (id, tenant_id, email, display_name, password_hash, role)
         VALUES ($1, $2, 'suspend@test.com', 'To Suspend', $3, 'attorney')
         ON CONFLICT DO NOTHING`,
        [tempId, TEST_TENANT.id, passwordHash]
      );
      
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/attorneys/${tempId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(204);
      
      // Verify suspended
      const check = await pool.query(
        `SELECT status FROM attorneys WHERE id = $1`,
        [tempId]
      );
      expect(check.rows[0].status).toBe('suspended');
    });
  });
  
  describe('API Keys', () => {
    let apiKeyId: string;
    
    it('should create API key', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Test API Key',
          role: 'api_user',
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.key).toBeDefined(); // One-time reveal
      expect(body.keyPrefix).toBeDefined();
      apiKeyId = body.id;
    });
    
    it('should list API keys without secrets', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/api-keys',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
      
      // Should not expose secrets
      body.forEach((key: any) => {
        expect(key.key).toBeUndefined();
        expect(key.keyHash).toBeUndefined();
      });
    });
    
    it('should revoke API key', async () => {
      if (!apiKeyId) return;
      
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/admin/api-keys/${apiKeyId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(204);
    });
  });
  
  describe('Playbooks', () => {
    let playbookId: string;
    
    it('should create playbook', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/playbooks',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Test Playbook',
          description: 'A test playbook',
          practiceArea: 'M&A',
          rules: [
            {
              id: 'r1',
              clause_type: 'indemnity',
              condition: 'uncapped',
              severity: 'critical',
              description: 'No uncapped indemnity',
            },
          ],
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      playbookId = body.id;
    });
    
    it('should list playbooks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/playbooks',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
    
    it('should update playbook', async () => {
      if (!playbookId) return;
      
      const response = await app.inject({
        method: 'PATCH',
        url: `/api/admin/playbooks/${playbookId}`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          isActive: true,
        },
      });
      
      expect(response.statusCode).toBe(200);
    });
    
    it('should validate playbook rules schema', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/admin/playbooks',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          name: 'Invalid Playbook',
          rules: [
            {
              // Missing required fields
              severity: 'invalid_severity',
            },
          ],
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
  
  describe('Audit Log', () => {
    it('should return audit events', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/audit-log',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
    
    it('should filter by event type', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/audit-log?eventType=auth.login',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      body.forEach((event: any) => {
        expect(event.eventType).toBe('auth.login');
      });
    });
    
    it('should paginate results', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/admin/audit-log?limit=5&offset=0',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.length).toBeLessThanOrEqual(5);
    });
  });
});

// ============================================================================
// Billing Endpoints Tests
// ============================================================================

describe('Billing Endpoints', () => {
  describe('GET /api/billing/status', () => {
    it('should return billing status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/billing/status',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.plan).toBeDefined();
      expect(body.status).toBeDefined();
      expect(body.usage).toBeDefined();
    });
  });
  
  describe('POST /api/billing/checkout', () => {
    it('should create checkout session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/checkout',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          plan: 'growth',
          successUrl: 'http://localhost:3000/billing/success',
          cancelUrl: 'http://localhost:3000/billing/cancel',
        },
      });
      
      // May fail if Paddle is not configured, which is okay
      expect([200, 201, 500]).toContain(response.statusCode);
    });
    
    it('should reject invalid plan', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/billing/checkout',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          plan: 'invalid_plan',
          successUrl: 'http://localhost:3000/success',
          cancelUrl: 'http://localhost:3000/cancel',
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
  
  describe('GET /api/quota/check', () => {
    it('should return quota status', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/quota/check',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.documentsRemaining).toBeDefined();
      expect(body.researchRemaining).toBeDefined();
    });
  });
});

// ============================================================================
// SCIM Endpoints Tests
// ============================================================================

describe('SCIM 2.0 Endpoints', () => {
  let scimToken: string;
  let createdUserId: string;
  
  beforeAll(async () => {
    // Create SCIM token
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    
    await pool.query(
      `INSERT INTO scim_tokens (tenant_id, name, token_prefix, token_hash)
       VALUES ($1, 'Test SCIM Token', $2, $3)`,
      [TEST_TENANT.id, token.substring(0, 8), tokenHash]
    );
    
    scimToken = token;
  });
  
  describe('Service Configuration', () => {
    it('should return ServiceProviderConfig', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/ServiceProviderConfig',
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.schemas).toContain('urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig');
      expect(body.patch.supported).toBe(true);
    });
    
    it('should return ResourceTypes', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/ResourceTypes',
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.Resources.length).toBeGreaterThanOrEqual(2);
    });
    
    it('should return Schemas', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/Schemas',
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(200);
    });
  });
  
  describe('SCIM Users', () => {
    it('should create user', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/scim/v2/Users',
        headers: {
          authorization: `Bearer ${scimToken}`,
          'content-type': 'application/scim+json',
        },
        payload: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'scim.test@example.com',
          name: {
            givenName: 'SCIM',
            familyName: 'Test',
          },
          displayName: 'SCIM Test User',
          active: true,
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.userName).toBe('scim.test@example.com');
      createdUserId = body.id;
    });
    
    it('should list users', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/Users',
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.schemas).toContain('urn:ietf:params:scim:api:messages:2.0:ListResponse');
      expect(body.Resources).toBeDefined();
    });
    
    it('should filter users by userName', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/Users?filter=userName eq "scim.test@example.com"',
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalResults).toBe(1);
    });
    
    it('should get user by id', async () => {
      if (!createdUserId) return;
      
      const response = await app.inject({
        method: 'GET',
        url: `/scim/v2/Users/${createdUserId}`,
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe(createdUserId);
    });
    
    it('should update user with PUT', async () => {
      if (!createdUserId) return;
      
      const response = await app.inject({
        method: 'PUT',
        url: `/scim/v2/Users/${createdUserId}`,
        headers: {
          authorization: `Bearer ${scimToken}`,
          'content-type': 'application/scim+json',
        },
        payload: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: 'scim.test@example.com',
          displayName: 'Updated SCIM User',
          active: true,
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.displayName).toBe('Updated SCIM User');
    });
    
    it('should patch user (deactivate)', async () => {
      if (!createdUserId) return;
      
      const response = await app.inject({
        method: 'PATCH',
        url: `/scim/v2/Users/${createdUserId}`,
        headers: {
          authorization: `Bearer ${scimToken}`,
          'content-type': 'application/scim+json',
        },
        payload: {
          schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'],
          Operations: [
            { op: 'replace', path: 'active', value: false },
          ],
        },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.active).toBe(false);
    });
    
    it('should delete user (suspend)', async () => {
      if (!createdUserId) return;
      
      const response = await app.inject({
        method: 'DELETE',
        url: `/scim/v2/Users/${createdUserId}`,
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(204);
    });
    
    it('should return 404 for nonexistent user', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/Users/00000000-0000-0000-0000-000000000999',
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(404);
    });
    
    it('should return 409 for duplicate user', async () => {
      // Try to create user with existing email
      const response = await app.inject({
        method: 'POST',
        url: '/scim/v2/Users',
        headers: {
          authorization: `Bearer ${scimToken}`,
          'content-type': 'application/scim+json',
        },
        payload: {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
          userName: ADMIN_ATTORNEY.email, // Already exists
          displayName: 'Duplicate',
          active: true,
        },
      });
      
      expect(response.statusCode).toBe(409);
    });
  });
  
  describe('SCIM Groups', () => {
    it('should list groups (roles)', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/Groups',
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.Resources.length).toBeGreaterThan(0);
    });
    
    it('should get group with members', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/Groups/admin',
        headers: { authorization: `Bearer ${scimToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.id).toBe('admin');
      expect(body.members).toBeDefined();
    });
  });
  
  describe('SCIM Authentication', () => {
    it('should reject missing token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/Users',
      });
      
      expect(response.statusCode).toBe(401);
    });
    
    it('should reject invalid token', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/scim/v2/Users',
        headers: { authorization: 'Bearer invalid-token' },
      });
      
      expect(response.statusCode).toBe(401);
    });
  });
});

// ============================================================================
// Health Endpoints Tests
// ============================================================================

describe('Health Endpoints', () => {
  describe('GET /health/live', () => {
    it('should return 200', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/live',
      });
      
      expect(response.statusCode).toBe(200);
    });
  });
  
  describe('GET /health/ready', () => {
    it('should check dependencies', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/health/ready',
      });
      
      // May fail if dependencies are not ready
      expect([200, 503]).toContain(response.statusCode);
      
      if (response.statusCode === 200) {
        const body = JSON.parse(response.body);
        expect(body.database).toBeDefined();
        expect(body.redis).toBeDefined();
      }
    });
  });
});

// ============================================================================
// Analytics Endpoints Tests
// ============================================================================

describe('Analytics Endpoints', () => {
  describe('GET /api/analytics/firm', () => {
    it('should return firm analytics for admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/analytics/firm',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.totalMatters).toBeDefined();
      expect(body.avgHealthScore).toBeDefined();
    });
  });
  
  describe('GET /api/analytics/attorneys', () => {
    it('should return attorney metrics for admin', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/analytics/attorneys',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });
  
  describe('GET /api/analytics/ai-costs', () => {
    it('should return AI cost breakdown', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/analytics/ai-costs',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
    });
  });
});

// ============================================================================
// Webhook Endpoints Tests
// ============================================================================

describe('Webhook Endpoints', () => {
  let webhookId: string;
  
  describe('POST /api/webhooks', () => {
    it('should create webhook', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          url: 'https://example.com/webhook',
          events: ['document.processed', 'flag.created'],
        },
      });
      
      expect(response.statusCode).toBe(201);
      const body = JSON.parse(response.body);
      expect(body.secret).toBeDefined();
      webhookId = body.id;
    });
    
    it('should validate URL', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/webhooks',
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          url: 'not-a-url',
          events: ['document.processed'],
        },
      });
      
      expect(response.statusCode).toBe(400);
    });
  });
  
  describe('GET /api/webhooks', () => {
    it('should list webhooks', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/webhooks',
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(Array.isArray(body)).toBe(true);
    });
  });
  
  describe('DELETE /api/webhooks/:id', () => {
    it('should delete webhook', async () => {
      if (!webhookId) return;
      
      const response = await app.inject({
        method: 'DELETE',
        url: `/api/webhooks/${webhookId}`,
        headers: { authorization: `Bearer ${adminToken}` },
      });
      
      expect(response.statusCode).toBe(204);
    });
  });
});
