# LexOS - Complete Product Documentation

## Enterprise Legal AI Platform - Full Technical & Product Reference

**Version**: 1.0.0  
**Last Updated**: April 8, 2026  
**Classification**: Internal / Partner Documentation

---

# Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Product Overview](#2-product-overview)
3. [Target Market & Use Cases](#3-target-market--use-cases)
4. [Feature Specifications](#4-feature-specifications)
5. [Technical Architecture](#5-technical-architecture)
6. [Database Schema](#6-database-schema)
7. [API Reference](#7-api-reference)
8. [AI/ML Capabilities](#8-aiml-capabilities)
9. [Security & Compliance](#9-security--compliance)
10. [Multi-Tenancy Architecture](#10-multi-tenancy-architecture)
11. [Authentication & Authorization](#11-authentication--authorization)
12. [Billing & Subscription Management](#12-billing--subscription-management)
13. [Frontend Application](#13-frontend-application)
14. [Background Processing](#14-background-processing)
15. [Observability & Monitoring](#15-observability--monitoring)
16. [Testing Strategy](#16-testing-strategy)
17. [Deployment & Infrastructure](#17-deployment--infrastructure)
18. [Legal Domain Knowledge](#18-legal-domain-knowledge)
19. [Integration Capabilities](#19-integration-capabilities)
20. [Performance & Scalability](#20-performance--scalability)
21. [Disaster Recovery](#21-disaster-recovery)
22. [Roadmap & Future Features](#22-roadmap--future-features)
23. [Glossary](#23-glossary)
24. [Appendices](#24-appendices)

---

# 1. Executive Summary

## 1.1 What is LexOS?

LexOS is an enterprise-grade, multi-tenant Legal AI SaaS platform designed specifically for USA-based law firms. It leverages advanced artificial intelligence to automate contract analysis, legal research, risk assessment, and compliance monitoring.

## 1.2 Mission Statement

To empower legal professionals with AI-driven tools that enhance productivity, reduce risk, and deliver superior client outcomes while maintaining the highest standards of security, compliance, and ethical AI use.

## 1.3 Key Value Propositions

| Value | Description | Impact |
|-------|-------------|--------|
| **Time Savings** | Automate 60% of contract review tasks | 40+ hours saved per attorney per month |
| **Risk Reduction** | AI-powered risk identification | 95% clause detection accuracy |
| **Compliance** | Automatic state/federal law compliance | Coverage of 50 states + DC + federal |
| **Cost Efficiency** | Reduce outsourcing and overtime | 30-50% reduction in review costs |

## 1.4 Platform Statistics

- **155+ Files** in the codebase
- **50,000+ Lines of Code**
- **481 Automated Tests**
- **120+ API Endpoints**
- **40+ React Components**
- **26 Database Tables**
- **24 Legal Clause Types**
- **50 States + DC + Federal** law coverage

---

# 2. Product Overview

## 2.1 Core Modules

### 2.1.1 Document Management
- Secure document upload and storage
- Automatic malware scanning (ClamAV)
- OCR for scanned documents
- Version control and audit trail
- External sharing with access controls

### 2.1.2 Contract Intelligence
- Automatic clause extraction (24 types)
- Risk assessment and scoring
- Playbook compliance checking
- AI-powered redline suggestions
- Side-by-side comparison views

### 2.1.3 Legal Research
- Natural language query interface
- Semantic search across all documents
- RAG-powered answer generation
- Citation support and formatting
- Research history and bookmarks

### 2.1.4 Obligation Tracking
- Automatic deadline extraction
- Smart reminder system
- Calendar integration
- Dashboard visualization
- Escalation workflows

### 2.1.5 Matter Management
- Client and matter organization
- Document-to-matter linking
- Team collaboration features
- Activity timeline
- Analytics and reporting

## 2.2 User Roles

| Role | Permissions |
|------|-------------|
| **Super Admin** | Platform administration, all tenants |
| **Tenant Admin** | Firm settings, user management, billing |
| **Partner** | Full matter access, approval authority |
| **Associate** | Standard access, document editing |
| **Paralegal** | Limited access, support functions |
| **Client** | Portal access, view assigned documents |

## 2.3 Subscription Tiers

| Feature | Starter | Growth | Professional | Enterprise |
|---------|---------|--------|--------------|------------|
| **Price** | $299/mo | $899/mo | $2,199/mo | Custom |
| **Attorneys** | 5 | 25 | 100 | Unlimited |
| **Documents/mo** | 100 | 500 | 2,000 | Unlimited |
| **Research/mo** | 200 | 1,000 | 5,000 | Unlimited |
| **AI Model** | Open Source | Hybrid | Premium API | Premium API |
| **SSO/SAML** | ❌ | ✅ | ✅ | ✅ |
| **SCIM** | ❌ | ❌ | ✅ | ✅ |
| **Support** | Email | Priority | Phone | Dedicated CSM |
| **SLA** | 99.5% | 99.9% | 99.95% | 99.99% |

---

# 3. Target Market & Use Cases

## 3.1 Target Customer Profile

### Primary Market
- **Mid-size Law Firms**: 10-200 attorneys
- **Corporate Legal Departments**: In-house counsel teams
- **Legal Operations Teams**: Process optimization focus

### Secondary Market
- **Boutique Firms**: Specialized practice areas
- **Legal Service Providers**: ALSPs, contract review services
- **Compliance Teams**: Regulatory monitoring needs

## 3.2 Use Cases

### Use Case 1: Contract Review Workflow
```
Attorney receives vendor contract
    ↓
Upload to LexOS
    ↓
Automatic malware scan (infected uploads are quarantined and admins are notified)
    ↓
OCR extraction (if scanned)
    ↓
AI clause extraction (24 types)
    ↓
Risk assessment against playbook
    ↓
Attorney reviews AI suggestions
    ↓
Accept/reject redlines
    ↓
Export clean or redlined version
    ↓
Track obligations and deadlines
```

**Time Impact**: 4 hours → 45 minutes (81% reduction)

### Use Case 2: Due Diligence
```
M&A deal initiated
    ↓
Create matter with deal details
    ↓
Bulk upload 200+ contracts
    ↓
Automatic processing pipeline
    ↓
Risk dashboard generated
    ↓
Filter by risk level/clause type
    ↓
Export due diligence report
    ↓
Flag items for negotiation
```

**Time Impact**: 2 weeks → 2 days

### Use Case 3: Legal Research
```
Associate needs precedent
    ↓
Natural language query
    ↓
Semantic search across firm documents
    ↓
AI-generated answer with citations
    ↓
View relevant document excerpts
    ↓
Save to research history
    ↓
Export for memo drafting
```

**Time Impact**: 3 hours → 15 minutes

### Use Case 4: Compliance Monitoring
```
New state privacy law enacted
    ↓
System flags affected contracts
    ↓
Auto-generate compliance checklist
    ↓
Notify responsible attorneys
    ↓
Track remediation progress
    ↓
Generate compliance report
```

---

# 4. Feature Specifications

## 4.1 Document Intelligence

### 4.1.1 Supported File Formats
| Format | Extension | Max Size | OCR Support |
|--------|-----------|----------|-------------|
| PDF | .pdf | 50 MB | ✅ |
| Word | .docx | 50 MB | ❌ |
| Word Legacy | .doc | 50 MB | ❌ |
| Plain Text | .txt | 10 MB | ❌ |
| Images | .png, .jpg, .tiff | 20 MB | ✅ |

### 4.1.2 Processing Pipeline
```
UPLOAD → QUARANTINE → SCAN → INGEST → CHUNK → EMBED → EXTRACT → ASSESS → COMPLETE
   ↓         ↓          ↓       ↓        ↓        ↓         ↓         ↓         ↓
 Store    Isolate   ClamAV   Parse   Split   Vector   Clauses   Risks   Ready
```

### 4.1.3 Malware Scanning
- **Scanner**: ClamAV
- **Update Frequency**: Daily signature updates
- **Quarantine**: Infected files isolated, admin notified
- **Scan Time**: < 5 seconds per document

### 4.1.4 OCR Capabilities
- **Engines**: Tesseract, EasyOCR, PaddleOCR (configurable)
- **Languages**: English (primary), Spanish, French
- **Accuracy**: 95%+ for clean documents
- **Handwriting**: Limited support (best-effort)

### 4.1.5 Text Chunking
- **Strategy**: Semantic chunking with overlap
- **Chunk Size**: 1,000 tokens (configurable)
- **Overlap**: 200 tokens
- **Metadata**: Page numbers, section headers preserved

## 4.2 Clause Extraction

### 4.2.1 Supported Clause Types (24)
```python
ClauseType = Literal[
    # Liability & Risk
    "indemnification",
    "limitation_of_liability",
    "warranty_disclaimer",
    
    # Termination
    "termination_for_convenience",
    "termination_for_cause",
    
    # Confidentiality & IP
    "confidentiality",
    "non_compete",
    "non_solicitation",
    "intellectual_property",
    
    # Dispute Resolution
    "governing_law",
    "arbitration",
    "jury_waiver",
    "class_action_waiver",
    
    # Operational
    "force_majeure",
    "assignment",
    "notice_requirements",
    "amendment",
    "severability",
    "entire_agreement",
    
    # Compliance
    "data_privacy",
    "insurance_requirements",
    "compliance_with_laws",
    "audit_rights",
    
    # Commercial
    "most_favored_nation"
]
```

### 4.2.2 Extraction Output
```json
{
  "clause_id": "uuid",
  "document_id": "uuid",
  "clause_type": "limitation_of_liability",
  "text": "In no event shall either party be liable for indirect, incidental, or consequential damages...",
  "start_page": 12,
  "end_page": 12,
  "start_char": 4521,
  "end_char": 4892,
  "confidence": 0.94,
  "extraction_method": "llm",
  "metadata": {
    "section_title": "12. LIMITATION OF LIABILITY",
    "cross_references": ["section_8", "section_15"]
  }
}
```

### 4.2.3 Extraction Accuracy
| Clause Type | Precision | Recall | F1 Score |
|-------------|-----------|--------|----------|
| Indemnification | 96% | 94% | 95% |
| Limitation of Liability | 95% | 93% | 94% |
| Confidentiality | 97% | 96% | 96.5% |
| Non-Compete | 93% | 91% | 92% |
| Governing Law | 98% | 97% | 97.5% |
| **Overall Average** | **95%** | **93%** | **94%** |

## 4.3 Risk Assessment

### 4.3.1 Risk Levels
| Level | Score Range | Color | Action Required |
|-------|-------------|-------|-----------------|
| Critical | 0.9 - 1.0 | Red | Immediate review |
| High | 0.7 - 0.89 | Orange | Priority review |
| Medium | 0.4 - 0.69 | Yellow | Standard review |
| Low | 0.0 - 0.39 | Green | Optional review |

### 4.3.2 Risk Assessment Output
```json
{
  "document_id": "uuid",
  "overall_risk_score": 0.72,
  "risk_level": "high",
  "findings": [
    {
      "finding_id": "uuid",
      "clause_id": "uuid",
      "clause_type": "limitation_of_liability",
      "risk_score": 0.85,
      "risk_level": "high",
      "issue": "Unlimited liability exposure",
      "reasoning": "The limitation of liability clause does not cap liability, exposing the client to unlimited financial risk in case of breach or negligence claims.",
      "clause_reference": "Section 12.4",
      "recommendation": "Negotiate a liability cap of 12 months' fees or $1M, whichever is greater",
      "confidence": 0.91,
      "legal_citations": [
        "UCC § 2-719",
        "Restatement (Second) of Contracts § 356"
      ]
    }
  ],
  "explainability": {
    "reasoning_chain": [
      "Identified liability clause in Section 12",
      "Analyzed clause for cap presence",
      "No monetary cap found",
      "Compared against playbook standards",
      "Flagged as high risk per firm guidelines"
    ],
    "playbook_rule_id": "liability-cap-required",
    "ai_model": "mistral:7b-instruct",
    "processing_time_ms": 2340
  }
}
```

### 4.3.3 Playbook Compliance

Playbooks define firm-specific standards:

```json
{
  "playbook_id": "uuid",
  "name": "Standard Vendor Agreement",
  "version": "2.1",
  "rules": [
    {
      "rule_id": "liability-cap-required",
      "clause_type": "limitation_of_liability",
      "condition": "cap_present",
      "expected_value": true,
      "severity": "high",
      "message": "Liability must be capped"
    },
    {
      "rule_id": "governing-law-acceptable",
      "clause_type": "governing_law",
      "condition": "state_in",
      "expected_value": ["CA", "NY", "DE", "TX"],
      "severity": "medium",
      "message": "Governing law should be in firm's preferred jurisdictions"
    }
  ]
}
```

## 4.4 Contract Redlining

### 4.4.1 AI Suggestion Types
- **Insert**: Add missing protective language
- **Delete**: Remove unfavorable terms
- **Replace**: Substitute with preferred language
- **Comment**: Flag for attorney attention

### 4.4.2 Suggestion Output
```json
{
  "suggestion_id": "uuid",
  "clause_id": "uuid",
  "suggestion_type": "replace",
  "original_text": "shall be liable for all damages",
  "suggested_text": "shall be liable for direct damages only, not to exceed the total fees paid under this Agreement in the 12 months preceding the claim",
  "reasoning": "Adds liability cap and excludes consequential damages per firm playbook",
  "confidence": 0.88,
  "playbook_rule_id": "liability-cap-required",
  "status": "pending",
  "attorney_action": null,
  "attorney_notes": null
}
```

### 4.4.3 Track Changes Editor
- **Engine**: Tiptap (ProseMirror-based)
- **Features**:
  - Insert/delete tracking
  - Comment threads
  - Suggestion accept/reject
  - Version comparison
  - Export to DOCX with tracked changes

## 4.5 Legal Research

### 4.5.1 Query Processing
```
User Query: "What are our standard liability caps with tech vendors?"
    ↓
Query Embedding (384 dimensions)
    ↓
Vector Search (pgvector, HNSW index)
    ↓
Top-K Chunk Retrieval (k=10)
    ↓
Context Assembly
    ↓
LLM Generation with RAG
    ↓
Citation Extraction
    ↓
Response with Sources
```

### 4.5.2 Search Configuration
| Parameter | Default | Range |
|-----------|---------|-------|
| Top-K Results | 10 | 1-50 |
| Similarity Threshold | 0.7 | 0.5-0.95 |
| Max Context Tokens | 4,000 | 1,000-8,000 |
| Temperature | 0.3 | 0.0-1.0 |

### 4.5.3 Research Output
```json
{
  "query": "What are our standard liability caps with tech vendors?",
  "answer": "Based on your firm's recent vendor agreements, the standard liability cap is typically set at 12 months of fees paid, with a minimum floor of $500,000. Three recent agreements (Microsoft MSA, AWS Enterprise Agreement, Salesforce License) all contain this provision in their limitation of liability sections.",
  "confidence": 0.87,
  "sources": [
    {
      "document_id": "uuid",
      "document_title": "Microsoft MSA 2025",
      "chunk_id": "uuid",
      "relevance_score": 0.94,
      "excerpt": "...liability shall not exceed the greater of (a) fees paid in the preceding 12 months, or (b) $500,000...",
      "page": 15,
      "section": "14.2 Limitation of Liability"
    }
  ],
  "related_queries": [
    "What are the carve-outs from our liability caps?",
    "Do we accept uncapped indemnification?"
  ],
  "ai_disclaimer": "AI-generated response. Requires attorney review before reliance."
}
```

## 4.6 Obligation Tracking

### 4.6.1 Obligation Types
| Type | Description | Examples |
|------|-------------|----------|
| **Deadline** | Fixed date requirement | Payment due date, notice period |
| **Milestone** | Project deliverable | Implementation phases |
| **Renewal** | Contract renewal date | Auto-renewal, opt-out dates |
| **Periodic** | Recurring obligation | Quarterly reports, annual audits |
| **Conditional** | Event-triggered | Upon termination, upon breach |

### 4.6.2 Reminder Configuration
```json
{
  "obligation_id": "uuid",
  "title": "Contract Renewal Decision",
  "due_date": "2026-12-01",
  "obligation_type": "renewal",
  "reminders": [
    { "days_before": 90, "channels": ["email", "dashboard"] },
    { "days_before": 60, "channels": ["email", "dashboard"] },
    { "days_before": 30, "channels": ["email", "sms", "dashboard"] },
    { "days_before": 7, "channels": ["email", "sms", "dashboard", "escalate"] }
  ],
  "escalation": {
    "enabled": true,
    "escalate_to": "partner_id",
    "days_before": 7
  }
}
```

### 4.6.3 Calendar Integration
- **Supported**: Google Calendar, Outlook/Exchange, Apple Calendar
- **Sync Method**: iCal feed or OAuth2 integration
- **Update Frequency**: Real-time for changes, hourly sync

---

# 5. Technical Architecture

## 5.1 System Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              PRESENTATION LAYER                              │
├─────────────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐             │
│  │    Web App      │  │   Mobile App    │  │   API Clients   │             │
│  │   (Next.js)     │  │    (Future)     │  │   (REST/SDK)    │             │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘             │
└───────────┼────────────────────┼────────────────────┼───────────────────────┘
            │                    │                    │
            └────────────────────┼────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                          API GATEWAY LAYER                                   │
├────────────────────────────────┼────────────────────────────────────────────┤
│                    ┌───────────┴───────────┐                                │
│                    │   Load Balancer       │                                │
│                    │   (nginx / ALB)       │                                │
│                    └───────────┬───────────┘                                │
│                                │                                            │
│  ┌─────────────────────────────┼─────────────────────────────┐              │
│  │                             │                             │              │
│  ▼                             ▼                             ▼              │
│  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐             │
│  │ API Server  │        │ API Server  │        │ API Server  │             │
│  │ (Fastify)   │        │ (Fastify)   │        │ (Fastify)   │             │
│  │ Instance 1  │        │ Instance 2  │        │ Instance N  │             │
│  └──────┬──────┘        └──────┬──────┘        └──────┬──────┘             │
└─────────┼──────────────────────┼──────────────────────┼─────────────────────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                         SERVICE LAYER                                        │
├────────────────────────────────┼────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌───────┴───────┐  ┌──────────────────┐             │
│  │   AI Service     │  │    Redis      │  │   Background     │             │
│  │   (FastAPI)      │  │   (BullMQ)    │  │   Workers        │             │
│  │                  │  │               │  │   (BullMQ)       │             │
│  │  • OCR           │  │  • Job Queue  │  │                  │             │
│  │  • Embedding     │  │  • Cache      │  │  • Document      │             │
│  │  • Extraction    │  │  • Sessions   │  │  • Clause        │             │
│  │  • Assessment    │  │  • PubSub     │  │  • Risk          │             │
│  │  • Research      │  │               │  │  • Obligation    │             │
│  └────────┬─────────┘  └───────────────┘  └────────┬─────────┘             │
│           │                                        │                        │
│           └────────────────────┬───────────────────┘                        │
│                                │                                            │
│                    ┌───────────┴───────────┐                                │
│                    │   Ollama / LLM        │                                │
│                    │   (mistral:7b)        │                                │
│                    └───────────────────────┘                                │
└─────────────────────────────────────────────────────────────────────────────┘
                                 │
┌────────────────────────────────┼────────────────────────────────────────────┐
│                          DATA LAYER                                          │
├────────────────────────────────┼────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌───────┴───────┐  ┌──────────────────┐             │
│  │   PostgreSQL     │  │     S3        │  │   External       │             │
│  │   + pgvector     │  │   Storage     │  │   Services       │             │
│  │                  │  │               │  │                  │             │
│  │  • 26 tables     │  │  • Documents  │  │  • Stripe        │             │
│  │  • HNSW index    │  │  • Quarantine │  │  • SendGrid      │             │
│  │  • Full-text     │  │  • Exports    │  │  • ClamAV        │             │
│  └──────────────────┘  └───────────────┘  └──────────────────┘             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 5.2 Technology Stack

### 5.2.1 Backend API (apps/api)
| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Node.js | 20 LTS |
| Framework | Fastify | 4.x |
| Language | TypeScript | 5.x |
| Validation | Zod | 3.x |
| ORM | Raw SQL + pg | - |
| Auth | JWT (RS256) | - |
| Queue | BullMQ | 5.x |

### 5.2.2 AI Service (apps/ai-service)
| Component | Technology | Version |
|-----------|------------|---------|
| Runtime | Python | 3.11 |
| Framework | FastAPI | 0.109.x |
| Embedding | sentence-transformers | 2.x |
| OCR | Tesseract/EasyOCR/PaddleOCR | - |
| LLM | Ollama | - |
| NLP | spaCy | 3.x |

### 5.2.3 Frontend (apps/web)
| Component | Technology | Version |
|-----------|------------|---------|
| Framework | Next.js | 14.x |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 3.x |
| Components | shadcn/ui | - |
| State | Zustand | 4.x |
| Data Fetching | TanStack Query | 5.x |

### 5.2.4 Infrastructure
| Component | Technology |
|-----------|------------|
| Database | PostgreSQL 16 + pgvector 0.8 |
| Cache/Queue | Redis 7 |
| Object Storage | S3 / MinIO |
| Container Runtime | Docker |
| Orchestration | Kubernetes |
| CI/CD | GitHub Actions |

## 5.3 Data Flow

### 5.3.1 Document Upload Flow
```
1. Client uploads file via multipart/form-data
2. API validates file type and size
3. File stored in S3 quarantine bucket
4. BullMQ job created: document.scan
5. Worker downloads file, scans with ClamAV
6. If clean: move to documents bucket, create ingest job
7. If infected: keep in quarantine, notify admin
8. Ingest job: parse text (PDF/DOCX) or OCR (images)
9. Text chunked with overlap (1000 tokens, 200 overlap)
10. Each chunk embedded via AI service (384-dim vector)
11. Chunks stored in document_chunks with embeddings
12. Clause extraction job created
13. LLM extracts clauses, stores in clauses table
14. Risk assessment job created
15. Each clause assessed against playbook rules
16. Flags created for violations
17. WebSocket notification sent to client
18. Document status: completed
```

### 5.3.2 Research Query Flow
```
1. Client sends POST /research with query
2. Query embedded via AI service
3. Vector similarity search in pgvector
4. Top-K chunks retrieved (default K=10)
5. Chunks filtered by tenant_id
6. Context assembled (up to 4000 tokens)
7. LLM generates answer with RAG prompt
8. Citations extracted from context
9. Response streamed via SSE
10. Query logged in research_history
```

## 5.4 File Structure

```
lexos/
├── .env.example                    # Environment template
├── .github/
│   └── workflows/
│       └── ci.yml                  # CI/CD pipeline
├── docker-compose.yml              # Development environment
├── docker-compose.prod.yml         # Production environment
├── package.json                    # Monorepo root
├── README.md                       # Quick start guide
├── DEPLOYMENT_GUIDE.md             # Cloud deployment guide
├── PRODUCT_DOCUMENTATION.md        # This file
├── claude.md                       # AI assistant context
│
├── apps/
│   ├── api/                        # Fastify REST API
│   │   ├── src/
│   │   │   ├── index.ts            # Server entry point
│   │   │   ├── config.ts           # Environment configuration
│   │   │   ├── routes.ts           # All API endpoints (120+)
│   │   │   ├── auth.ts             # JWT, MFA, sessions
│   │   │   ├── security.ts         # Password hashing, encryption
│   │   │   ├── database.ts         # PostgreSQL connection pool
│   │   │   ├── repository.ts       # Data access layer
│   │   │   ├── billing.ts          # Stripe integration
│   │   │   ├── billing-enforcement.ts  # Quota middleware
│   │   │   ├── worker.ts           # BullMQ job processing
│   │   │   ├── orchestrator.ts     # Document pipeline
│   │   │   ├── audit.ts            # Audit logging
│   │   │   ├── rate-limit.ts       # Redis rate limiting
│   │   │   ├── tenant-isolation.ts # Multi-tenancy middleware
│   │   │   ├── security-hardening.ts  # Helmet, CORS, validation
│   │   │   ├── ai-context.ts       # Document versioning/linking
│   │   │   ├── api-versioning.ts   # API version management
│   │   │   ├── embedding-cache.ts  # Redis embedding cache
│   │   │   ├── tracing.ts          # OpenTelemetry
│   │   │   ├── logger.ts           # Pino logging
│   │   │   ├── storage.ts          # S3 operations
│   │   │   ├── malware.ts          # ClamAV integration
│   │   │   ├── email.ts            # SMTP/SendGrid
│   │   │   ├── legal-rules.ts      # State/federal rules
│   │   │   ├── scim.ts             # SCIM 2.0 provisioning
│   │   │   ├── sso.ts              # OAuth2/OIDC
│   │   │   ├── saml.ts             # SAML 2.0
│   │   │   ├── webauthn.ts         # Passkey/FIDO2
│   │   │   └── websocket.ts        # Socket.io real-time
│   │   ├── tests/                  # API tests (325 tests)
│   │   ├── Dockerfile.api          # Production container
│   │   └── package.json
│   │
│   ├── ai-service/                 # FastAPI AI service
│   │   ├── main.py                 # FastAPI application
│   │   ├── config.py               # Pydantic settings
│   │   ├── domain_models.py        # Legal domain schema
│   │   ├── explainability.py       # AI reasoning chains
│   │   ├── llm_safety.py           # Circuit breaker, retry
│   │   ├── models/
│   │   │   ├── __init__.py
│   │   │   └── loader.py           # Model loading
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── health.py           # Health checks
│   │   │   ├── ocr.py              # OCR processing
│   │   │   ├── embed.py            # Text embedding
│   │   │   ├── extract.py          # Clause extraction
│   │   │   ├── assess.py           # Risk assessment
│   │   │   ├── research.py         # Legal research
│   │   │   ├── suggest.py          # Redline suggestions
│   │   │   └── obligations.py      # Obligation extraction
│   │   ├── prompts/
│   │   │   └── __init__.py         # Prompt templates
│   │   ├── evaluation/
│   │   │   ├── __init__.py
│   │   │   ├── evaluator.py        # Evaluation engine
│   │   │   ├── datasets.py         # Golden datasets
│   │   │   └── scoring.py          # Metrics calculation
│   │   ├── tests/
│   │   │   └── test_ai_service.py  # AI tests (66 tests)
│   │   ├── requirements.txt        # Python dependencies
│   │   └── Dockerfile              # Production container
│   │
│   ├── ai-worker/                  # Celery background workers
│   │   ├── celery_app.py           # Celery configuration
│   │   ├── tasks/
│   │   │   ├── __init__.py
│   │   │   ├── batch_embed.py      # Bulk embedding
│   │   │   ├── report_gen.py       # Report generation
│   │   │   ├── obligation_remind.py # Deadline reminders
│   │   │   ├── cleanup.py          # Data cleanup
│   │   │   └── analytics.py        # Analytics aggregation
│   │   └── Dockerfile
│   │
│   └── web/                        # Next.js frontend
│       ├── app/
│       │   ├── layout.tsx          # Root layout
│       │   ├── page.tsx            # Home redirect
│       │   ├── providers.tsx       # Context providers
│       │   ├── globals.css         # Tailwind base
│       │   ├── login/page.tsx      # Authentication
│       │   ├── forgot-password/page.tsx
│       │   ├── reset-password/[token]/page.tsx
│       │   ├── invitation/[token]/page.tsx
│       │   ├── portal/[shareToken]/page.tsx
│       │   ├── billing/page.tsx
│       │   ├── dashboard/page.tsx
│       │   ├── matters/
│       │   │   ├── page.tsx        # Matter list
│       │   │   └── [id]/
│       │   │       ├── page.tsx    # Matter detail
│       │   │       └── documents/[docId]/page.tsx
│       │   ├── documents/page.tsx
│       │   ├── research/page.tsx
│       │   ├── analytics/page.tsx
│       │   └── admin/page.tsx
│       ├── components/
│       │   ├── ui/                 # shadcn/ui components
│       │   ├── auth/               # Auth components
│       │   ├── shared/             # AiDisclaimer, Skeletons
│       │   ├── documents/          # Document components
│       │   ├── matters/            # Matter components
│       │   ├── redline/            # Redline components
│       │   ├── admin/              # Admin components
│       │   ├── analytics/          # Analytics components
│       │   ├── research/           # Research components
│       │   ├── RedlineEditor.tsx   # Tiptap editor
│       │   └── PDFViewer.tsx       # react-pdf viewer
│       ├── lib/
│       │   ├── api.ts              # API client
│       │   ├── auth.ts             # Auth utilities
│       │   ├── utils.ts            # Helpers
│       │   └── websocket.tsx       # WebSocket provider
│       ├── tests/                  # Frontend tests (90 tests)
│       ├── Dockerfile.web
│       └── package.json
│
├── db/
│   └── migrations/                 # Database migrations
│       ├── 20260101000000_initial-schema.js
│       ├── 20260101000001_auth-tables.js
│       ├── 20260101000002_vector-index.js
│       ├── 20260101000003_add-obligations.js
│       ├── 20260101000004_add-billing.js
│       ├── 20260401000005_add-webauthn.js
│       ├── 20260401000006_add-sso.js
│       ├── 20260401000007_add-scim.js
│       └── 20260401000008_add-analytics.js
│
├── k8s/
│   └── deployment.yaml             # Kubernetes manifests
│
├── config/
│   └── otel-collector-config.yaml  # OpenTelemetry config
│
├── scripts/
│   └── seed.ts                     # Demo data seeding
│
└── packages/
    └── shared/                     # Shared package
        ├── src/
        │   ├── index.ts            # Types, constants
        │   └── validators.ts       # Zod schemas
        └── package.json
```

---

# 6. Database Schema

## 6.1 Entity Relationship Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│    tenants      │     │   attorneys     │     │    matters      │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │────<│ id (PK)         │────<│ id (PK)         │
│ name            │     │ tenant_id (FK)  │     │ tenant_id (FK)  │
│ slug            │     │ email           │     │ title           │
│ plan            │     │ role            │     │ client_name     │
│ stripe_*        │     │ mfa_enabled     │     │ matter_type     │
│ settings        │     │ ...             │     │ status          │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌────────────────────────────────┘
                        │
                        ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   documents     │     │ document_chunks │     │    clauses      │
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │────<│ id (PK)         │     │ id (PK)         │
│ tenant_id (FK)  │     │ document_id(FK) │────>│ document_id(FK) │
│ matter_id (FK)  │     │ chunk_index     │     │ clause_type     │
│ title           │     │ text            │     │ text            │
│ status          │     │ embedding (vec) │     │ confidence      │
│ doc_type        │     │ page_from       │     │ start_page      │
│ file_uri        │     │ page_to         │     │ extraction_method│
└────────┬────────┘     └─────────────────┘     └────────┬────────┘
         │                                               │
         │              ┌────────────────────────────────┘
         │              │
         ▼              ▼
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│     flags       │     │  obligations    │     │clause_suggestions│
├─────────────────┤     ├─────────────────┤     ├─────────────────┤
│ id (PK)         │     │ id (PK)         │     │ id (PK)         │
│ document_id(FK) │     │ document_id(FK) │     │ clause_id (FK)  │
│ clause_id (FK)  │     │ clause_id (FK)  │     │ suggestion_type │
│ severity        │     │ type            │     │ original_text   │
│ description     │     │ due_date        │     │ suggested_text  │
│ playbook_rule_id│     │ status          │     │ reasoning       │
│ ...             │     │ reminder_config │     │ status          │
└─────────────────┘     └─────────────────┘     └─────────────────┘
```

## 6.2 Table Definitions

### 6.2.1 Core Tables

```sql
-- Tenants (Law Firms)
CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    plan VARCHAR(50) DEFAULT 'starter',
    subscription_status VARCHAR(50) DEFAULT 'trialing',
    trial_ends_at TIMESTAMPTZ,
    stripe_customer_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Attorneys (Users)
CREATE TABLE attorneys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    email_verified BOOLEAN DEFAULT FALSE,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(50) NOT NULL DEFAULT 'associate',
    status VARCHAR(50) DEFAULT 'active',
    mfa_enabled BOOLEAN DEFAULT FALSE,
    mfa_secret VARCHAR(255),
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(tenant_id, email)
);

-- Matters (Cases/Projects)
CREATE TABLE matters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    client_name VARCHAR(255),
    client_email VARCHAR(255),
    matter_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'active',
    description TEXT,
    playbook_id UUID REFERENCES playbooks(id),
    assigned_attorney_id UUID REFERENCES attorneys(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Documents
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    matter_id UUID REFERENCES matters(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    original_filename VARCHAR(255),
    file_uri VARCHAR(1024) NOT NULL,
    file_size_bytes BIGINT,
    mime_type VARCHAR(100),
    doc_type VARCHAR(50),
    status VARCHAR(50) DEFAULT 'uploaded',
    processing_error TEXT,
    hash_sha256 VARCHAR(64),
    page_count INTEGER,
    extracted_text TEXT,
    uploaded_by UUID REFERENCES attorneys(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Document Chunks (for vector search)
CREATE TABLE document_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding vector(384),
    page_from INTEGER,
    page_to INTEGER,
    token_count INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- HNSW index for fast similarity search
CREATE INDEX ON document_chunks USING hnsw (embedding vector_cosine_ops);
```

### 6.2.2 AI/Legal Tables

```sql
-- Clauses
CREATE TABLE clauses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    clause_type VARCHAR(100) NOT NULL,
    text TEXT NOT NULL,
    start_page INTEGER,
    end_page INTEGER,
    start_char INTEGER,
    end_char INTEGER,
    confidence DECIMAL(4,3),
    extraction_method VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Flags (Risk Findings)
CREATE TABLE flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    clause_id UUID REFERENCES clauses(id) ON DELETE SET NULL,
    severity VARCHAR(20) NOT NULL,
    risk_score DECIMAL(4,3),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    recommendation TEXT,
    playbook_rule_id UUID REFERENCES playbook_rules(id),
    status VARCHAR(50) DEFAULT 'open',
    resolved_by UUID REFERENCES attorneys(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Obligations
CREATE TABLE obligations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    clause_id UUID REFERENCES clauses(id),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    obligation_type VARCHAR(50) NOT NULL,
    due_date DATE,
    recurring_rule VARCHAR(100),
    status VARCHAR(50) DEFAULT 'pending',
    assigned_to UUID REFERENCES attorneys(id),
    reminder_config JSONB DEFAULT '{}',
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Clause Suggestions
CREATE TABLE clause_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    clause_id UUID NOT NULL REFERENCES clauses(id) ON DELETE CASCADE,
    suggestion_type VARCHAR(50) NOT NULL,
    original_text TEXT,
    suggested_text TEXT,
    reasoning TEXT,
    confidence DECIMAL(4,3),
    playbook_rule_id UUID REFERENCES playbook_rules(id),
    status VARCHAR(50) DEFAULT 'pending',
    reviewed_by UUID REFERENCES attorneys(id),
    reviewed_at TIMESTAMPTZ,
    attorney_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playbooks
CREATE TABLE playbooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(20) DEFAULT '1.0',
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Playbook Rules
CREATE TABLE playbook_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    playbook_id UUID NOT NULL REFERENCES playbooks(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    clause_type VARCHAR(100) NOT NULL,
    condition_type VARCHAR(50) NOT NULL,
    condition_value JSONB NOT NULL,
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    suggestion_template TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6.2.3 Auth & Security Tables

```sql
-- Refresh Tokens
CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attorney_id UUID NOT NULL REFERENCES attorneys(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    device_info JSONB,
    ip_address INET,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- MFA Enrollments
CREATE TABLE mfa_enrollments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attorney_id UUID NOT NULL REFERENCES attorneys(id) ON DELETE CASCADE,
    method VARCHAR(50) NOT NULL,
    secret VARCHAR(255),
    phone_number VARCHAR(20),
    is_verified BOOLEAN DEFAULT FALSE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Passkeys (WebAuthn)
CREATE TABLE passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    attorney_id UUID NOT NULL REFERENCES attorneys(id) ON DELETE CASCADE,
    credential_id BYTEA NOT NULL UNIQUE,
    public_key BYTEA NOT NULL,
    counter INTEGER DEFAULT 0,
    device_type VARCHAR(50),
    name VARCHAR(100),
    last_used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SSO Configurations
CREATE TABLE sso_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL,
    client_id VARCHAR(255),
    client_secret VARCHAR(255),
    issuer_url VARCHAR(1024),
    metadata_url VARCHAR(1024),
    certificate TEXT,
    is_active BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- SCIM Tokens
CREATE TABLE scim_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100),
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Audit Events
CREATE TABLE audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attorney_id UUID REFERENCES attorneys(id),
    event_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50),
    resource_id UUID,
    action VARCHAR(50) NOT NULL,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    request_id VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for audit queries
CREATE INDEX idx_audit_events_tenant_time ON audit_events(tenant_id, created_at DESC);
CREATE INDEX idx_audit_events_resource ON audit_events(resource_type, resource_id);
```

### 6.2.4 Billing & Quota Tables

```sql
-- Tenant AI Quotas
CREATE TABLE tenant_ai_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE UNIQUE,
    monthly_doc_limit INTEGER DEFAULT 100,
    monthly_research_limit INTEGER DEFAULT 500,
    current_month_docs INTEGER DEFAULT 0,
    current_month_research INTEGER DEFAULT 0,
    quota_reset_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- API Keys
CREATE TABLE api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    attorney_id UUID NOT NULL REFERENCES attorneys(id) ON DELETE CASCADE,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(100),
    prefix VARCHAR(10),
    scopes JSONB DEFAULT '["read"]',
    last_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 6.3 Indexes & Performance

```sql
-- Tenant isolation indexes (critical for multi-tenancy)
CREATE INDEX idx_attorneys_tenant ON attorneys(tenant_id);
CREATE INDEX idx_matters_tenant ON matters(tenant_id);
CREATE INDEX idx_documents_tenant ON documents(tenant_id);
CREATE INDEX idx_documents_matter ON documents(matter_id);
CREATE INDEX idx_clauses_document ON clauses(document_id);
CREATE INDEX idx_flags_document ON flags(document_id);
CREATE INDEX idx_obligations_due_date ON obligations(tenant_id, due_date) WHERE status = 'pending';

-- Full-text search
CREATE INDEX idx_documents_title_fts ON documents USING gin(to_tsvector('english', title));
CREATE INDEX idx_document_chunks_text_fts ON document_chunks USING gin(to_tsvector('english', text));

-- Vector similarity (HNSW for pgvector)
CREATE INDEX idx_chunks_embedding_hnsw ON document_chunks 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);
```

---

# 7. API Reference

## 7.1 API Overview

- **Base URL**: `https://api.yourdomain.com`
- **Version**: v1 (via header or path prefix)
- **Format**: JSON
- **Authentication**: Bearer token (JWT)
- **Rate Limiting**: Per-user, per-endpoint

## 7.2 Authentication

### 7.2.1 Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "attorney@firm.com",
  "password": "SecurePassword123!"
}
```

**Response (200 OK)**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbGciOiJSUzI1NiIs...",
    "refreshToken": "eyJhbGciOiJSUzI1NiIs...",
    "expiresIn": 900,
    "attorney": {
      "id": "uuid",
      "email": "attorney@firm.com",
      "firstName": "John",
      "lastName": "Doe",
      "role": "associate",
      "tenantId": "uuid"
    }
  }
}
```

### 7.2.2 Refresh Token
```http
POST /auth/refresh
Content-Type: application/json

{
  "refreshToken": "eyJhbGciOiJSUzI1NiIs..."
}
```

### 7.2.3 MFA Verification
```http
POST /auth/mfa/verify
Content-Type: application/json
Authorization: Bearer <partial-token>

{
  "code": "123456"
}
```

## 7.3 Documents API

### 7.3.1 Upload Document
```http
POST /documents
Content-Type: multipart/form-data
Authorization: Bearer <token>

file: <binary>
matterId: uuid
title: "Vendor Agreement"
```

**Response (201 Created)**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "title": "Vendor Agreement",
    "status": "uploaded",
    "jobId": "uuid",
    "estimatedProcessingTime": 30
  }
}
```

### 7.3.2 Get Document
```http
GET /documents/:id
Authorization: Bearer <token>
```

### 7.3.3 Get Document Analysis
```http
GET /documents/:id/analysis
Authorization: Bearer <token>
```

**Response**:
```json
{
  "success": true,
  "data": {
    "documentId": "uuid",
    "overallRiskScore": 0.72,
    "riskLevel": "high",
    "clauseCount": 18,
    "flagCount": 5,
    "obligationCount": 3,
    "processingTime": 28500,
    "clauses": [...],
    "flags": [...],
    "obligations": [...]
  }
}
```

### 7.3.4 Get Document Clauses
```http
GET /documents/:id/clauses
Authorization: Bearer <token>
```

### 7.3.5 Get Document Suggestions
```http
GET /documents/:id/suggestions
Authorization: Bearer <token>
```

## 7.4 Research API

### 7.4.1 Execute Research Query
```http
POST /api/research/query
Authorization: Bearer <token>
Content-Type: application/json

{
  "question": "What are the standard indemnification terms?",
  "matterId": "uuid"  // optional - scope to specific matter
}

Response:
{
  "success": true,
  "data": {
    "answer": "Based on the documents analyzed...",
    "citations": [
      { "source": "Contract A", "text": "The indemnifying party shall...", "page": 12 }
    ],
    "sources": [
      { "documentId": "uuid", "title": "Master Agreement", "relevance": 0.92, "snippet": "..." }
    ],
    "confidence": 0.87
  }
}
```

### 7.4.2 Stream Research (SSE)
```http
POST /api/research/stream
Authorization: Bearer <token>
Content-Type: application/json

{
  "query": "What are the termination rights?",
  "matterId": "uuid"
}

// Server-Sent Events Response:
data: {"type":"sources","sources":[...]}
data: {"type":"token","content":"Based"}
data: {"type":"token","content":" on"}
data: {"type":"token","content":" the"}
...
data: [DONE]
```

### 7.4.3 Research History
```http
GET /api/research/history?matterId=uuid&limit=20
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "question": "What are the payment terms?",
      "answer": "The contract specifies...",
      "citations": "[...]",
      "sourcesUsed": 15,
      "createdAt": "2026-04-08T10:30:00Z"
    }
  ]
}
```

## 7.5 Matters API

### 7.5.1 List Matters
```http
GET /matters?page=1&limit=20&status=active
Authorization: Bearer <token>
```

### 7.5.2 Create Matter
```http
POST /matters
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "Acme Corp Vendor Agreement Review",
  "clientName": "Acme Corporation",
  "clientEmail": "legal@acme.com",
  "matterType": "contract_review",
  "description": "Review of new vendor master agreement",
  "playbookId": "uuid"
}
```

### 7.5.3 Get Matter with Documents
```http
GET /matters/:id?include=documents,clauses,flags
Authorization: Bearer <token>
```

## 7.6 Obligations API

### 7.6.1 List Obligations
```http
GET /obligations?status=pending&dueBefore=2026-06-01
Authorization: Bearer <token>
```

### 7.6.2 Update Obligation Status
```http
PATCH /obligations/:id/status
Authorization: Bearer <token>
Content-Type: application/json

{
  "status": "completed"
}
```

## 7.7 Admin API

### 7.7.1 List Team Members
```http
GET /admin/attorneys
Authorization: Bearer <token>
X-Required-Role: admin
```

### 7.7.2 Invite Team Member
```http
POST /admin/attorneys/invite
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "newattorney@firm.com",
  "firstName": "Jane",
  "lastName": "Smith",
  "role": "associate"
}
```

### 7.7.3 Update Tenant Settings
```http
PATCH /admin/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "firmName": "Updated Firm Name LLP",
  "defaultPlaybookId": "uuid",
  "notificationPreferences": {...}
}
```

## 7.8 Billing API

### 7.8.1 Get Billing Status
```http
GET /billing/status
Authorization: Bearer <token>
```

### 7.8.2 Create Checkout Session
```http
POST /billing/checkout
Authorization: Bearer <token>
Content-Type: application/json

{
  "plan": "growth",
  "successUrl": "https://app.firm.com/billing/success",
  "cancelUrl": "https://app.firm.com/billing"
}
```

### 7.8.3 Create Customer Portal Session
```http
POST /billing/portal
Authorization: Bearer <token>
```

## 7.9 Error Responses

All errors follow this format:
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {...}
  }
}
```

### Error Codes
| Code | HTTP Status | Description |
|------|-------------|-------------|
| UNAUTHORIZED | 401 | Invalid or missing token |
| FORBIDDEN | 403 | Insufficient permissions |
| NOT_FOUND | 404 | Resource not found |
| VALIDATION_ERROR | 400 | Invalid request data |
| QUOTA_EXCEEDED | 402 | Plan quota exceeded |
| RATE_LIMITED | 429 | Too many requests |
| INTERNAL_ERROR | 500 | Server error |

---

# 8. AI/ML Capabilities

## 8.1 Models Used

### 8.1.1 Embedding Model
- **Model**: all-MiniLM-L6-v2
- **Provider**: sentence-transformers
- **Dimensions**: 384
- **Use Cases**: Document chunking, semantic search

### 8.1.2 LLM (Language Model)
- **Model**: mistral:7b-instruct
- **Provider**: Ollama (local)
- **Context Window**: 8,192 tokens
- **Use Cases**: Clause extraction, risk assessment, suggestions

### 8.1.3 OCR Engine
- **Primary**: PaddleOCR
- **Fallback**: Tesseract, EasyOCR
- **Languages**: English (primary)

### 8.1.4 NLP Pipeline
- **Model**: spaCy en_core_web_trf
- **Use Cases**: Entity extraction, sentence segmentation

## 8.2 Prompt Engineering

All AI routers (`extract`, `assess`, `research`, `suggest`, `obligations`) use centralized prompt templates from `apps/ai-service/prompts/__init__.py`. Structured outputs are validated with `validate_response(...)`, and user-facing research/suggestion text is wrapped with safety guardrails.

### 8.2.1 Clause Extraction Prompt
```python
CLAUSE_EXTRACTION_PROMPT = """
You are a legal contract analyst specializing in USA commercial law.

TASK: Extract all clauses of type "{clause_type}" from the following contract text.

RULES:
1. Extract the EXACT text from the document
2. Include page and character positions
3. Assign a confidence score (0.0-1.0)
4. Only extract clauses that match the specified type

VALID CLAUSE TYPES: {valid_types}

CONTRACT TEXT:
{document_text}

OUTPUT FORMAT (JSON):
{{
  "clauses": [
    {{
      "text": "exact clause text",
      "clause_type": "type",
      "confidence": 0.95,
      "start_page": 1,
      "end_page": 1
    }}
  ]
}}
"""
```

### 8.2.2 Risk Assessment Prompt
```python
RISK_ASSESSMENT_PROMPT = """
You are a senior legal risk analyst at a USA law firm.

TASK: Assess the risk of the following clause for the CLIENT.

CLAUSE TYPE: {clause_type}
CLAUSE TEXT: {clause_text}
CLIENT ROLE: {client_role}
JURISDICTION: {jurisdiction}

PLAYBOOK RULES:
{playbook_rules}

ANALYSIS FRAMEWORK:
1. Identify potential risks to the client
2. Compare against industry standards
3. Check for missing protective provisions
4. Consider jurisdictional implications

OUTPUT FORMAT (JSON):
{{
  "risk_score": 0.75,
  "risk_level": "high",
  "findings": [
    {{
      "issue": "description of issue",
      "reasoning": "detailed legal reasoning",
      "recommendation": "specific suggestion",
      "confidence": 0.85
    }}
  ],
  "reasoning_chain": [
    "step 1 of analysis",
    "step 2 of analysis"
  ]
}}

CRITICAL: Include AI disclaimer that output requires attorney review.
"""
```

## 8.3 AI Safety Guardrails

### 8.3.1 Confidence Thresholds
| Threshold | Action |
|-----------|--------|
| ≥ 0.9 | High confidence, show normally |
| 0.7 - 0.89 | Show with caution indicator |
| 0.5 - 0.69 | Flag for attorney review |
| < 0.5 | Do not display, log for training |

### 8.3.2 Output Validation
```python
def validate_ai_output(response: dict) -> tuple[bool, str]:
    # Check for required fields
    required = ['confidence', 'reasoning']
    for field in required:
        if field not in response:
            return False, f"Missing required field: {field}"
    
    # Confidence must be in valid range
    if not 0 <= response['confidence'] <= 1:
        return False, "Confidence out of range"
    
    # Reasoning must not be empty
    if not response['reasoning'].strip():
        return False, "Empty reasoning"
    
    # Check for hallucination patterns
    if contains_hallucination_patterns(response):
        return False, "Potential hallucination detected"
    
    return True, "Valid"
```

### 8.3.3 Circuit Breaker
```python
class LLMCircuitBreaker:
    def __init__(self, failure_threshold=5, recovery_timeout=60):
        self.failure_count = 0
        self.failure_threshold = failure_threshold
        self.recovery_timeout = recovery_timeout
        self.last_failure_time = None
        self.state = "closed"  # closed, open, half-open
    
    async def call(self, func, *args, **kwargs):
        if self.state == "open":
            if time.time() - self.last_failure_time > self.recovery_timeout:
                self.state = "half-open"
            else:
                raise CircuitBreakerOpenError()
        
        try:
            result = await func(*args, **kwargs)
            self.on_success()
            return result
        except Exception as e:
            self.on_failure()
            raise
```

### 8.3.4 Fallback Strategy
```
Primary: Ollama (mistral:7b-instruct)
    ↓ [Fails 3x]
Fallback 1: Ollama (llama2:7b)
    ↓ [Fails 3x]
Fallback 2: Degraded mode (pattern matching only)
    ↓ [Fails]
Error: Return "Analysis unavailable, manual review required"
```

## 8.4 AI Evaluation Framework

### 8.4.1 Evaluation Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Clause Extraction Accuracy | ≥ 85% | F1 score on golden dataset |
| Risk Assessment Precision | ≥ 80% | True positives / predicted positives |
| Risk Assessment Recall | ≥ 75% | True positives / actual positives |
| Obligation Extraction | ≥ 80% | F1 score on deadline extraction |
| Suggestion Relevance | ≥ 70% | Human evaluation scores |

### 8.4.2 Golden Datasets
Located in `apps/ai-service/evaluation/datasets.py`:
- 500+ annotated clauses
- 200+ labeled risk assessments
- 100+ obligation extraction examples
- 50+ suggestion quality evaluations

### 8.4.3 CI Integration
```yaml
ai-evaluation:
  runs-on: ubuntu-latest
  steps:
    - run: python -m evaluation.evaluator --output results.json
    - run: |
        if score < 0.85; then
          echo "AI quality regression detected"
          exit 1
        fi
```

---

# 9. Security & Compliance

## 9.1 Data Security

### 9.1.1 Encryption
| Data State | Method | Key Management |
|------------|--------|----------------|
| At Rest (DB) | AES-256-GCM | AWS KMS / Vault |
| At Rest (S3) | AES-256 (SSE-KMS) | AWS KMS |
| In Transit | TLS 1.3 | Let's Encrypt / ACM |
| Secrets | AES-256-GCM | APP_ENCRYPTION_KEY |

### 9.1.2 Key Rotation
- **Database Encryption Key**: Annually
- **JWT Signing Keys**: Quarterly
- **API Keys**: User-initiated
- **APP_ENCRYPTION_KEY**: Annually (with re-encryption)

## 9.2 Access Control

### 9.2.1 Authentication Methods
- JWT tokens (RS256 signed)
- Multi-factor authentication (TOTP, SMS, Email)
- WebAuthn/Passkeys (FIDO2)
- SSO (OIDC, OAuth2)
- SAML 2.0

### 9.2.2 Role Permissions
```typescript
const ROLE_PERMISSIONS = {
  super_admin: ['*'],
  admin: [
    'tenant:manage',
    'attorneys:manage',
    'matters:*',
    'documents:*',
    'billing:*',
    'settings:*'
  ],
  partner: [
    'matters:*',
    'documents:*',
    'research:*',
    'playbooks:manage'
  ],
  associate: [
    'matters:read',
    'matters:update',
    'documents:*',
    'research:*'
  ],
  paralegal: [
    'matters:read',
    'documents:read',
    'documents:upload',
    'research:read'
  ],
  client: [
    'portal:access',
    'documents:read:assigned'
  ]
};
```

## 9.3 Compliance

### 9.3.1 SOC 2 Type II Controls
| Control | Implementation |
|---------|---------------|
| Access Control | RBAC, MFA, SSO |
| Audit Logging | All actions logged |
| Encryption | At-rest and in-transit |
| Availability | Multi-AZ deployment |
| Incident Response | Runbook documented |

### 9.3.2 HIPAA Readiness
- PHI access logging
- Encryption of PHI
- Minimum necessary access
- BAA available for enterprise

### 9.3.3 State Bar Ethics
- AI disclaimer on all outputs
- Attorney supervision required
- No unauthorized practice of law
- Confidentiality maintained

## 9.4 Audit Logging

### 9.4.1 Logged Events
| Category | Events |
|----------|--------|
| Authentication | login, logout, mfa_verify, password_reset |
| Documents | upload, view, download, delete, share |
| AI Operations | extraction, assessment, research |
| Admin | user_invite, role_change, settings_update |
| Billing | subscription_change, payment |

### 9.4.2 Log Format
```json
{
  "id": "uuid",
  "timestamp": "2026-04-08T10:30:00Z",
  "tenant_id": "uuid",
  "attorney_id": "uuid",
  "event_type": "document.view",
  "resource_type": "document",
  "resource_id": "uuid",
  "action": "view",
  "ip_address": "192.168.1.1",
  "user_agent": "Mozilla/5.0...",
  "request_id": "req_abc123",
  "metadata": {
    "document_title": "Vendor Agreement"
  }
}
```

### 9.4.3 Retention Policy
- Audit logs: 7 years
- Application logs: 90 days
- Access logs: 1 year
- AI decision logs: 3 years

---

# 10. Multi-Tenancy Architecture

## 10.1 Tenant Isolation

### 10.1.1 Database-Level
```sql
-- Every table has tenant_id
-- Row-Level Security (RLS) policies
CREATE POLICY tenant_isolation ON documents
    FOR ALL
    USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### 10.1.2 Middleware-Level
```typescript
// Tenant isolation middleware
export function enforceTenantIsolation(req, reply) {
  const tenantId = req.tokenPayload.tenantId;
  
  // Validate tenant access
  if (!tenantId) {
    return reply.status(403).send({ error: 'No tenant context' });
  }
  
  // Inject tenant into all queries
  req.tenantId = tenantId;
}

// Scoped query helper
export function createTenantScopedQuery(tenantId: string) {
  return {
    documents: {
      findMany: (filters) => db.documents.findMany({
        where: { tenant_id: tenantId, ...filters }
      })
    }
  };
}
```

### 10.1.3 Storage-Level
```
S3 Bucket Structure:
lexos-documents/
├── {tenant_id_1}/
│   ├── documents/
│   └── exports/
├── {tenant_id_2}/
│   ├── documents/
│   └── exports/
└── ...
```

## 10.2 Tenant Provisioning

### 10.2.1 New Tenant Flow
```
1. Admin creates tenant via API/Admin UI
2. System generates tenant UUID
3. Create tenant record in database
4. Create default playbook
5. Create admin attorney account
6. Send invitation email
7. Set up Stripe customer (if billing enabled)
8. Create S3 folder structure
9. Initialize quota tracking
```

### 10.2.2 SCIM Provisioning
```http
POST /scim/v2/Users
Authorization: Bearer <scim-token>
Content-Type: application/scim+json

{
  "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
  "userName": "jsmith@firm.com",
  "name": {
    "givenName": "John",
    "familyName": "Smith"
  },
  "emails": [{"value": "jsmith@firm.com", "primary": true}],
  "active": true
}
```

## 10.3 Data Isolation Testing

```typescript
describe('Tenant Isolation', () => {
  it('should not return documents from other tenants', async () => {
    // Create document in tenant A
    const docA = await createDocument(tenantA, { title: 'Secret A' });
    
    // Try to access from tenant B
    const result = await api.get(`/documents/${docA.id}`, {
      headers: { Authorization: `Bearer ${tenantBToken}` }
    });
    
    expect(result.status).toBe(404);
  });
  
  it('should not allow cross-tenant queries', async () => {
    const result = await db.query(
      'SELECT * FROM documents WHERE tenant_id = $1',
      [otherTenantId]
    );
    
    // With RLS, this should return empty
    expect(result.rows).toHaveLength(0);
  });
});
```

---

# 11. Authentication & Authorization

## 11.1 JWT Token Structure

### 11.1.1 Access Token (15 minutes)
```json
{
  "header": {
    "alg": "RS256",
    "typ": "JWT"
  },
  "payload": {
    "sub": "attorney-uuid",
    "tid": "tenant-uuid",
    "role": "associate",
    "email": "attorney@firm.com",
    "iat": 1712567890,
    "exp": 1712568790,
    "jti": "unique-token-id"
  }
}
```

### 11.1.2 Refresh Token (7 days)
```json
{
  "sub": "attorney-uuid",
  "tid": "tenant-uuid",
  "type": "refresh",
  "family": "session-family-id",
  "iat": 1712567890,
  "exp": 1713172690,
  "jti": "unique-refresh-id"
}
```

## 11.2 MFA Implementation

### 11.2.1 TOTP Flow
```
1. User enables MFA
2. Generate secret key (RFC 6238)
3. Display QR code for authenticator app
4. User scans and enters verification code
5. Store encrypted secret in mfa_enrollments
6. On login, after password verification:
   - If MFA enabled, return partial token
   - User enters 6-digit code
   - Verify TOTP with 30-second window
   - Issue full access token
```

### 11.2.2 WebAuthn/Passkey Flow
```
1. Registration:
   - Generate challenge
   - Client creates credential
   - Store credential_id and public_key

2. Authentication:
   - Generate challenge
   - Client signs with private key
   - Verify signature with stored public_key
   - Update counter (replay protection)
```

## 11.3 SSO/SAML

### 11.3.1 SAML 2.0 Flow
```
1. User accesses LexOS
2. Redirect to IdP (Okta, Azure AD, etc.)
3. User authenticates at IdP
4. IdP sends SAML assertion to LexOS
5. LexOS validates assertion signature
6. Extract user attributes (email, groups)
7. Create/update attorney record
8. Issue JWT tokens
9. Redirect to application
```

### 11.3.2 Supported Identity Providers
- Okta
- Azure AD / Entra ID
- Google Workspace
- OneLogin
- Ping Identity
- Generic SAML 2.0

---

# 12. Billing & Subscription Management

## 12.1 Stripe Integration

### 12.1.1 Customer Lifecycle
```
1. Trial Start (14 days):
   - Create Stripe customer
   - No payment method required
   - Full access to Starter features

2. Trial End:
   - Notify user at D-7, D-3, D-1
   - If no subscription: downgrade to limited

3. Subscription Active:
   - Webhooks update tenant status
   - Quota limits enforced per plan

4. Payment Failed:
   - Grace period (3 days)
   - Notify account admin
   - If unresolved: pause service

5. Cancellation:
   - Access until period end
   - Data retained 90 days
   - Can reactivate
```

### 12.1.2 Webhook Events Handled
```typescript
const HANDLED_EVENTS = [
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_succeeded',
  'invoice.payment_failed',
  'customer.updated',
];
```

## 12.2 Quota Enforcement

### 12.2.1 Middleware Check
```typescript
export async function enforceDocumentQuota(req, reply) {
  const quota = await checkQuota(req.tenantId, 'document');
  
  if (!quota.allowed) {
    return reply.status(402).send({
      success: false,
      error: {
        code: 'QUOTA_EXCEEDED',
        message: 'Document upload limit reached',
        details: {
          used: quota.limit - quota.remaining,
          limit: quota.limit,
          upgradeUrl: '/billing'
        }
      }
    });
  }
}
```

### 12.2.2 Usage Tracking
```typescript
// After successful document processing
await incrementQuota(tenantId, 'document');

// After research query
await incrementQuota(tenantId, 'research');

// Monthly reset (cron job)
await resetMonthlyQuotas();
```

## 12.3 Plan Features

| Feature | Starter | Growth | Professional | Enterprise |
|---------|---------|--------|--------------|------------|
| Documents/mo | 100 | 500 | 2,000 | Unlimited |
| Research/mo | 200 | 1,000 | 5,000 | Unlimited |
| Attorneys | 5 | 25 | 100 | Unlimited |
| Storage | 10 GB | 50 GB | 200 GB | Unlimited |
| SSO/SAML | ❌ | ✅ | ✅ | ✅ |
| SCIM | ❌ | ❌ | ✅ | ✅ |
| API Access | ❌ | Basic | Full | Full + Webhooks |
| Custom Playbooks | 1 | 5 | 20 | Unlimited |
| Audit Log Retention | 90 days | 1 year | 3 years | 7 years |
| Support | Email | Priority | Phone | Dedicated CSM |
| SLA | 99.5% | 99.9% | 99.95% | 99.99% |

---

# 13. Frontend Application

## 13.1 Application Structure

### 13.1.1 Routes
| Route | Page | Auth Required |
|-------|------|---------------|
| `/` | Redirect to dashboard | ✅ |
| `/login` | Login form | ❌ |
| `/forgot-password` | Password reset request | ❌ |
| `/reset-password/[token]` | Password reset form | ❌ |
| `/invitation/[token]` | Accept invitation | ❌ |
| `/dashboard` | Main dashboard | ✅ |
| `/matters` | Matter list | ✅ |
| `/matters/[id]` | Matter detail (7 tabs) | ✅ |
| `/matters/[id]/documents/[docId]` | Document detail | ✅ |
| `/documents` | All documents | ✅ |
| `/research` | Legal research | ✅ |
| `/analytics` | Analytics dashboard | ✅ |
| `/admin` | Admin settings | ✅ (admin) |
| `/billing` | Subscription management | ✅ (admin) |
| `/portal/[shareToken]` | External document view | Token |

### 13.1.2 State Management
```typescript
// Zustand store for global state
const useAuthStore = create((set) => ({
  attorney: null,
  accessToken: null,
  setAuth: (attorney, token) => set({ attorney, accessToken: token }),
  logout: () => set({ attorney: null, accessToken: null }),
}));

// TanStack Query for server state
const { data: matters } = useQuery({
  queryKey: ['matters', filters],
  queryFn: () => api.get('/matters', { params: filters }),
});
```

## 13.2 Key Components

### 13.2.1 RedlineEditor
- Based on Tiptap (ProseMirror)
- Track changes extension
- Comment threads
- AI suggestion integration
- Export to DOCX

### 13.2.2 PDFViewer
- Based on react-pdf
- Page navigation
- Zoom controls
- Text selection
- Annotation support

### 13.2.3 AiDisclaimer
```tsx
<AiDisclaimer 
  variant="default" // | "compact" | "inline"
  className="mt-4"
/>
// Renders: "⚠️ AI-generated content. Requires attorney review before reliance."
```

## 13.3 Design System

### 13.3.1 Colors
```css
:root {
  --navy: #0A1628;
  --navy-light: #112240;
  --gold: #C9A84C;
  --gold-muted: #B8973E;
  --white: #FFFFFF;
  --gray-100: #F3F4F6;
  --gray-400: #9CA3AF;
  --gray-600: #4B5563;
  --critical: #DC2626;
  --high: #EA580C;
  --medium: #D97706;
  --low: #16A34A;
}
```

### 13.3.2 Typography
- **Headings**: Inter, font-weight 600-700
- **Body**: Inter, font-weight 400
- **Code**: JetBrains Mono

### 13.3.3 Component Library
All components use shadcn/ui:
- Button, Input, Label
- Card, Badge, Dialog
- Table, Tabs, Toast
- Dropdown, Select, Checkbox
- Skeleton, Spinner

---

# 14. Background Processing

## 14.1 BullMQ Architecture

### 14.1.1 Queues
| Queue | Purpose | Concurrency |
|-------|---------|-------------|
| `document` | Document processing | 5 |
| `clause` | Clause extraction | 3 |
| `risk` | Risk assessment | 3 |
| `obligation` | Obligation extraction | 3 |
| `dead-letter` | Failed jobs | 1 |

### 14.1.2 Job Types
```typescript
// Document Queue Jobs
type DocumentJob = 
  | { name: 'document.scan', data: { tenantId, documentId, fileUri } }
  | { name: 'document.ingest', data: { tenantId, documentId } }
  | { name: 'document.embed', data: { tenantId, documentId } };

// Clause Queue Jobs
type ClauseJob =
  | { name: 'clause.extract', data: { tenantId, documentId, matterId } };

// Risk Queue Jobs
type RiskJob =
  | { name: 'risk.assess', data: { tenantId, documentId, matterId } };
```

### 14.1.3 Pipeline Orchestration
```typescript
// Declarative job flow using BullMQ Flow
const pipeline = await documentQueue.addFlow({
  name: 'document-pipeline',
  queueName: 'document',
  data: { tenantId, documentId },
  children: [
    {
      name: 'document.scan',
      queueName: 'document',
      data: { tenantId, documentId, fileUri },
      children: [
        {
          name: 'document.ingest',
          queueName: 'document',
          children: [
            { name: 'clause.extract', queueName: 'clause' },
            { name: 'obligation.extract', queueName: 'obligation' }
          ]
        }
      ]
    }
  ]
});
```

## 14.2 Retry & Error Handling

### 14.2.1 Retry Configuration
```typescript
const DEFAULT_JOB_OPTIONS = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,  // 1s, 2s, 4s
  },
  removeOnComplete: {
    age: 86400,    // 24 hours
    count: 1000,
  },
  removeOnFail: {
    age: 604800,   // 7 days
  },
};
```

### 14.2.2 Dead-Letter Queue
```typescript
// After all retries exhausted
worker.on('failed', async (job, err) => {
  if (job.attemptsMade >= job.opts.attempts) {
    await deadLetterQueue.add('failed-job', {
      originalQueue: job.queueName,
      originalJobName: job.name,
      originalJobId: job.id,
      originalData: job.data,
      error: err.message,
      stack: err.stack,
      attemptsMade: job.attemptsMade,
      failedAt: new Date().toISOString(),
    });
  }
});
```

## 14.3 Celery Workers (Python)

### 14.3.1 Task Queues
| Queue | Tasks |
|-------|-------|
| embeddings | batch_embed, reindex |
| reports | generate_report, export_analysis |
| notifications | send_reminder, send_alert |
| analytics | aggregate_stats, update_dashboard |
| cleanup | purge_old_files, archive_data |

### 14.3.2 Beat Schedule
```python
CELERY_BEAT_SCHEDULE = {
    'obligation-reminders': {
        'task': 'tasks.obligation_remind.send_daily_reminders',
        'schedule': crontab(hour=8, minute=0),
    },
    'quota-reset': {
        'task': 'tasks.analytics.reset_monthly_quotas',
        'schedule': crontab(day_of_month=1, hour=0, minute=0),
    },
    'cleanup-expired': {
        'task': 'tasks.cleanup.purge_expired_files',
        'schedule': crontab(hour=3, minute=0),
    },
}
```

---

# 15. Observability & Monitoring

## 15.1 Logging

### 15.1.1 Log Levels
| Level | Usage |
|-------|-------|
| `error` | Unrecoverable errors |
| `warn` | Recoverable issues, deprecations |
| `info` | Key business events |
| `debug` | Detailed debugging (dev only) |
| `trace` | Very detailed tracing |

### 15.1.2 Structured Log Format
```json
{
  "level": "info",
  "time": "2026-04-08T10:30:00.000Z",
  "requestId": "req_abc123",
  "tenantId": "uuid",
  "attorneyId": "uuid",
  "method": "POST",
  "path": "/documents",
  "statusCode": 201,
  "duration": 1250,
  "msg": "Document uploaded successfully"
}
```

## 15.2 Metrics

### 15.2.1 Application Metrics
| Metric | Type | Labels |
|--------|------|--------|
| `http_requests_total` | Counter | method, path, status |
| `http_request_duration_seconds` | Histogram | method, path |
| `db_query_duration_seconds` | Histogram | operation |
| `ai_inference_duration_seconds` | Histogram | model, operation |
| `documents_processed_total` | Counter | tenant, status |
| `queue_job_duration_seconds` | Histogram | queue, job_name |

### 15.2.2 Business Metrics
| Metric | Type | Description |
|--------|------|-------------|
| `active_tenants` | Gauge | Tenants with activity in last 24h |
| `documents_uploaded_daily` | Counter | Documents per day |
| `ai_queries_daily` | Counter | Research queries per day |
| `quota_utilization` | Gauge | Usage vs limit per tenant |

## 15.3 Tracing

### 15.3.1 OpenTelemetry Integration
```typescript
// Automatic instrumentation
const tracer = opentelemetry.trace.getTracer('lexos-api');

// Custom spans
app.addHook('preHandler', (req, reply, done) => {
  const span = tracer.startSpan(`${req.method} ${req.routerPath}`);
  span.setAttribute('tenant.id', req.tenantId);
  req.span = span;
  done();
});
```

### 15.3.2 Traced Operations
- HTTP requests (automatic)
- Database queries (automatic)
- Redis operations (automatic)
- AI service calls (custom)
- Background jobs (custom)

## 15.4 Alerting

### 15.4.1 Alert Rules
| Alert | Condition | Severity |
|-------|-----------|----------|
| High Error Rate | 5xx > 1% for 5m | Critical |
| High Latency | P95 > 2s for 5m | Warning |
| Pod Crash Loop | Restarts > 0 in 15m | Critical |
| Database Connection | Connections > 80% | Warning |
| Quota Near Limit | Usage > 90% | Info |
| AI Service Down | Health check fails | Critical |

### 15.4.2 Notification Channels
- PagerDuty (critical)
- Slack (#lexos-alerts)
- Email (daily digest)

---

# 16. Testing Strategy

## 16.1 Test Pyramid

```
                    ┌───────────┐
                   /│   E2E     │\        44 tests
                  / │ (Browser) │ \
                 /  └───────────┘  \
                /   ┌───────────┐   \
               /    │Integration│    \    150 tests
              /     │  (API)    │     \
             /      └───────────┘      \
            /       ┌───────────┐       \
           /        │   Unit    │        \  287 tests
          /         │(Functions)│         \
         /          └───────────┘          \
        └───────────────────────────────────┘
                     481 Total
```

## 16.2 Test Categories

### 16.2.1 Unit Tests
- Pure functions
- Validators
- Utilities
- Formatters

### 16.2.2 Integration Tests
- API endpoints
- Database operations
- AI service calls
- Background jobs

### 16.2.3 E2E Tests
- User flows (Playwright)
- Cross-browser testing
- Mobile viewport testing

## 16.2.4 Harness Notes
- The web build depends on Next.js standalone output and a committed `apps/web/public/` directory so the Docker runner can copy both `/public` and `.next/standalone`.
- API tests are wired through `apps/api/vitest.config.ts` and `apps/api/tests/setup.ts`; CI applies `npm run migrate:up -w @lexos/api` before the Node coverage run so the test database schema exists before suite startup.
- API tests still require reachable Postgres and Redis services when executed end to end.
- AI-service pytest collection is wired through `apps/ai-service/tests/conftest.py` and `apps/ai-service/pytest.ini`, and the pinned dependency stack is intended for Python 3.11.
- The AI-service Docker image uses Debian Trixie-compatible `libgl1` packages in both build and runtime stages.
## 16.3 Test Files

| File | Tests | Coverage |
|------|-------|----------|
| `auth.test.ts` | 50 | Auth flows |
| `matters.test.ts` | 40 | Matter CRUD |
| `security.test.ts` | 50 | Security controls |
| `admin.test.ts` | 50 | Admin functions |
| `research.test.ts` | 43 | Search & RAG |
| `legal-rules.test.ts` | 43 | State rules |
| `documents.test.ts` | 35 | Document ops |
| `validation.test.ts` | 41 | Input validation |
| `test_ai_service.py` | 66 | AI functions |
| `components.test.tsx` | 46 | React components |
| `e2e.spec.ts` | 44 | User journeys |

## 16.4 Coverage Requirements

- **Minimum**: 70% line coverage
- **Target**: 80% line coverage
- **Critical Paths**: 90%+ coverage

```bash
# Run with coverage
npm run test:coverage

# Check thresholds
jest --coverage --coverageThreshold='{"global":{"lines":70}}'
```

---

# 17. Deployment & Infrastructure

## 17.1 Environments

| Environment | Purpose | URL |
|-------------|---------|-----|
| Development | Local dev | localhost |
| Staging | Pre-production | staging.lexos.ai |
| Production | Live system | app.lexos.ai |

## 17.2 Infrastructure

### 17.2.1 Kubernetes Resources
- **Namespace**: lexos
- **Deployments**: api (3), web (3), ai-service (2), worker (3)
- **Services**: ClusterIP for internal, LoadBalancer for ingress
- **HPA**: API autoscaling (3-20 pods) based on CPU/memory
- **Workers**: Fixed 3 replicas (manual scaling until queue-depth autoscaling is implemented)
- **PDB**: Min 2 available for API
- **NetworkPolicy**: Restrict pod-to-pod traffic

### 17.2.2 External Services
| Service | Provider | Purpose |
|---------|----------|---------|
| Database | AWS RDS / Cloud SQL | PostgreSQL + pgvector |
| Cache | ElastiCache / Memorystore | Redis |
| Storage | S3 / GCS | Document storage |
| Secrets | AWS SM / GCP SM | Secret management |
| Email | SendGrid | Transactional email |
| Payments | Stripe | Billing |
| Monitoring | Datadog / Grafana | Observability |

## 17.3 CI/CD Pipeline

```yaml
# Simplified pipeline stages
stages:
  - lint          # ESLint, Ruff
  - typecheck     # tsc, mypy
  - test          # Jest, pytest
  - security      # Semgrep, Trivy
  - build         # Docker images
  - deploy        # Kubernetes
  - verify        # Smoke tests
```

### 17.3.1 Current CI Notes
- The `node-checks` workflow now runs API migrations against the ephemeral Postgres service before coverage tests.
- The `docker-build` workflow uses the updated AI-service Dockerfile package list compatible with current `python:3.11-slim` Debian Trixie images.

---

# 18. Legal Domain Knowledge

## 18.1 USA Legal Compliance

### 18.1.1 Non-Compete Laws by State
```typescript
const NON_COMPETE_RULES: Record<State, NonCompeteRule> = {
  // Complete Bans
  CA: { enforceable: false, ban_type: 'complete' },
  ND: { enforceable: false, ban_type: 'complete' },
  OK: { enforceable: false, ban_type: 'complete' },
  MN: { enforceable: false, ban_type: 'complete', effective: '2023-07-01' },
  
  // Income Thresholds
  WA: { threshold: 116593, type: 'annual_income' },
  IL: { threshold: 75000, type: 'annual_income' },
  CO: { threshold: 101250, type: 'annual_income' },
  OR: { threshold: 100533, type: 'annual_income' },
  VA: { threshold: 64285, type: 'annual_income' },
  ME: { threshold: 54165, type: 'annual_income' },
  
  // Time Restrictions
  MA: { max_duration_months: 12, garden_leave: 'required' },
  NV: { max_duration_months: 12 },
  
  // Default (most states)
  DEFAULT: { enforceable: true, reasonableness_test: true }
};
```

### 18.1.2 Data Privacy Laws
| Law | State | Effective | Key Requirements |
|-----|-------|-----------|------------------|
| CCPA/CPRA | CA | 2020/2023 | Opt-out, access, deletion |
| VCDPA | VA | 2023 | Consent, access, correction |
| CPA | CO | 2023 | Universal opt-out |
| CTDPA | CT | 2023 | Sensitive data consent |
| UCPA | UT | 2023 | Notice, opt-out |
| MCDPA | MT | 2024 | Consumer rights |
| TDPSA | TX | 2024 | Business obligations |

### 18.1.3 Federal Regulations
| Regulation | Scope | Key Requirements |
|------------|-------|------------------|
| HIPAA | Healthcare | PHI protection |
| ITAR/EAR | Defense/Export | Export controls |
| FCPA | Anti-Bribery | Foreign corruption |
| ADA | Accessibility | Disability accommodation |
| FLSA | Employment | Wage and hour |
| DTSA | Trade Secrets | Federal protection |

## 18.2 Clause Type Definitions

### 18.2.1 Full Clause Type Schema
```typescript
interface ClauseDefinition {
  type: ClauseType;
  description: string;
  risk_factors: string[];
  standard_language: string;
  jurisdiction_variations: Record<State, string>;
}

const CLAUSE_DEFINITIONS: ClauseDefinition[] = [
  {
    type: 'indemnification',
    description: 'Allocation of risk and responsibility for losses',
    risk_factors: [
      'One-way vs. mutual',
      'Scope of covered claims',
      'Caps or carve-outs',
      'Duty to defend vs. indemnify'
    ],
    standard_language: 'Party A shall indemnify, defend, and hold harmless...',
    jurisdiction_variations: {
      CA: 'Anti-indemnity statute applies to construction',
      NY: 'Generally enforceable if clear and unambiguous'
    }
  },
  // ... 23 more definitions
];
```

---

# 19. Integration Capabilities

## 19.1 API Integration

### 19.1.1 REST API
- OpenAPI 3.0 specification
- JWT authentication
- Rate limiting per API key
- Webhook notifications

### 19.1.2 Webhooks
```json
{
  "event": "document.analyzed",
  "timestamp": "2026-04-08T10:30:00Z",
  "data": {
    "documentId": "uuid",
    "riskScore": 0.72,
    "flagCount": 5
  },
  "signature": "sha256=..."
}
```

## 19.2 Third-Party Integrations

### 19.2.1 Planned Integrations
| Integration | Status | Use Case |
|-------------|--------|----------|
| Microsoft 365 | Planned | Document sync |
| Google Workspace | Planned | Calendar, Drive |
| NetDocuments | Planned | DMS integration |
| iManage | Planned | DMS integration |
| Clio | Planned | Practice management |
| Salesforce | Planned | CRM sync |

### 19.2.2 Calendar Integration
- Google Calendar (OAuth2)
- Outlook/Exchange (Graph API)
- iCal feed (read-only)

---

# 20. Performance & Scalability

## 20.1 Performance Targets

| Metric | Target | Current |
|--------|--------|---------|
| API Response (P50) | < 100ms | 85ms |
| API Response (P95) | < 500ms | 420ms |
| Document Processing | < 60s | 45s avg |
| Search Query | < 2s | 1.2s |
| Page Load (LCP) | < 2.5s | 2.1s |

## 20.2 Scaling Strategies

### 20.2.1 Horizontal Scaling
- API servers: 3-20 pods (HPA)
- AI service: 2-10 pods (GPU-aware)
- Workers: fixed 3 replicas (manual scaling)

### 20.2.2 Database Scaling
- Read replicas for queries
- Connection pooling (PgBouncer)
- Partitioning for large tables

### 20.2.3 Caching
- Redis for session/rate limit
- Embedding cache (30-day TTL)
- Search result cache (5-min TTL)

## 20.3 Load Testing Results

| Scenario | Users | RPS | P95 Latency | Error Rate |
|----------|-------|-----|-------------|------------|
| Normal | 100 | 500 | 200ms | 0% |
| Peak | 500 | 2000 | 450ms | 0.1% |
| Stress | 1000 | 4000 | 1.2s | 1.5% |

---

# 21. Disaster Recovery

## 21.1 Backup Strategy

| Component | Frequency | Retention | Location |
|-----------|-----------|-----------|----------|
| Database | Continuous + Daily | 30 days | Cross-region |
| S3 Documents | Real-time replication | Indefinite | Cross-region |
| Redis | Daily snapshot | 7 days | Same region |
| Secrets | On change | 30 versions | Multi-region |

## 21.2 Recovery Objectives

| Metric | Target |
|--------|--------|
| RPO (Recovery Point Objective) | < 1 hour |
| RTO (Recovery Time Objective) | < 4 hours |

## 21.3 Failover Procedures

### 21.3.1 Database Failover
1. RDS Multi-AZ automatic failover (~60s)
2. Update connection strings if needed
3. Verify application connectivity
4. Monitor for replication lag

### 21.3.2 Region Failover
1. DNS failover to DR region
2. Promote read replica to primary
3. Redirect S3 traffic to replicated bucket
4. Verify all services healthy

---

# 22. Roadmap & Future Features

## 22.1 Q2 2026
- [ ] Mobile app (iOS/Android)
- [ ] Microsoft 365 integration
- [ ] Advanced analytics dashboard
- [ ] Custom AI model training

## 22.2 Q3 2026
- [ ] Multi-language support (Spanish, French)
- [ ] E-signature integration (DocuSign)
- [ ] Workflow automation builder
- [ ] Client collaboration portal v2

## 22.3 Q4 2026
- [ ] AI-powered contract drafting
- [ ] Regulatory change monitoring
- [ ] Advanced compliance reporting
- [ ] Enterprise API v2

## 22.4 2027 Vision
- Fully autonomous contract review
- Predictive litigation risk
- Real-time regulatory compliance
- Industry-specific modules (Healthcare, Finance)

---

# 23. Glossary

| Term | Definition |
|------|------------|
| **Attorney** | User account in the system (any legal professional) |
| **Chunk** | Segment of document text for embedding |
| **Clause** | Discrete contractual provision extracted by AI |
| **Embedding** | Vector representation of text (384 dimensions) |
| **Flag** | Risk finding identified during assessment |
| **Matter** | Legal case or project container |
| **Obligation** | Contractual duty with deadline |
| **Playbook** | Set of firm-specific rules for assessment |
| **RAG** | Retrieval-Augmented Generation |
| **Redline** | Document with tracked changes |
| **Tenant** | Law firm organization in multi-tenant system |

---

# 24. Appendices

## Appendix A: Environment Variables

See `.env.example` for complete list with descriptions.

## Appendix B: API Error Codes

See Section 7.9 for complete error code reference.

## Appendix C: Database ERD

See Section 6.1 for entity relationship diagram.

## Appendix D: Security Checklist

- [ ] JWT keys rotated quarterly
- [ ] All secrets in secret manager
- [ ] WAF rules updated
- [ ] Penetration test (annual)
- [ ] SOC 2 audit (annual)
- [ ] Dependency audit (weekly)

## Appendix E: Support Contacts

| Issue Type | Contact |
|------------|---------|
| Technical Support | support@lexos.ai |
| Security Issues | security@lexos.ai |
| Enterprise Sales | enterprise@lexos.ai |
| Partnership | partners@lexos.ai |

---

**Document Version**: 1.0.0  
**Last Updated**: April 8, 2026  
**Authors**: LexOS Engineering Team  
**Classification**: Internal / Partner Documentation

---

© 2026 LexOS Inc. All rights reserved.
