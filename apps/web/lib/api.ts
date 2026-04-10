/**
 * EvidentIS API Client
 * Type-safe API client with automatic token refresh
 */

import type {
  Attorney,
  Matter,
  Document,
  Clause,
  Flag,
  Obligation,
  Playbook,
  LoginResponse,
  PaginatedResponse,
  RiskLevel,
} from "@evidentis/shared";

// API base URL
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

// Token storage
let accessToken: string | null = null;
let refreshToken: string | null = null;

/**
 * Set tokens after login
 */
export function setTokens(access: string, refresh: string): void {
  accessToken = access;
  refreshToken = refresh;
  // Store in localStorage for persistence
  if (typeof window !== "undefined") {
    localStorage.setItem("evidentis_access_token", access);
    localStorage.setItem("evidentis_refresh_token", refresh);
  }
}

/**
 * Load tokens from localStorage
 */
export function loadTokens(): void {
  if (typeof window !== "undefined") {
    accessToken = localStorage.getItem("evidentis_access_token");
    refreshToken = localStorage.getItem("evidentis_refresh_token");
  }
}

/**
 * Clear tokens on logout
 */
export function clearTokens(): void {
  accessToken = null;
  refreshToken = null;
  if (typeof window !== "undefined") {
    localStorage.removeItem("evidentis_access_token");
    localStorage.removeItem("evidentis_refresh_token");
  }
}

/**
 * Get current access token
 */
export function getAccessToken(): string | null {
  return accessToken;
}

/**
 * API error class
 */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Refresh access token using refresh token
 */
async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;

  try {
    const response = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      setTokens(data.accessToken, data.refreshToken);
      return true;
    }
  } catch {
    // Refresh failed
  }

  clearTokens();
  return false;
}

/**
 * Make authenticated API request
 */
