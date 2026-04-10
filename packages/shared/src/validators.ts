/**
 * EvidentIS Shared Validators
 * Zod schemas for validation across API and frontend
 */

import { z } from 'zod';

// ============================================================================
// COMMON PATTERNS
// ============================================================================

export const uuidSchema = z.string().uuid();

export const emailSchema = z.string().email().max(255).toLowerCase();

export const passwordSchema = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const slugSchema = z
  .string()
  .min(2)
  .max(63)
  .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, 'Slug must be lowercase alphanumeric with hyphens');

export const phoneSchema = z
  .string()
  .regex(/^\+1[2-9]\d{9}$/, 'Phone must be US format: +1XXXXXXXXXX');

export const urlSchema = z.string().url().max(2048);

export const dateSchema = z.string().datetime();

export const barNumberSchema = z.string().min(3).max(20);

// US State codes
export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
] as const;

export const stateCodeSchema = z.enum(US_STATES);

// ============================================================================
// TENANT SCHEMAS
// ============================================================================

export const tenantPlanSchema = z.enum(['starter', 'growth', 'professional', 'enterprise']);

export const subscriptionStatusSchema = z.enum(['trial', 'active', 'past_due', 'canceled', 'paused']);

export const createTenantSchema = z.object({
  name: z.string().min(2).max(100),
  slug: slugSchema,
  plan: tenantPlanSchema.default('starter'),
  region: z.enum(['us-east-1', 'us-west-2', 'eu-west-1']).default('us-east-1'),
  barState: stateCodeSchema.optional(),
});

export const updateTenantSchema = createTenantSchema.partial();

// ============================================================================
// ATTORNEY (USER) SCHEMAS
// ============================================================================

export const attorneyRoleSchema = z.enum(['attorney', 'admin', 'partner', 'paralegal', 'client']);

export const attorneyStatusSchema = z.enum(['active', 'suspended', 'pending_invite']);

export const createAttorneySchema = z.object({
  email: emailSchema,
  displayName: z.string().min(2).max(100),
  role: attorneyRoleSchema.default('attorney'),
  practiceGroup: z.string().max(50).optional(),
  barNumber: barNumberSchema.optional(),
  barState: stateCodeSchema.optional(),
  password: passwordSchema.optional(),
});

export const updateAttorneySchema = createAttorneySchema.partial().omit({ password: true });

export const inviteAttorneySchema = z.object({
  email: emailSchema,
  role: attorneyRoleSchema.default('attorney'),
  practiceGroup: z.string().max(50).optional(),
});

// ============================================================================
// AUTHENTICATION SCHEMAS
// ============================================================================

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  tenantSlug: slugSchema.optional(),
});

export const mfaVerifySchema = z.object({
  code: z.string().length(6).regex(/^\d{6}$/, 'Code must be 6 digits'),
});

export const mfaRecoverySchema = z.object({
  recoveryCode: z.string().length(10),
});

export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export const passwordResetSchema = z.object({
  token: z.string().min(32),
  newPassword: passwordSchema,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});

// ============================================================================
// MATTER SCHEMAS
// ============================================================================

export const matterTypeSchema = z.enum([
  'ma_transaction',
  'commercial_contract',
  'real_estate',
  'litigation',
  'ip',
  'employment',
  'regulatory',
]);

export const matterStatusSchema = z.enum(['open', 'under_review', 'closed', 'archived']);

export const matterPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);

export const createMatterSchema = z.object({
  matterCode: z.string().min(1).max(50),
  matterName: z.string().min(1).max(200),
  matterType: matterTypeSchema,
  clientName: z.string().min(1).max(200),
  counterpartyName: z.string().max(200).optional(),
  governingLawState: stateCodeSchema.optional(),
  status: matterStatusSchema.default('open'),
  priority: matterPrioritySchema.default('normal'),
  targetCloseDate: z.string().date().optional(),
  dealValueCents: z.number().int().min(0).optional(),
  notes: z.string().max(10000).optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
});

export const updateMatterSchema = createMatterSchema.partial();

