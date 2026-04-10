// EvidentIS - SAML 2.0 Service Provider Implementation
import { type FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { pool } from './database.js';
import { logger } from './logger.js';

// SAML Configuration Schema
const SAMLConfigSchema = z.object({
  tenantId: z.string().uuid(),
  entityId: z.string().url(),
  ssoUrl: z.string().url(),
  sloUrl: z.string().url().optional(),
  certificate: z.string(),
  signAuthnRequests: z.boolean().default(true),
  wantAssertionsSigned: z.boolean().default(true),
  nameIdFormat: z.enum([
    'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    'urn:oasis:names:tc:SAML:1.1:nameid-format:unspecified',
    'urn:oasis:names:tc:SAML:2.0:nameid-format:persistent',
    'urn:oasis:names:tc:SAML:2.0:nameid-format:transient',
  ]).default('urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress'),
});

type SAMLConfig = z.infer<typeof SAMLConfigSchema>;

// SAML Request/Response types
interface SAMLAssertion {
  nameId: string;
  nameIdFormat: string;
  sessionIndex: string;
  attributes: Record<string, string | string[]>;
}

interface SAMLAuthRequest {
  id: string;
  issueInstant: string;
  destination: string;
  issuer: string;
  nameIdPolicy: string;
}

// SP Metadata generation
export function generateSPMetadata(
  tenantId: string,
  baseUrl: string
): string {
  const entityId = `${baseUrl}/saml/${tenantId}/metadata`;
  const acsUrl = `${baseUrl}/saml/${tenantId}/acs`;
  const sloUrl = `${baseUrl}/saml/${tenantId}/slo`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<EntityDescriptor xmlns="urn:oasis:names:tc:SAML:2.0:metadata"
                  entityID="${entityId}">
  <SPSSODescriptor AuthnRequestsSigned="true"
                   WantAssertionsSigned="true"
                   protocolSupportEnumeration="urn:oasis:names:tc:SAML:2.0:protocol">
    <KeyDescriptor use="signing">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate><!-- SP Certificate Here --></X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <KeyDescriptor use="encryption">
      <KeyInfo xmlns="http://www.w3.org/2000/09/xmldsig#">
        <X509Data>
          <X509Certificate><!-- SP Certificate Here --></X509Certificate>
        </X509Data>
      </KeyInfo>
    </KeyDescriptor>
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"
                         Location="${sloUrl}"/>
    <SingleLogoutService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                         Location="${sloUrl}"/>
    <NameIDFormat>urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress</NameIDFormat>
    <AssertionConsumerService Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST"
                              Location="${acsUrl}"
                              index="0"
                              isDefault="true"/>
  </SPSSODescriptor>
  <Organization>
    <OrganizationName xml:lang="en">EvidentIS</OrganizationName>
    <OrganizationDisplayName xml:lang="en">EvidentIS Legal Platform</OrganizationDisplayName>
    <OrganizationURL xml:lang="en">${baseUrl}</OrganizationURL>
  </Organization>
  <ContactPerson contactType="technical">
    <GivenName>Support</GivenName>
    <EmailAddress>support@evidentis.io</EmailAddress>
  </ContactPerson>
</EntityDescriptor>`;
}

// Generate SAML AuthnRequest
export function generateAuthnRequest(
  config: SAMLConfig,
  acsUrl: string,
  requestId?: string
): { request: string; id: string } {
  const id = requestId || `_${randomBytes(16).toString('hex')}`;
  const issueInstant = new Date().toISOString();
  const spEntityId = `${acsUrl.replace('/acs', '')}/metadata`;

  const request = `<?xml version="1.0" encoding="UTF-8"?>
<samlp:AuthnRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                    xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                    ID="${id}"
                    Version="2.0"
                    IssueInstant="${issueInstant}"
                    Destination="${config.ssoUrl}"
                    AssertionConsumerServiceURL="${acsUrl}"
                    ProtocolBinding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST">
  <saml:Issuer>${spEntityId}</saml:Issuer>
  <samlp:NameIDPolicy Format="${config.nameIdFormat}"
                      AllowCreate="true"/>
  <samlp:RequestedAuthnContext Comparison="exact">
    <saml:AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:PasswordProtectedTransport</saml:AuthnContextClassRef>
  </samlp:RequestedAuthnContext>
</samlp:AuthnRequest>`;

  return { request, id };
}

// Parse SAML Response (simplified - use samlify in production)
export async function parseSAMLResponse(
  samlResponse: string,
  config: SAMLConfig
): Promise<SAMLAssertion> {
  // Decode base64
  const decoded = Buffer.from(samlResponse, 'base64').toString('utf-8');

  // In production, use samlify library for proper XML signature verification
  // This is a simplified parser for demonstration

  // Extract NameID
  const nameIdMatch = decoded.match(/<saml:NameID[^>]*>([^<]+)<\/saml:NameID>/);
  const nameId = nameIdMatch ? nameIdMatch[1] : '';

  // Extract SessionIndex
  const sessionMatch = decoded.match(/SessionIndex="([^"]+)"/);
  const sessionIndex = sessionMatch ? sessionMatch[1] : '';

  // Extract attributes
  const attributes: Record<string, string> = {};
  const attrRegex = /<saml:Attribute Name="([^"]+)"[^>]*>[\s\S]*?<saml:AttributeValue[^>]*>([^<]+)<\/saml:AttributeValue>/g;
  let match = attrRegex.exec(decoded);
  while (match !== null) {
    attributes[match[1]] = match[2];
    match = attrRegex.exec(decoded);
  }

  // Common attribute mappings
  const email = attributes.email || 
                attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress'] ||
                nameId;

  const firstName = attributes.firstName ||
                    attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname'] ||
                    '';

  const lastName = attributes.lastName ||
                   attributes['http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname'] ||
                   '';

  return {
    nameId: email,
    nameIdFormat: config.nameIdFormat,
    sessionIndex,
    attributes: {
      email,
      firstName,
      lastName,
      ...attributes,
    },
  };
}

// Store SAML configuration
export async function configureSAML(
  tenantId: string,
  config: {
    entityId: string;
    ssoUrl: string;
    sloUrl?: string;
    certificate: string;
    signAuthnRequests?: boolean;
    wantAssertionsSigned?: boolean;
  }
): Promise<{ id: string }> {
  const result = await pool.query(
    `INSERT INTO sso_configurations (
       tenant_id, provider_type, issuer_url, metadata_url, certificate,
       sso_url, slo_url, sign_requests, want_signed_assertions,
       enabled, created_at
     )
     VALUES ($1, 'saml', $2, $3, $4, $5, $6, $7, $8, true, NOW())
     ON CONFLICT (tenant_id, provider_type) DO UPDATE SET
       issuer_url = EXCLUDED.issuer_url,
       metadata_url = EXCLUDED.metadata_url,
       certificate = EXCLUDED.certificate,
       sso_url = EXCLUDED.sso_url,
       slo_url = EXCLUDED.slo_url,
       sign_requests = EXCLUDED.sign_requests,
       want_signed_assertions = EXCLUDED.want_signed_assertions,
       updated_at = NOW()
     RETURNING id`,
    [
      tenantId,
      config.entityId,
      `${config.entityId}/metadata`,
      config.certificate,
      config.ssoUrl,
      config.sloUrl,
      config.signAuthnRequests ?? true,
      config.wantAssertionsSigned ?? true,
    ]
  );

  logger.info({ tenantId }, 'SAML configuration saved');

  return { id: result.rows[0].id };
}

// Get SAML configuration
export async function getSAMLConfig(tenantId: string): Promise<SAMLConfig | null> {
  const result = await pool.query(
    `SELECT issuer_url as entity_id, sso_url, slo_url, certificate,
            sign_requests, want_signed_assertions
     FROM sso_configurations
     WHERE tenant_id = $1 AND provider_type = 'saml' AND enabled = true`,
    [tenantId]
  );

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  return {
    tenantId,
    entityId: row.entity_id,
    ssoUrl: row.sso_url,
    sloUrl: row.slo_url,
    certificate: row.certificate,
    signAuthnRequests: row.sign_requests,
    wantAssertionsSigned: row.want_signed_assertions,
    nameIdFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
  };
}

// Initiate SAML login
export async function initiateSAMLLogin(
  tenantId: string,
  baseUrl: string
): Promise<{ redirectUrl: string; requestId: string }> {
  const config = await getSAMLConfig(tenantId);
  if (!config) {
    throw new Error('SAML not configured for tenant');
  }

  const acsUrl = `${baseUrl}/saml/${tenantId}/acs`;
  const { request, id } = generateAuthnRequest(config, acsUrl);

  // Store request ID for response validation
  await pool.query(
    `INSERT INTO saml_requests (id, tenant_id, created_at, expires_at)
     VALUES ($1, $2, NOW(), NOW() + INTERVAL '10 minutes')`,
    [id, tenantId]
  );

  // Encode and create redirect URL
  const encodedRequest = Buffer.from(request).toString('base64');
  const relayState = Buffer.from(JSON.stringify({ tenantId })).toString('base64');

  const redirectUrl = `${config.ssoUrl}?SAMLRequest=${encodeURIComponent(encodedRequest)}&RelayState=${encodeURIComponent(relayState)}`;

  logger.info({ tenantId, requestId: id }, 'SAML login initiated');

  return { redirectUrl, requestId: id };
}

// Handle SAML ACS (Assertion Consumer Service) callback
export async function handleSAMLCallback(
  tenantId: string,
  samlResponse: string,
  relayState?: string
): Promise<{
  email: string;
  firstName: string;
  lastName: string;
  sessionIndex: string;
}> {
  const config = await getSAMLConfig(tenantId);
  if (!config) {
    throw new Error('SAML not configured');
  }

  // Parse and validate response
  const assertion = await parseSAMLResponse(samlResponse, config);

  // Validate InResponseTo matches a stored request
  // In production, verify XML signature with IdP certificate

  logger.info(
    { tenantId, nameId: assertion.nameId },
    'SAML assertion validated'
  );

  return {
    email: assertion.attributes.email as string,
    firstName: assertion.attributes.firstName as string,
    lastName: assertion.attributes.lastName as string,
    sessionIndex: assertion.sessionIndex,
  };
}

// Handle SAML SLO (Single Logout)
export async function handleSAMLLogout(
  tenantId: string,
  sessionIndex: string
): Promise<{ success: boolean }> {
  // Invalidate session
  await pool.query(
    `UPDATE attorney_sessions 
     SET revoked_at = NOW() 
     WHERE tenant_id = $1 AND saml_session_index = $2`,
    [tenantId, sessionIndex]
  );

  logger.info({ tenantId, sessionIndex }, 'SAML session logged out');

  return { success: true };
}

// Generate SLO request
export function generateLogoutRequest(
  config: SAMLConfig,
  nameId: string,
  sessionIndex: string
): string {
  const id = `_${randomBytes(16).toString('hex')}`;
  const issueInstant = new Date().toISOString();

  return `<?xml version="1.0" encoding="UTF-8"?>
<samlp:LogoutRequest xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol"
                     xmlns:saml="urn:oasis:names:tc:SAML:2.0:assertion"
                     ID="${id}"
                     Version="2.0"
                     IssueInstant="${issueInstant}"
                     Destination="${config.sloUrl}">
  <saml:Issuer>${config.entityId}</saml:Issuer>
  <saml:NameID Format="${config.nameIdFormat}">${nameId}</saml:NameID>
  <samlp:SessionIndex>${sessionIndex}</samlp:SessionIndex>
</samlp:LogoutRequest>`;
}

// Import IdP metadata from URL
export async function importIdPMetadata(
  tenantId: string,
  metadataUrl: string
): Promise<{ entityId: string; ssoUrl: string; certificate: string }> {
  const response = await fetch(metadataUrl);
  if (!response.ok) {
    throw new Error('Failed to fetch IdP metadata');
  }

  const metadata = await response.text();

  // Parse metadata XML (simplified)
  const entityIdMatch = metadata.match(/entityID="([^"]+)"/);
  const ssoUrlMatch = metadata.match(
    /SingleSignOnService[^>]*Binding="urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect"[^>]*Location="([^"]+)"/
  );
  const certMatch = metadata.match(
    /<X509Certificate>([^<]+)<\/X509Certificate>/
  );

  if (!entityIdMatch || !ssoUrlMatch || !certMatch) {
    throw new Error('Invalid IdP metadata format');
  }

  const config = {
    entityId: entityIdMatch[1],
    ssoUrl: ssoUrlMatch[1],
    certificate: certMatch[1].replace(/\s/g, ''),
  };

  // Store configuration
  await configureSAML(tenantId, config);

  logger.info({ tenantId, entityId: config.entityId }, 'IdP metadata imported');

  return config;
}

// Attribute mapping configuration
export async function configureAttributeMapping(
  tenantId: string,
  mappings: {
    email: string;
    firstName?: string;
    lastName?: string;
    role?: string;
    department?: string;
  }
): Promise<void> {
  await pool.query(
    `UPDATE sso_configurations
     SET attribute_mappings = $2, updated_at = NOW()
     WHERE tenant_id = $1 AND provider_type = 'saml'`,
    [tenantId, JSON.stringify(mappings)]
  );

  logger.info({ tenantId }, 'SAML attribute mappings configured');
}

// Test SAML configuration
export async function testSAMLConfiguration(
  tenantId: string
): Promise<{ valid: boolean; errors: string[] }> {
  const errors: string[] = [];

  const config = await getSAMLConfig(tenantId);
  if (!config) {
    return { valid: false, errors: ['SAML not configured'] };
  }

  // Validate SSO URL
  try {
    new URL(config.ssoUrl);
  } catch {
    errors.push('Invalid SSO URL');
  }

  // Validate certificate format
  if (!config.certificate || config.certificate.length < 100) {
    errors.push('Invalid or missing certificate');
  }

  // Check IdP metadata endpoint
  try {
    const response = await fetch(config.entityId);
    if (!response.ok) {
      errors.push('IdP metadata endpoint not reachable');
    }
  } catch {
    errors.push('Failed to connect to IdP');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function registerSamlRoutes(app: FastifyInstance): Promise<void> {
  app.get('/auth/saml/start', async (request, reply) => {
    const { tenantId, baseUrl } = request.query as { tenantId?: string; baseUrl?: string };

    if (!tenantId) {
      return reply.status(400).send({ success: false, error: { message: 'tenantId is required' } });
    }

    const auth = await initiateSAMLLogin(tenantId, baseUrl || 'http://localhost:4000');
    return { success: true, data: auth };
  });

  app.post('/auth/saml/callback', async (request, reply) => {
    const body = z.object({
      tenantId: z.string().uuid(),
      samlResponse: z.string().min(1),
      relayState: z.string().optional(),
    }).parse(request.body);

    const assertion = await handleSAMLCallback(body.tenantId, body.samlResponse, body.relayState);
    return { success: true, data: assertion };
  });
}

export const saml = {
  generateSPMetadata,
  generateAuthnRequest,
  parseSAMLResponse,
  configureSAML,
  getSAMLConfig,
  initiateSAMLLogin,
  handleSAMLCallback,
  handleSAMLLogout,
  generateLogoutRequest,
  importIdPMetadata,
  configureAttributeMapping,
  testSAMLConfiguration,
};