async function apiRequest<T>(
  method: string,
  path: string,
  body?: unknown,
  options?: RequestInit
): Promise<T> {
  loadTokens();

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options?.headers || {}),
  };

  if (accessToken) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
  }

  let response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    ...options,
  });

  // Token expired - try refresh
  if (response.status === 401 && refreshToken) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${accessToken}`;
      response = await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        ...options,
      });
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Request failed" }));
    throw new ApiError(response.status, error.code || "ERROR", error.message);
  }

  // Handle empty responses
  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return response.json();
  }

  return {} as T;
}

// ============================================================================
// Auth API
// ============================================================================

export const auth = {
  async login(email: string, password: string): Promise<LoginResponse> {
    const data = await apiRequest<LoginResponse>("POST", "/auth/login", {
      email,
      password,
    });
    if (data.accessToken && data.refreshToken) {
      setTokens(data.accessToken, data.refreshToken);
    }
    return data;
  },

  async logout(): Promise<void> {
    try {
      await apiRequest("POST", "/auth/logout");
    } finally {
      clearTokens();
    }
  },

  async me(): Promise<Attorney> {
    return apiRequest<Attorney>("GET", "/auth/me");
  },

  async forgotPassword(email: string): Promise<void> {
    await apiRequest("POST", "/auth/forgot-password", { email });
  },

  async resetPassword(token: string, password: string): Promise<void> {
    await apiRequest("POST", "/auth/reset-password", { token, password });
  },

  async setupMFA(): Promise<{ secret: string; qrCodeUrl: string }> {
    return apiRequest("POST", "/auth/mfa/setup");
  },

  async verifyMFA(code: string): Promise<void> {
    await apiRequest("POST", "/auth/mfa/verify", { code });
  },

  async disableMFA(code: string): Promise<void> {
    await apiRequest("POST", "/auth/mfa/disable", { code });
  },
};

// ============================================================================
// Matters API
// ============================================================================

export interface MatterFilters {
  status?: "open" | "under_review" | "closed" | "archived";
  search?: string;
  page?: number;
  limit?: number;
}

export interface CreateMatterInput {
  name: string;
  clientName: string;
  description?: string;
  practiceArea?: string;
  jurisdiction?: string;
}

export const matters = {
  async list(filters?: MatterFilters): Promise<PaginatedResponse<Matter>> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.search) params.set("search", filters.search);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.limit) params.set("limit", String(filters.limit));

    return apiRequest("GET", `/matters?${params.toString()}`);
  },

  async get(id: string): Promise<Matter> {
    return apiRequest("GET", `/matters/${id}`);
  },

  async create(input: CreateMatterInput): Promise<Matter> {
    return apiRequest("POST", "/matters", input);
  },

  async update(id: string, input: Partial<CreateMatterInput>): Promise<Matter> {
    return apiRequest("PATCH", `/matters/${id}`, input);
  },

  async delete(id: string): Promise<void> {
    await apiRequest("DELETE", `/matters/${id}`);
  },

  async getAnalytics(id: string): Promise<{
    totalDocuments: number;
    totalClauses: number;
    flagsByRisk: Record<RiskLevel, number>;
    processingQueue: number;
  }> {
    return apiRequest("GET", `/matters/${id}/analytics`);
  },
};

// ============================================================================
// Documents API
// ============================================================================

export interface DocumentFilters {
  status?: string;
  page?: number;
  limit?: number;
}

export const documents = {
  async list(matterId: string, filters?: DocumentFilters): Promise<PaginatedResponse<Document>> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.limit) params.set("limit", String(filters.limit));

    return apiRequest("GET", `/matters/${matterId}/documents?${params.toString()}`);
  },

  async get(matterId: string, documentId: string): Promise<Document> {
    return apiRequest("GET", `/matters/${matterId}/documents/${documentId}`);
  },

  async upload(matterId: string, file: File): Promise<Document> {
    const formData = new FormData();
    formData.append("file", file);

    const headers: HeadersInit = {};
    if (accessToken) {
      headers["Authorization"] = `Bearer ${accessToken}`;
    }

    const response = await fetch(`${API_BASE}/matters/${matterId}/documents`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: "Upload failed" }));
      throw new ApiError(response.status, error.code || "ERROR", error.message);
    }

    return response.json();
  },

  async delete(matterId: string, documentId: string): Promise<void> {
    await apiRequest("DELETE", `/matters/${matterId}/documents/${documentId}`);
  },

  async downloadUrl(matterId: string, documentId: string): Promise<string> {
    const data = await apiRequest<{ url: string }>(
      "GET",
      `/matters/${matterId}/documents/${documentId}/download`
    );
    return data.url;
  },
};

// ============================================================================
// Clauses API
// ============================================================================

export interface ClauseFilters {
  documentId?: string;
  clauseType?: string;
  page?: number;
  limit?: number;
}

export const clauses = {
  async list(matterId: string, filters?: ClauseFilters): Promise<PaginatedResponse<Clause>> {
    const params = new URLSearchParams();
    if (filters?.documentId) params.set("documentId", filters.documentId);
    if (filters?.clauseType) params.set("clauseType", filters.clauseType);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.limit) params.set("limit", String(filters.limit));

    return apiRequest("GET", `/matters/${matterId}/clauses?${params.toString()}`);
  },

  async get(matterId: string, clauseId: string): Promise<Clause> {
    return apiRequest("GET", `/matters/${matterId}/clauses/${clauseId}`);
  },
};

// ============================================================================
// Flags API
// ============================================================================

export interface FlagFilters {
  documentId?: string;
  riskLevel?: RiskLevel;
  status?: "open" | "accepted" | "rejected" | "deferred";
  page?: number;
  limit?: number;
}

export const flags = {
  async list(matterId: string, filters?: FlagFilters): Promise<PaginatedResponse<Flag>> {
    const params = new URLSearchParams();
    if (filters?.documentId) params.set("documentId", filters.documentId);
    if (filters?.riskLevel) params.set("riskLevel", filters.riskLevel);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.limit) params.set("limit", String(filters.limit));

    return apiRequest("GET", `/matters/${matterId}/flags?${params.toString()}`);
  },

  async updateStatus(
    matterId: string,
    flagId: string,
    status: "accepted" | "rejected" | "deferred",
    notes?: string
  ): Promise<Flag> {
    return apiRequest("PATCH", `/matters/${matterId}/flags/${flagId}`, { status, notes });
  },

  async bulkUpdateStatus(
    matterId: string,
    flagIds: string[],
    status: "accepted" | "rejected" | "deferred"
  ): Promise<void> {
    await apiRequest("POST", `/matters/${matterId}/flags/bulk`, { flagIds, status });
  },
};

// ============================================================================
// Obligations API
// ============================================================================

export interface ObligationFilters {
  documentId?: string;
  party?: "client" | "counterparty" | "both";
  status?: "pending" | "completed" | "overdue";
  page?: number;
  limit?: number;
}

export const obligations = {
  async list(matterId: string, filters?: ObligationFilters): Promise<PaginatedResponse<Obligation>> {
    const params = new URLSearchParams();
    if (filters?.documentId) params.set("documentId", filters.documentId);
    if (filters?.party) params.set("party", filters.party);
    if (filters?.status) params.set("status", filters.status);
    if (filters?.page) params.set("page", String(filters.page));
    if (filters?.limit) params.set("limit", String(filters.limit));

    return apiRequest("GET", `/matters/${matterId}/obligations?${params.toString()}`);
  },

  async timeline(matterId: string): Promise<{ obligations: Obligation[] }> {
    return apiRequest("GET", `/api/matters/${matterId}/timeline`);
  },

  async markComplete(matterId: string, obligationId: string): Promise<Obligation> {
    return apiRequest("POST", `/matters/${matterId}/obligations/${obligationId}/complete`);
  },

  async create(matterId: string, data: {
    description: string;
    party: 'client' | 'counterparty' | 'both';
    type: string;
    deadlineDate?: string;
    deadlineText?: string;
  }): Promise<Obligation> {
    return apiRequest("POST", `/matters/${matterId}/obligations`, data);
  },

  async update(matterId: string, obligationId: string, data: Partial<Obligation>): Promise<Obligation> {
    return apiRequest("PATCH", `/matters/${matterId}/obligations/${obligationId}`, data);
  },

  async exportCalendar(matterId: string, obligationId: string): Promise<Response> {
    loadTokens();
    return fetch(`${API_BASE}/matters/${matterId}/obligations/${obligationId}/calendar`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  },
};

// ============================================================================
// Research API
// ============================================================================

export interface ResearchQuery {
  query: string;
  matterId: string;
  documentIds?: string[];
  jurisdiction?: string;
}

export interface ResearchResult {
  answer: string;
  citations: Array<{ source: string; text: string; page?: number }>;
  sources: Array<{ documentId: string; title: string; relevance: number; snippet: string }>;
  confidence: number;
}

export interface ResearchHistoryItem {
  id: string;
  question: string;
  answer: string;
  citations: string;
  sourcesUsed: number;
  createdAt: string;
}

export const research = {
  async query(input: ResearchQuery): Promise<ResearchResult> {
    return apiRequest("POST", "/api/research/query", {
      question: input.query,
      matterId: input.matterId,
    });
  },

  async stream(input: ResearchQuery): Promise<ReadableStream<Uint8Array>> {
    loadTokens();

    const response = await fetch(`${API_BASE}/api/research/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ 
        query: input.query, 
        matterId: input.matterId 
      }),
    });

    if (!response.ok) {
      throw new ApiError(response.status, "ERROR", "Research query failed");
    }

    return response.body!;
  },

  async history(matterId?: string, limit?: number): Promise<{ data: ResearchHistoryItem[] }> {
    const params = new URLSearchParams();
    if (matterId) params.set("matterId", matterId);
    if (limit) params.set("limit", String(limit));
    return apiRequest("GET", `/api/research/history?${params.toString()}`);
  },
};

