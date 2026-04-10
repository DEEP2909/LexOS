declare module '@evidentis/shared' {
  export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

  export interface Attorney {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    email: string;
    display_name: string;
  }

  export interface Matter {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    governing_law_state?: string | null;
  }

  export interface Document {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    file_uri?: string | null;
    mime_type?: string;
    doc_type?: string;
    normalized_text?: string;
  }

  export interface Clause {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
    clause_type?: string;
    text_excerpt?: string;
    risk_level?: RiskLevel;
  }

  export interface Flag {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
  }

  export interface Obligation {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
  }

  export interface Playbook {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
  }

  export interface AuditEvent {
    [key: string]: unknown;
    id: string;
    tenant_id: string;
  }
}
