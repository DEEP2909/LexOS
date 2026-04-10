// EvidentIS Shared Types and Constants
// All shared TypeScript types/interfaces for the monorepo

// ============================================================
// ENUMS & CONSTANTS
// ============================================================

export const PLANS = ['starter', 'growth', 'professional', 'enterprise'] as const;
export type Plan = typeof PLANS[number];

export const SUBSCRIPTION_STATUSES = ['trial', 'active', 'past_due', 'cancelled', 'paused'] as const;
export type SubscriptionStatus = typeof SUBSCRIPTION_STATUSES[number];

export const ATTORNEY_ROLES = ['attorney', 'admin', 'partner', 'paralegal', 'client'] as const;
export type AttorneyRole = typeof ATTORNEY_ROLES[number];

export const ATTORNEY_STATUSES = ['active', 'suspended', 'pending_invite'] as const;
export type AttorneyStatus = typeof ATTORNEY_STATUSES[number];

export const MATTER_TYPES = [
  'ma_transaction',
  'commercial_contract',
  'real_estate',
  'litigation',
  'ip',
  'employment',
  'regulatory'
] as const;
export type MatterType = typeof MATTER_TYPES[number];

export const MATTER_STATUSES = ['open', 'under_review', 'closed', 'archived'] as const;
export type MatterStatus = typeof MATTER_STATUSES[number];

export const PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type Priority = typeof PRIORITIES[number];

export const DOC_TYPES = [
  'contract',
  'amendment',
  'nda',
  'loi',
  'spa',
  'employment_agreement',
  'lease',
  'other'
] as const;
export type DocType = typeof DOC_TYPES[number];

export const INGESTION_STATUSES = ['uploaded', 'scanning', 'processing', 'normalized', 'failed'] as const;
export type IngestionStatus = typeof INGESTION_STATUSES[number];

export const SECURITY_STATUSES = ['pending', 'clean', 'infected', 'quarantined'] as const;
export type SecurityStatus = typeof SECURITY_STATUSES[number];

export const RISK_LEVELS = ['low', 'medium', 'high', 'critical'] as const;
export type RiskLevel = typeof RISK_LEVELS[number];

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected', 'modified'] as const;
export type ReviewStatus = typeof REVIEW_STATUSES[number];

export const FLAG_TYPES = ['playbook_deviation', 'missing_clause', 'contradiction', 'regulatory'] as const;
export type FlagType = typeof FLAG_TYPES[number];

export const FLAG_SEVERITIES = ['info', 'warn', 'critical'] as const;
export type FlagSeverity = typeof FLAG_SEVERITIES[number];

export const FLAG_STATUSES = ['open', 'resolved', 'approved', 'rejected', 'waived'] as const;
export type FlagStatus = typeof FLAG_STATUSES[number];

export const PRACTICE_AREAS = ['ma', 'real_estate', 'commercial', 'employment', 'ip'] as const;
export type PracticeArea = typeof PRACTICE_AREAS[number];

export const OBLIGATION_TYPES = [
  'payment_deadline',
  'notice_period',
  'regulatory_filing',
  'renewal_date',
  'condition_precedent',
  'deliverable',
  'covenant'
] as const;
export type ObligationType = typeof OBLIGATION_TYPES[number];

export const OBLIGATION_STATUSES = ['active', 'completed', 'waived', 'overdue'] as const;
export type ObligationStatus = typeof OBLIGATION_STATUSES[number];

export const JOB_TYPES = [
  'document.scan',
  'document.ingest',
  'clause.extract',
  'risk.assess',
  'obligation.extract',
  'obligation.remind',
  'report.generate'
] as const;
export type JobType = typeof JOB_TYPES[number];

export const JOB_STATUSES = ['pending', 'processing', 'completed', 'failed'] as const;
export type JobStatus = typeof JOB_STATUSES[number];

export const AI_TASK_TYPES = ['ocr', 'embed', 'extract', 'risk', 'research', 'suggest', 'obligation'] as const;
export type AITaskType = typeof AI_TASK_TYPES[number];

export const SSO_PROVIDER_TYPES = ['oidc', 'saml'] as const;
export type SSOProviderType = typeof SSO_PROVIDER_TYPES[number];

// ============================================================
// USA LEGAL CLAUSE TYPES (24 TYPES)
// ============================================================

export const CLAUSE_TYPES = [
  'indemnity',
  'limitation_of_liability',
  'termination_for_convenience',
  'termination_for_cause',
  'governing_law',
  'arbitration',
  'assignment',
  'confidentiality_nda',
  'ip_ownership',
  'ip_license',
  'representations_warranties',
  'change_of_control',
  'non_compete',
  'non_solicitation',
  'force_majeure',
  'payment_terms',
  'data_privacy_ccpa',
  'data_privacy_hipaa',
  'data_privacy_gdpr',
  'export_controls',
  'anti_corruption',
  'insurance',
  'notice_provisions',
  'entire_agreement_merger'
] as const;
export type ClauseType = typeof CLAUSE_TYPES[number];

