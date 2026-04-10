/**
 * EvidentIS SCIM 2.0 Endpoints
 * Implements RFC 7643 (Core Schema) and RFC 7644 (Protocol)
 * Compatible with Okta and Azure AD SCIM provisioning
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { pool } from './database.js';
import { auditRepo, attorneyRepo } from './repository.js';
import { hashPassword, generateSecureToken } from './security.js';
import { logger } from './logger.js';
import crypto from 'crypto';

// ============================================================================
// SCIM Schemas
// ============================================================================

const SCIMUserSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:schemas:core:2.0:User']),
  userName: z.string().email(),
  name: z.object({
    givenName: z.string().optional(),
    familyName: z.string().optional(),
    formatted: z.string().optional(),
  }).optional(),
  displayName: z.string().optional(),
  emails: z.array(z.object({
    value: z.string().email(),
    type: z.string().optional(),
    primary: z.boolean().optional(),
  })).optional(),
  active: z.boolean().default(true),
  externalId: z.string().optional(),
  'urn:ietf:params:scim:schemas:extension:enterprise:2.0:User': z.object({
    department: z.string().optional(),
    manager: z.object({ value: z.string() }).optional(),
  }).optional(),
});

const SCIMGroupSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:schemas:core:2.0:Group']),
  displayName: z.string(),
  members: z.array(z.object({
    value: z.string(),
    display: z.string().optional(),
  })).optional(),
  externalId: z.string().optional(),
});

const SCIMPatchSchema = z.object({
  schemas: z.array(z.string()),
  Operations: z.array(z.object({
    op: z.enum(['add', 'remove', 'replace']),
    path: z.string().optional(),
    value: z.any().optional(),
  })),
});

// ============================================================================
// SCIM Auth Middleware
// ============================================================================

async function scimAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const authHeader = request.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    reply.code(401).send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Missing or invalid authorization',
      status: '401',
    });
    return;
  }
  
  const token = authHeader.substring(7);
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  
  // Validate SCIM token
  const result = await pool.query(
    `SELECT tenant_id FROM scim_tokens 
     WHERE token_hash = $1 AND status = 'active'`,
    [tokenHash]
  );
  
  if (!result.rows[0]) {
    reply.code(401).send({
      schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
      detail: 'Invalid SCIM token',
      status: '401',
    });
    return;
  }
  
  // Attach tenant ID to request
  (request as any).tenantId = result.rows[0].tenant_id;
  
  // Update last used
  await pool.query(
    `UPDATE scim_tokens SET last_used_at = now() WHERE token_hash = $1`,
    [tokenHash]
  );
}

export const registerScimRoutes = scimRoutes;

// ============================================================================
// SCIM Response Helpers
// ============================================================================

function formatSCIMUser(attorney: any): any {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: attorney.id,
    userName: attorney.email,
    name: {
      formatted: attorney.display_name,
      givenName: attorney.display_name.split(' ')[0],
      familyName: attorney.display_name.split(' ').slice(1).join(' '),
    },
    displayName: attorney.display_name,
    emails: [
      {
        value: attorney.email,
        type: 'work',
        primary: true,
      },
    ],
    active: attorney.status === 'active',
    meta: {
      resourceType: 'User',
      created: attorney.created_at,
      lastModified: attorney.updated_at || attorney.created_at,
      location: `/scim/v2/Users/${attorney.id}`,
    },
  };
}

function formatSCIMGroup(group: any, members: any[]): any {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
    id: group.id,
    displayName: group.name,
    members: members.map(m => ({
      value: m.id,
      display: m.display_name,
    })),
    meta: {
      resourceType: 'Group',
      created: group.created_at,
      lastModified: group.updated_at || group.created_at,
      location: `/scim/v2/Groups/${group.id}`,
    },
  };
}

function formatListResponse(resources: any[], totalResults: number, startIndex: number, itemsPerPage: number): any {
  return {
    schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
    totalResults,
    startIndex,
    itemsPerPage,
    Resources: resources,
  };
}

// ============================================================================
// SCIM Routes
// ============================================================================

export async function scimRoutes(app: FastifyInstance): Promise<void> {
  // Apply auth to all SCIM routes
  app.addHook('onRequest', scimAuth);
  
  // ========================================================================
  // ServiceProviderConfig
  // ========================================================================
  
  app.get('/scim/v2/ServiceProviderConfig', async (request, reply) => {
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig'],
      documentationUri: 'https://evidentis.law/docs/scim',
      patch: { supported: true },
      bulk: {
        supported: false,
        maxOperations: 0,
        maxPayloadSize: 0,
      },
      filter: {
        supported: true,
        maxResults: 100,
      },
      changePassword: { supported: false },
      sort: { supported: false },
      etag: { supported: false },
      authenticationSchemes: [
        {
          type: 'oauthbearertoken',
          name: 'OAuth Bearer Token',
          description: 'Authentication using Bearer token',
          specUri: 'http://www.rfc-editor.org/info/rfc6750',
          primary: true,
        },
      ],
    };
  });
  
  // ========================================================================
  // ResourceTypes
  // ========================================================================
  
  app.get('/scim/v2/ResourceTypes', async (request, reply) => {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'User',
          name: 'User',
          endpoint: '/scim/v2/Users',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:User',
          meta: {
            location: '/scim/v2/ResourceTypes/User',
            resourceType: 'ResourceType',
          },
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:ResourceType'],
          id: 'Group',
          name: 'Group',
          endpoint: '/scim/v2/Groups',
          schema: 'urn:ietf:params:scim:schemas:core:2.0:Group',
          meta: {
            location: '/scim/v2/ResourceTypes/Group',
            resourceType: 'ResourceType',
          },
        },
      ],
    };
  });
  
  // ========================================================================
  // Schemas
  // ========================================================================
  
  app.get('/scim/v2/Schemas', async (request, reply) => {
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: 2,
      Resources: [
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          id: 'urn:ietf:params:scim:schemas:core:2.0:User',
          name: 'User',
          attributes: [
            { name: 'userName', type: 'string', required: true, caseExact: false, mutability: 'readWrite' },
            { name: 'displayName', type: 'string', required: false, caseExact: false, mutability: 'readWrite' },
            { name: 'emails', type: 'complex', required: false, multiValued: true, mutability: 'readWrite' },
            { name: 'active', type: 'boolean', required: false, mutability: 'readWrite' },
          ],
        },
        {
          schemas: ['urn:ietf:params:scim:schemas:core:2.0:Schema'],
          id: 'urn:ietf:params:scim:schemas:core:2.0:Group',
          name: 'Group',
          attributes: [
            { name: 'displayName', type: 'string', required: true, caseExact: false, mutability: 'readWrite' },
            { name: 'members', type: 'complex', required: false, multiValued: true, mutability: 'readWrite' },
          ],
        },
      ],
    };
  });
  
  // ========================================================================
  // Users - List
  // ========================================================================
  
  app.get('/scim/v2/Users', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    const query = request.query as { filter?: string; startIndex?: string; count?: string };
    
    const startIndex = Number.parseInt(query.startIndex || '1');
    const count = Math.min(Number.parseInt(query.count || '100'), 100);
    
    // Parse filter (basic support)
    let whereClause = 'WHERE tenant_id = $1';
    const params: any[] = [tenantId];
    
    if (query.filter) {
      // Support: userName eq "user@example.com"
      const match = query.filter.match(/userName\s+eq\s+"([^"]+)"/i);
      if (match) {
        whereClause += ' AND email = $2';
        params.push(match[1].toLowerCase());
      }
    }
    
    const countResult = await pool.query(
      `SELECT COUNT(*) FROM attorneys ${whereClause}`,
      params
    );
    const totalResults = Number.parseInt(countResult.rows[0].count);
    
    params.push(count, startIndex - 1);
    const result = await pool.query(
      `SELECT id, email, display_name, status, created_at, updated_at 
       FROM attorneys ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    
    const resources = result.rows.map(formatSCIMUser);
    
    return formatListResponse(resources, totalResults, startIndex, resources.length);
  });
  
  // ========================================================================
  // Users - Get
  // ========================================================================
  
  app.get('/scim/v2/Users/:id', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    const { id } = request.params as { id: string };
    
    const result = await pool.query(
      `SELECT id, email, display_name, status, created_at, updated_at 
       FROM attorneys WHERE tenant_id = $1 AND id = $2`,
      [tenantId, id]
    );
    
    if (!result.rows[0]) {
      return reply.code(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: '404',
      });
    }
    
    return formatSCIMUser(result.rows[0]);
  });
  
  // ========================================================================
  // Users - Create
  // ========================================================================
  
  app.post('/scim/v2/Users', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    
    const parsed = SCIMUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: parsed.error.message,
        status: '400',
      });
    }
    
    const data = parsed.data;
    const email = data.userName.toLowerCase();
    
    // Check if user already exists
    const existing = await pool.query(
      `SELECT id FROM attorneys WHERE tenant_id = $1 AND email = $2`,
      [tenantId, email]
    );
    
    if (existing.rows[0]) {
      return reply.code(409).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User already exists',
        status: '409',
      });
    }
    
    const displayName = data.displayName || data.name?.formatted || email.split('@')[0];
    
    // Generate random password (user will need to reset via email)
    const tempPassword = generateSecureToken(32);
    const passwordHash = await hashPassword(tempPassword);
    
    const result = await pool.query(
      `INSERT INTO attorneys (tenant_id, email, display_name, password_hash, status, scim_external_id)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, display_name, status, created_at`,
      [tenantId, email, displayName, passwordHash, data.active ? 'active' : 'suspended', data.externalId]
    );
    
    await auditRepo.create({
      tenantId,
      eventType: 'user.created.scim',
      objectType: 'attorney',
      objectId: result.rows[0].id,
      metadata: { email, externalId: data.externalId },
    });
    
    logger.info({ tenantId, email }, 'SCIM user created');
    
    return reply.code(201).send(formatSCIMUser(result.rows[0]));
  });
  
  // ========================================================================
  // Users - Update (PUT)
  // ========================================================================
  
  app.put('/scim/v2/Users/:id', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    const { id } = request.params as { id: string };
    
    const parsed = SCIMUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: parsed.error.message,
        status: '400',
      });
    }
    
    const data = parsed.data;
    const displayName = data.displayName || data.name?.formatted;
    
    const result = await pool.query(
      `UPDATE attorneys SET 
        display_name = COALESCE($3, display_name),
        status = $4,
        updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, email, display_name, status, created_at, updated_at`,
      [tenantId, id, displayName, data.active ? 'active' : 'suspended']
    );
    
    if (!result.rows[0]) {
      return reply.code(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: '404',
      });
    }
    
    await auditRepo.create({
      tenantId,
      eventType: 'user.updated.scim',
      objectType: 'attorney',
      objectId: id,
    });
    
    return formatSCIMUser(result.rows[0]);
  });
  
  // ========================================================================
  // Users - Patch
  // ========================================================================
  
  app.patch('/scim/v2/Users/:id', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    const { id } = request.params as { id: string };
    
    const parsed = SCIMPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: parsed.error.message,
        status: '400',
      });
    }
    
    const updates: string[] = [];
    const params: any[] = [tenantId, id];
    let paramIndex = 3;
    
    for (const op of parsed.data.Operations) {
      if (op.op === 'replace') {
        if (op.path === 'active' || op.path?.includes('active')) {
          updates.push(`status = $${paramIndex++}`);
          params.push(op.value ? 'active' : 'suspended');
        }
        if (op.path === 'displayName' || op.path?.includes('displayName')) {
          updates.push(`display_name = $${paramIndex++}`);
          params.push(op.value);
        }
      }
    }
    
    if (updates.length === 0) {
      const current = await pool.query(
        `SELECT id, email, display_name, status, created_at FROM attorneys 
         WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );
      if (!current.rows[0]) {
        return reply.code(404).send({
          schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
          detail: 'User not found',
          status: '404',
        });
      }
      return formatSCIMUser(current.rows[0]);
    }
    
    updates.push('updated_at = now()');
    
    const result = await pool.query(
      `UPDATE attorneys SET ${updates.join(', ')}
       WHERE tenant_id = $1 AND id = $2
       RETURNING id, email, display_name, status, created_at, updated_at`,
      params
    );
    
    if (!result.rows[0]) {
      return reply.code(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: '404',
      });
    }
    
    await auditRepo.create({
      tenantId,
      eventType: 'user.patched.scim',
      objectType: 'attorney',
      objectId: id,
    });
    
    return formatSCIMUser(result.rows[0]);
  });
  
  // ========================================================================
  // Users - Delete
  // ========================================================================
  
  app.delete('/scim/v2/Users/:id', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    const { id } = request.params as { id: string };
    
    // Soft delete (suspend) rather than hard delete for compliance
    const result = await pool.query(
      `UPDATE attorneys SET status = 'suspended', updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING id`,
      [tenantId, id]
    );
    
    if (!result.rows[0]) {
      return reply.code(404).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: 'User not found',
        status: '404',
      });
    }
    
    await auditRepo.create({
      tenantId,
      eventType: 'user.deleted.scim',
      objectType: 'attorney',
      objectId: id,
    });
    
    logger.info({ tenantId, userId: id }, 'SCIM user deleted (suspended)');
    
    return reply.code(204).send();
  });
  
  // ========================================================================
  // Groups - List
  // ========================================================================
  
  app.get('/scim/v2/Groups', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    const query = request.query as { startIndex?: string; count?: string };
    
    // EvidentIS uses roles, not explicit groups, but we expose them as SCIM groups
    const roles = ['admin', 'partner', 'attorney', 'paralegal', 'client_portal'];
    
    const resources = roles.map((role, index) => ({
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: role,
      displayName: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
      meta: {
        resourceType: 'Group',
        location: `/scim/v2/Groups/${role}`,
      },
    }));
    
    return formatListResponse(resources, resources.length, 1, resources.length);
  });
  
  // ========================================================================
  // Groups - Get
  // ========================================================================
  
  app.get('/scim/v2/Groups/:id', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    const { id } = request.params as { id: string };
    
    // Get members of this role
    const members = await pool.query(
      `SELECT id, display_name FROM attorneys WHERE tenant_id = $1 AND role = $2`,
      [tenantId, id]
    );
    
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id,
      displayName: id.charAt(0).toUpperCase() + id.slice(1).replace('_', ' '),
      members: members.rows.map((m: { id: string; display_name: string }) => ({
        value: m.id,
        display: m.display_name,
      })),
      meta: {
        resourceType: 'Group',
        location: `/scim/v2/Groups/${id}`,
      },
    };
  });
  
  // ========================================================================
  // Groups - Patch (for adding/removing members)
  // ========================================================================
  
  app.patch('/scim/v2/Groups/:id', async (request, reply) => {
    const tenantId = (request as any).tenantId;
    const { id: role } = request.params as { id: string };
    
    const parsed = SCIMPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        schemas: ['urn:ietf:params:scim:api:messages:2.0:Error'],
        detail: parsed.error.message,
        status: '400',
      });
    }
    
    for (const op of parsed.data.Operations) {
      if (op.path?.includes('members')) {
        if (op.op === 'add' && Array.isArray(op.value)) {
          // Add members to role
          for (const member of op.value) {
            await pool.query(
              `UPDATE attorneys SET role = $3, updated_at = now() WHERE tenant_id = $1 AND id = $2`,
              [tenantId, member.value, role]
            );
          }
        } else if (op.op === 'remove') {
          // Remove members from role (set to default 'attorney')
          const memberMatch = op.path?.match(/members\[value eq "([^"]+)"\]/);
          if (memberMatch) {
            await pool.query(
              `UPDATE attorneys SET role = 'attorney', updated_at = now() WHERE tenant_id = $1 AND id = $2`,
              [tenantId, memberMatch[1]]
            );
          }
        }
      }
    }
    
    // Return updated group
    const members = await pool.query(
      `SELECT id, display_name FROM attorneys WHERE tenant_id = $1 AND role = $2`,
      [tenantId, role]
    );
    
    return {
      schemas: ['urn:ietf:params:scim:schemas:core:2.0:Group'],
      id: role,
      displayName: role.charAt(0).toUpperCase() + role.slice(1).replace('_', ' '),
      members: members.rows.map((m: { id: string; display_name: string }) => ({
        value: m.id,
        display: m.display_name,
      })),
      meta: {
        resourceType: 'Group',
        location: `/scim/v2/Groups/${role}`,
      },
    };
  });
}