export const matterFilterSchema = z.object({
  status: matterStatusSchema.optional(),
  priority: matterPrioritySchema.optional(),
  matterType: matterTypeSchema.optional(),
  clientName: z.string().optional(),
  governingLawState: stateCodeSchema.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: z.enum(['createdAt', 'updatedAt', 'matterName', 'clientName', 'healthScore']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// DOCUMENT SCHEMAS
// ============================================================================

export const docTypeSchema = z.enum([
  'contract',
  'amendment',
  'nda',
  'loi',
  'spa',
  'employment_agreement',
  'lease',
  'other',
]);

export const ingestionStatusSchema = z.enum([
  'uploaded',
  'scanning',
  'processing',
  'normalized',
  'failed',
]);

export const securityStatusSchema = z.enum(['pending', 'clean', 'infected', 'quarantined']);

export const uploadDocumentSchema = z.object({
  matterId: uuidSchema,
  docType: docTypeSchema,
  fileName: z.string().min(1).max(255),
});

export const documentFilterSchema = z.object({
  matterId: uuidSchema.optional(),
  docType: docTypeSchema.optional(),
  ingestionStatus: ingestionStatusSchema.optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ============================================================================
// CLAUSE SCHEMAS
// ============================================================================

export const CLAUSE_TYPES = [
  'indemnification',
  'limitation_of_liability',
  'termination_for_convenience',
  'termination_for_cause',
  'confidentiality',
  'non_compete',
  'non_solicitation',
  'intellectual_property',
  'governing_law',
  'arbitration',
  'jury_waiver',
  'class_action_waiver',
  'force_majeure',
  'assignment',
  'notice_requirements',
  'amendment',
  'severability',
  'entire_agreement',
  'warranty_disclaimer',
  'data_privacy',
  'insurance_requirements',
  'compliance_with_laws',
  'audit_rights',
  'most_favored_nation',
] as const;

export const clauseTypeSchema = z.enum(CLAUSE_TYPES);

export const riskLevelSchema = z.enum(['low', 'medium', 'high', 'critical']);

export const clauseFilterSchema = z.object({
  documentId: uuidSchema.optional(),
  matterId: uuidSchema.optional(),
  clauseType: clauseTypeSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================================================
// FLAG SCHEMAS
// ============================================================================

export const flagStatusSchema = z.enum(['open', 'acknowledged', 'resolved', 'wont_fix']);

export const flagFilterSchema = z.object({
  matterId: uuidSchema.optional(),
  documentId: uuidSchema.optional(),
  clauseId: uuidSchema.optional(),
  riskLevel: riskLevelSchema.optional(),
  status: flagStatusSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const updateFlagSchema = z.object({
  status: flagStatusSchema,
  resolution: z.string().max(1000).optional(),
});

// ============================================================================
// OBLIGATION SCHEMAS
// ============================================================================

export const obligationStatusSchema = z.enum(['pending', 'acknowledged', 'completed', 'overdue', 'waived']);

export const createObligationSchema = z.object({
  matterId: uuidSchema,
  documentId: uuidSchema.optional(),
  clauseId: uuidSchema.optional(),
  description: z.string().min(1).max(2000),
  deadline: z.string().datetime(),
  responsibleParty: z.string().max(200).optional(),
  assignedAttorneyId: uuidSchema.optional(),
});

export const updateObligationSchema = z.object({
  status: obligationStatusSchema.optional(),
  notes: z.string().max(2000).optional(),
  reminderSent: z.boolean().optional(),
});

export const obligationFilterSchema = z.object({
  matterId: uuidSchema.optional(),
  status: obligationStatusSchema.optional(),
  assignedAttorneyId: uuidSchema.optional(),
  dueBefore: z.string().datetime().optional(),
  dueAfter: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================================================
// RESEARCH SCHEMAS
// ============================================================================

export const researchQuerySchema = z.object({
  query: z.string().min(3).max(2000),
  matterId: uuidSchema.optional(),
  docTypes: z.array(docTypeSchema).optional(),
  clauseTypes: z.array(clauseTypeSchema).optional(),
  topK: z.coerce.number().int().min(1).max(50).default(10),
  includeAnswer: z.boolean().default(true),
});

// ============================================================================
// PLAYBOOK SCHEMAS
// ============================================================================

export const playbookRuleCondition = z.enum([
  'missing',
  'exceeds_threshold',
  'below_threshold',
  'contains',
  'not_contains',
  'equals',
  'not_equals',
  'regex_match',
]);

export const createPlaybookRuleSchema = z.object({
  playbookId: uuidSchema,
  ruleId: z.string().min(1).max(50),
  clauseType: clauseTypeSchema,
  condition: playbookRuleCondition,
  conditionValue: z.string().max(500).optional(),
  severity: riskLevelSchema,
  description: z.string().max(1000),
  suggestedLanguage: z.string().max(5000).optional(),
});

export const createPlaybookSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(1000).optional(),
  matterTypes: z.array(matterTypeSchema).min(1),
  isDefault: z.boolean().default(false),
});

// ============================================================================
// WEBHOOK SCHEMAS
// ============================================================================

export const webhookEventType = z.enum([
  'document.uploaded',
  'document.processed',
  'clause.extracted',
  'flag.created',
  'flag.resolved',
  'obligation.created',
  'obligation.due_soon',
  'obligation.overdue',
  'matter.created',
  'matter.closed',
]);

export const createWebhookSchema = z.object({
  url: urlSchema,
  events: z.array(webhookEventType).min(1),
  secret: z.string().min(32).max(256).optional(),
  isActive: z.boolean().default(true),
});

export const updateWebhookSchema = createWebhookSchema.partial();

// ============================================================================
// SCIM SCHEMAS (RFC 7643/7644)
// ============================================================================

export const scimUserSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:schemas:core:2.0:User']),
  userName: emailSchema,
  name: z.object({
    givenName: z.string().max(100).optional(),
    familyName: z.string().max(100).optional(),
    formatted: z.string().max(200).optional(),
  }).optional(),
  emails: z.array(z.object({
    value: emailSchema,
    type: z.string().optional(),
    primary: z.boolean().optional(),
  })).min(1),
  displayName: z.string().max(200).optional(),
  active: z.boolean().default(true),
  externalId: z.string().max(255).optional(),
});

export const scimPatchSchema = z.object({
  schemas: z.array(z.string()).default(['urn:ietf:params:scim:api:messages:2.0:PatchOp']),
  Operations: z.array(z.object({
    op: z.enum(['add', 'remove', 'replace']),
    path: z.string().optional(),
    value: z.any().optional(),
  })),
});

// ============================================================================
// SSO SCHEMAS
// ============================================================================

export const ssoProviderSchema = z.enum(['google', 'microsoft', 'okta', 'saml']);

export const configureSsoSchema = z.object({
  provider: ssoProviderSchema,
  clientId: z.string().min(1).optional(),
  clientSecret: z.string().min(1).optional(),
  domain: z.string().optional(),
  metadataUrl: urlSchema.optional(),
  entityId: z.string().optional(),
  ssoUrl: urlSchema.optional(),
  certificate: z.string().optional(),
});

// ============================================================================
// BILLING SCHEMAS
// ============================================================================

export const billingIntervalSchema = z.enum(['month', 'year']);

export const createCheckoutSchema = z.object({
  plan: tenantPlanSchema,
  interval: billingIntervalSchema.default('month'),
  successUrl: urlSchema,
  cancelUrl: urlSchema,
});

// ============================================================================
// ANALYTICS SCHEMAS
// ============================================================================

export const analyticsTimeRangeSchema = z.object({
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export const analyticsMetricSchema = z.enum([
  'documents_uploaded',
  'documents_processed',
  'clauses_extracted',
  'flags_created',
  'flags_resolved',
  'obligations_tracked',
  'research_queries',
  'avg_health_score',
  'processing_time_ms',
]);

export const analyticsQuerySchema = analyticsTimeRangeSchema.extend({
  metrics: z.array(analyticsMetricSchema).min(1),
  groupBy: z.enum(['day', 'week', 'month']).default('day'),
  matterId: uuidSchema.optional(),
  practiceGroup: z.string().optional(),
});

// ============================================================================
// REDLINE SUGGESTION SCHEMAS
// ============================================================================

export const suggestionStatusSchema = z.enum(['pending', 'accepted', 'rejected']);

export const updateSuggestionSchema = z.object({
  status: suggestionStatusSchema,
});

export const batchUpdateSuggestionsSchema = z.object({
  suggestionIds: z.array(uuidSchema).min(1).max(100),
  status: suggestionStatusSchema,
});

// ============================================================================
// PAGINATION HELPERS
// ============================================================================

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const sortSchema = z.object({
  sortBy: z.string().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// AUDIT LOG SCHEMAS
// ============================================================================

export const auditActionSchema = z.enum([
  'login',
  'logout',
  'login_failed',
  'mfa_enabled',
  'mfa_disabled',
  'password_changed',
  'password_reset',
  'user_created',
  'user_updated',
  'user_deleted',
  'matter_created',
  'matter_updated',
  'matter_deleted',
  'document_uploaded',
  'document_deleted',
  'document_downloaded',
  'clause_reviewed',
  'flag_updated',
  'playbook_updated',
  'settings_changed',
  'billing_updated',
  'api_key_created',
  'api_key_revoked',
]);

export const auditLogFilterSchema = z.object({
  action: auditActionSchema.optional(),
  attorneyId: uuidSchema.optional(),
  resourceType: z.string().optional(),
  resourceId: uuidSchema.optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

// ============================================================================
// TYPE EXPORTS
// ============================================================================

export type TenantPlan = z.infer<typeof tenantPlanSchema>;
export type SubscriptionStatus = z.infer<typeof subscriptionStatusSchema>;
export type CreateTenantInput = z.infer<typeof createTenantSchema>;
export type UpdateTenantInput = z.infer<typeof updateTenantSchema>;

export type AttorneyRole = z.infer<typeof attorneyRoleSchema>;
export type AttorneyStatus = z.infer<typeof attorneyStatusSchema>;
export type CreateAttorneyInput = z.infer<typeof createAttorneySchema>;
export type UpdateAttorneyInput = z.infer<typeof updateAttorneySchema>;
export type InviteAttorneyInput = z.infer<typeof inviteAttorneySchema>;

export type LoginInput = z.infer<typeof loginSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export type MatterType = z.infer<typeof matterTypeSchema>;
export type MatterStatus = z.infer<typeof matterStatusSchema>;
export type MatterPriority = z.infer<typeof matterPrioritySchema>;
export type CreateMatterInput = z.infer<typeof createMatterSchema>;
export type UpdateMatterInput = z.infer<typeof updateMatterSchema>;
export type MatterFilterInput = z.infer<typeof matterFilterSchema>;

export type DocType = z.infer<typeof docTypeSchema>;
export type IngestionStatus = z.infer<typeof ingestionStatusSchema>;
export type SecurityStatus = z.infer<typeof securityStatusSchema>;
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type DocumentFilterInput = z.infer<typeof documentFilterSchema>;

export type ClauseType = z.infer<typeof clauseTypeSchema>;
export type RiskLevel = z.infer<typeof riskLevelSchema>;
export type ClauseFilterInput = z.infer<typeof clauseFilterSchema>;

export type FlagStatus = z.infer<typeof flagStatusSchema>;
export type FlagFilterInput = z.infer<typeof flagFilterSchema>;
export type UpdateFlagInput = z.infer<typeof updateFlagSchema>;

export type ObligationStatus = z.infer<typeof obligationStatusSchema>;
export type CreateObligationInput = z.infer<typeof createObligationSchema>;
export type UpdateObligationInput = z.infer<typeof updateObligationSchema>;
export type ObligationFilterInput = z.infer<typeof obligationFilterSchema>;

export type ResearchQueryInput = z.infer<typeof researchQuerySchema>;

export type PlaybookRuleCondition = z.infer<typeof playbookRuleCondition>;
export type CreatePlaybookRuleInput = z.infer<typeof createPlaybookRuleSchema>;
export type CreatePlaybookInput = z.infer<typeof createPlaybookSchema>;

export type WebhookEventType = z.infer<typeof webhookEventType>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export type ScimUserInput = z.infer<typeof scimUserSchema>;
export type ScimPatchInput = z.infer<typeof scimPatchSchema>;

export type SsoProvider = z.infer<typeof ssoProviderSchema>;
export type ConfigureSsoInput = z.infer<typeof configureSsoSchema>;

export type BillingInterval = z.infer<typeof billingIntervalSchema>;
export type CreateCheckoutInput = z.infer<typeof createCheckoutSchema>;

export type AnalyticsMetric = z.infer<typeof analyticsMetricSchema>;
export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;

export type SuggestionStatus = z.infer<typeof suggestionStatusSchema>;
export type UpdateSuggestionInput = z.infer<typeof updateSuggestionSchema>;
export type BatchUpdateSuggestionsInput = z.infer<typeof batchUpdateSuggestionsSchema>;

export type AuditAction = z.infer<typeof auditActionSchema>;
export type AuditLogFilterInput = z.infer<typeof auditLogFilterSchema>;

export type StateCode = z.infer<typeof stateCodeSchema>;