export const CLAUSE_TYPE_LABELS: Record<ClauseType, string> = {
  indemnity: 'Indemnification',
  limitation_of_liability: 'Limitation of Liability',
  termination_for_convenience: 'Termination for Convenience',
  termination_for_cause: 'Termination for Cause',
  governing_law: 'Governing Law',
  arbitration: 'Arbitration',
  assignment: 'Assignment',
  confidentiality_nda: 'Confidentiality / NDA',
  ip_ownership: 'IP Ownership',
  ip_license: 'IP License',
  representations_warranties: 'Representations & Warranties',
  change_of_control: 'Change of Control',
  non_compete: 'Non-Compete',
  non_solicitation: 'Non-Solicitation',
  force_majeure: 'Force Majeure',
  payment_terms: 'Payment Terms',
  data_privacy_ccpa: 'CCPA Data Privacy',
  data_privacy_hipaa: 'HIPAA Compliance',
  data_privacy_gdpr: 'GDPR Compliance',
  export_controls: 'Export Controls (ITAR/EAR)',
  anti_corruption: 'Anti-Corruption (FCPA)',
  insurance: 'Insurance Requirements',
  notice_provisions: 'Notice Provisions',
  entire_agreement_merger: 'Entire Agreement / Merger'
};

// ============================================================
// US STATES
// ============================================================

export const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC'
] as const;
export type USState = typeof US_STATES[number];

export const US_STATE_NAMES: Record<USState, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California',
  CO: 'Colorado', CT: 'Connecticut', DE: 'Delaware', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa',
  KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri',
  MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey',
  NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio',
  OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island', SC: 'South Carolina',
  SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming',
  DC: 'District of Columbia'
};

// ============================================================
// PASSWORD RULES
// ============================================================

export const PASSWORD_RULES = {
  minLength: 12,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecial: true,
  specialChars: '!@#$%^&*()_+-=[]{}|;:,.<>?'
};

// ============================================================
// INTERFACES
// ============================================================

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  plan: Plan;
  region: string;
  barState: string | null;
  subscriptionStatus: SubscriptionStatus;
  trialEndsAt: Date | null;
  stripeCustomerId: string | null;
  stripeSubscriptionId: string | null;
  logoUrl: string | null;
  settings: Record<string, unknown>;
  createdAt: Date;
}

export interface Attorney {
  id: string;
  tenantId: string;
  email: string;
  displayName: string;
  role: AttorneyRole;
  practiceGroup: string | null;
  barNumber: string | null;
  barState: USState | null;
  mfaEnabled: boolean;
  failedLoginAttempts: number;
  lockedUntil: Date | null;
  lastLoginAt: Date | null;
  preferredLanguage: string;
  status: AttorneyStatus;
  createdAt: Date;
}