// ============================================================================
// Playbooks API
// ============================================================================

export const playbooks = {
  async list(): Promise<PaginatedResponse<Playbook>> {
    return apiRequest("GET", "/admin/playbooks");
  },

  async get(id: string): Promise<Playbook> {
    return apiRequest("GET", `/admin/playbooks/${id}`);
  },

  async create(input: Partial<Playbook>): Promise<Playbook> {
    return apiRequest("POST", "/admin/playbooks", input);
  },

  async update(id: string, input: Partial<Playbook>): Promise<Playbook> {
    return apiRequest("PATCH", `/admin/playbooks/${id}`, input);
  },

  async delete(id: string): Promise<void> {
    await apiRequest("DELETE", `/admin/playbooks/${id}`);
  },
};

// ============================================================================
// Analytics API
// ============================================================================

export const analytics = {
  async firmOverview(): Promise<{
    totalMatters: number;
    activeMatters: number;
    totalDocuments: number;
    documentsThisMonth: number;
    flagsResolved: number;
    avgProcessingTime: number;
  }> {
    return apiRequest("GET", "/analytics/overview");
  },

  async attorneyProductivity(): Promise<
    Array<{
      attorneyId: string;
      name: string;
      mattersAssigned: number;
      documentsReviewed: number;
      flagsResolved: number;
    }>
  > {
    return apiRequest("GET", "/analytics/attorneys");
  },

  async riskTrends(days: number = 30): Promise<
    Array<{
      date: string;
      critical: number;
      high: number;
      medium: number;
      low: number;
    }>
  > {
    return apiRequest("GET", `/analytics/risk-trends?days=${days}`);
  },
};