export interface Matter {
  id: string;
  tenantId: string;
  matterCode: string;
  matterName: string;
  matterType: MatterType;
  clientName: string;
  counterpartyName: string | null;
  governingLawState: USState | null;
  status: MatterStatus;
  priority: Priority;
  healthScore: number;
  leadAttorneyId: string | null;
  targetCloseDate: Date | null;
  dealValueCents: number | null;
  notes: string | null;
  tags: string[];
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Document {
  id: string;
  tenantId: string;
  matterId: string;
  sourceName: string;
  mimeType: string;
  docType: DocType;
  ingestionStatus: IngestionStatus;
  securityStatus: SecurityStatus;
  fileUri: string | null;
  sha256: string;
  normalizedText: string | null;
  pageCount: number | null;
  wordCount: number | null;
  ocrEngine: string | null;
  ocrConfidence: number | null;
  privilegeScore: number;
  language: string;
  extractionModel: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DocumentChunk {
  id: string;
  tenantId: string;
  documentId: string;
  chunkIndex: number;
  textContent: string;
  pageFrom: number | null;
  pageTo: number | null;
  embedding: number[] | null;
  modelVersion: string;
  createdAt: Date;
}

export interface Clause {
  id: string;
  tenantId: string;
  documentId: string;
  clauseType: ClauseType;
  heading: string | null;
  textExcerpt: string;
  pageFrom: number | null;
  pageTo: number | null;
  riskLevel: RiskLevel;
  confidence: number;
  riskFactors: RiskFactor[];
  extractionModel: string | null;
  reviewerStatus: ReviewStatus;
  reviewerId: string | null;
  reviewedAt: Date | null;
  reviewerNote: string | null;
  createdAt: Date;
}

export interface RiskFactor {
  factor: string;
  severity: RiskLevel;
  description: string;
}

export interface Flag {
  id: string;
  tenantId: string;
  matterId: string;
  documentId: string | null;
  clauseId: string | null;
  flagType: FlagType;
  severity: FlagSeverity;
  reason: string;
  playbookRule: string | null;
  recommendedFix: string | null;
  status: FlagStatus;
  assignedTo: string | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  resolutionNote: string | null;
  assessmentModel: string | null;
  createdAt: Date;
}

export interface Playbook {
  id: string;
  tenantId: string;
  name: string;
  description: string | null;
  practiceArea: PracticeArea | null;
  rules: PlaybookRule[];
  isActive: boolean;
  createdBy: string | null;
  createdAt: Date;
}

export interface PlaybookRule {
  id: string;
  clauseType: ClauseType;
  condition: string;
  severity: FlagSeverity;
  description: string;
}

export interface Obligation {
  id: string;
  tenantId: string;
  matterId: string;
  documentId: string | null;
  clauseId: string | null;
  obligationType: ObligationType;
  party: string | null;
  description: string;
  deadlineDate: Date | null;
  deadlineText: string | null;
  noticeDays: number | null;
  recurrenceRule: string | null;
  status: ObligationStatus;
  assignedTo: string | null;
  notes: string | null;
  createdAt: Date;
}

export interface ClauseSuggestion {
  id: string;
  tenantId: string;
  clauseId: string;
  flagId: string | null;
  suggestedText: string;
  rationale: string;
  riskLevelAfterFix: RiskLevel;
  modelName: string;
  status: 'pending' | 'accepted' | 'rejected';
  acceptedBy: string | null;
  acceptedAt: Date | null;
  createdAt: Date;
}

export interface ResearchHistory {
  id: string;
  tenantId: string;
  matterId: string | null;
  attorneyId: string | null;
  question: string;
  answer: string;
  citations: Citation[];
  modelVersion: string | null;
  tokensUsed: number | null;
  responseTimeMs: number | null;
  createdAt: Date;
}

export interface Citation {
  documentId: string;
  documentName: string;
  pageFrom: number;
  pageTo: number;
  excerpt: string;
  relevanceScore: number;
}

export interface AuditEvent {
  id: string;
  tenantId: string;
  actorAttorneyId: string | null;
  actorApiKeyId: string | null;
  eventType: string;
  objectType: string | null;
  objectId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface WorkflowJob {
  id: string;
  tenantId: string | null;
  jobType: JobType;
  status: JobStatus;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  attempts: number;
  maxAttempts: number;
  errorMessage: string | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
}

// ============================================================
// API REQUEST/RESPONSE TYPES
// ============================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface LoginRequest {
  email: string;
  password: string;
  mfaCode?: string;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken?: string;
  mfaRequired?: boolean;
  mfaSessionToken?: string;
  attorney: Omit<Attorney, 'passwordHash'>;
}

export interface MatterCreateRequest {
  matterCode: string;
  matterName: string;
  matterType: MatterType;
  clientName: string;
  counterpartyName?: string;
  governingLawState?: USState;
  priority?: Priority;
  leadAttorneyId?: string;
  targetCloseDate?: string;
  dealValueCents?: number;
  notes?: string;
  tags?: string[];
}

export interface DocumentUploadResponse {
  id: string;
  sourceName: string;
  ingestionStatus: IngestionStatus;
  securityStatus: SecurityStatus;
}

export interface ResearchQueryRequest {
  question: string;
  matterId?: string;
  maxResults?: number;
}

export interface ResearchQueryResponse {
  id: string;
  answer: string;
  citations: Citation[];
  tokensUsed: number;
  responseTimeMs: number;
}

// ============================================================
// WEBSOCKET EVENT TYPES
// ============================================================

export interface WSDocumentStatusEvent {
  type: 'document.status';
  documentId: string;
  status: IngestionStatus;
  tenantId: string;
}

export interface WSFlagCreatedEvent {
  type: 'flag.created';
  matterId: string;
  flagId: string;
  severity: FlagSeverity;
  tenantId: string;
}

export interface WSResearchCompleteEvent {
  type: 'research.complete';
  queryId: string;
  answer: string;
  citations: Citation[];
  tenantId: string;
}

export type WSEvent = WSDocumentStatusEvent | WSFlagCreatedEvent | WSResearchCompleteEvent;

// ============================================================
// MIME TYPES
// ============================================================

export const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/tiff'
] as const;
export type AllowedMimeType = typeof ALLOWED_MIME_TYPES[number];

export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_BATCH_SIZE_BYTES = 200 * 1024 * 1024; // 200MB

// ============================================================
// RATE LIMITS
// ============================================================

export const RATE_LIMITS = {
  auth: { requests: 10, windowMinutes: 15 },
  upload: { requests: 20, windowMinutes: 60 },
  research: { requests: 100, windowMinutes: 60 },
  general: { requests: 1000, windowMinutes: 60 }
} as const;
