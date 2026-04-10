"""
EvidentIS Legal Domain Models
Strict schemas for legal entities enforced across all AI operations
"""

from enum import Enum
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field
from datetime import date


# =============================================================================
# Clause Type Taxonomy (24 USA-specific types)
# =============================================================================

class ClauseType(str, Enum):
    """Legal clause types - enforced across extraction, risk analysis, suggestions"""
    INDEMNIFICATION = "indemnification"
    LIMITATION_OF_LIABILITY = "limitation_of_liability"
    TERMINATION_FOR_CONVENIENCE = "termination_for_convenience"
    TERMINATION_FOR_CAUSE = "termination_for_cause"
    CONFIDENTIALITY = "confidentiality"
    NON_COMPETE = "non_compete"
    NON_SOLICITATION = "non_solicitation"
    INTELLECTUAL_PROPERTY = "intellectual_property"
    GOVERNING_LAW = "governing_law"
    ARBITRATION = "arbitration"
    JURY_WAIVER = "jury_waiver"
    CLASS_ACTION_WAIVER = "class_action_waiver"
    FORCE_MAJEURE = "force_majeure"
    ASSIGNMENT = "assignment"
    NOTICE_REQUIREMENTS = "notice_requirements"
    AMENDMENT = "amendment"
    SEVERABILITY = "severability"
    ENTIRE_AGREEMENT = "entire_agreement"
    WARRANTY_DISCLAIMER = "warranty_disclaimer"
    DATA_PRIVACY = "data_privacy"
    INSURANCE_REQUIREMENTS = "insurance_requirements"
    COMPLIANCE_WITH_LAWS = "compliance_with_laws"
    AUDIT_RIGHTS = "audit_rights"
    MOST_FAVORED_NATION = "most_favored_nation"
    UNKNOWN = "unknown"

    @classmethod
    def from_string(cls, value: str) -> "ClauseType":
        """Parse clause type from string, with fuzzy matching"""
        normalized = value.lower().replace(" ", "_").replace("-", "_")
        try:
            return cls(normalized)
        except ValueError:
            # Fuzzy matching for common variations
            mappings = {
                "liability": cls.LIMITATION_OF_LIABILITY,
                "indemnity": cls.INDEMNIFICATION,
                "ip": cls.INTELLECTUAL_PROPERTY,
                "nda": cls.CONFIDENTIALITY,
                "noncompete": cls.NON_COMPETE,
                "non_competition": cls.NON_COMPETE,
                "termination": cls.TERMINATION_FOR_CAUSE,
                "choice_of_law": cls.GOVERNING_LAW,
                "dispute_resolution": cls.ARBITRATION,
            }
            return mappings.get(normalized, cls.UNKNOWN)


class RiskLevel(str, Enum):
    """Risk severity levels"""
    CRITICAL = "critical"  # Immediate attention required
    HIGH = "high"          # Significant concern
    MEDIUM = "medium"      # Notable but manageable
    LOW = "low"            # Minor concern
    INFO = "info"          # Informational only

    @property
    def numeric_value(self) -> int:
        return {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}[self.value]


class ObligationType(str, Enum):
    """Types of contractual obligations"""
    PAYMENT = "payment"
    DELIVERY = "delivery"
    REPORTING = "reporting"
    COMPLIANCE = "compliance"
    RENEWAL = "renewal"
    NOTICE = "notice"
    INSURANCE = "insurance"
    AUDIT = "audit"
    CONFIDENTIALITY = "confidentiality"
    OTHER = "other"


class Jurisdiction(str, Enum):
    """US jurisdictions"""
    FEDERAL = "federal"
    AL = "AL"
    AK = "AK"
    AZ = "AZ"
    AR = "AR"
    CA = "CA"
    CO = "CO"
    CT = "CT"
    DE = "DE"
    FL = "FL"
    GA = "GA"
    HI = "HI"
    ID = "ID"
    IL = "IL"
    IN = "IN"
    IA = "IA"
    KS = "KS"
    KY = "KY"
    LA = "LA"
    ME = "ME"
    MD = "MD"
    MA = "MA"
    MI = "MI"
    MN = "MN"
    MS = "MS"
    MO = "MO"
    MT = "MT"
    NE = "NE"
    NV = "NV"
    NH = "NH"
    NJ = "NJ"
    NM = "NM"
    NY = "NY"
    NC = "NC"
    ND = "ND"
    OH = "OH"
    OK = "OK"
    OR = "OR"
    PA = "PA"
    RI = "RI"
    SC = "SC"
    SD = "SD"
    TN = "TN"
    TX = "TX"
    UT = "UT"
    VT = "VT"
    VA = "VA"
    WA = "WA"
    WV = "WV"
    WI = "WI"
    WY = "WY"
    DC = "DC"


# =============================================================================
# Structured Response Models
# =============================================================================

@dataclass
class ClauseExtraction:
    """Extracted clause with full context"""
    id: str
    type: ClauseType
    text: str
    start_offset: int
    end_offset: int
    page_number: Optional[int] = None
    confidence: float = 0.0
    section_reference: Optional[str] = None  # e.g., "Section 12.4"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "text": self.text,
            "start_offset": self.start_offset,
            "end_offset": self.end_offset,
            "page_number": self.page_number,
            "confidence": self.confidence,
            "section_reference": self.section_reference,
        }


@dataclass
class RiskFinding:
    """Individual risk finding with full explainability"""
    id: str
    risk_level: RiskLevel
    risk_score: float  # 0.0 to 1.0
    reason: str
    clause_reference: str  # e.g., "Section 12.4"
    clause_type: ClauseType
    clause_excerpt: str
    confidence: float
    suggestion: Optional[str] = None
    jurisdiction_note: Optional[str] = None
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "risk_level": self.risk_level.value,
            "risk_score": round(self.risk_score, 3),
            "reason": self.reason,
            "clause_reference": self.clause_reference,
            "clause_type": self.clause_type.value,
            "clause_excerpt": self.clause_excerpt[:500],
            "confidence": round(self.confidence, 3),
            "suggestion": self.suggestion,
            "jurisdiction_note": self.jurisdiction_note,
        }


@dataclass
class RiskAssessmentResult:
    """Complete risk assessment with structured output"""
    document_id: str
    overall_risk_level: RiskLevel
    overall_risk_score: float
    findings: List[RiskFinding]
    summary: str
    recommendation: str
    confidence: float
    disclaimer: str = "AI-generated — requires attorney review"
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_id": self.document_id,
            "overall_risk_level": self.overall_risk_level.value,
            "overall_risk_score": round(self.overall_risk_score, 3),
            "findings": [f.to_dict() for f in self.findings],
            "summary": self.summary,
            "recommendation": self.recommendation,
            "confidence": round(self.confidence, 3),
            "disclaimer": self.disclaimer,
        }


@dataclass
class RedlineSuggestion:
    """AI redline suggestion with context"""
    id: str
    original_text: str
    suggested_text: str
    reason: str
    clause_type: ClauseType
    clause_reference: str
    risk_reduction: str
    confidence: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "original_text": self.original_text,
            "suggested_text": self.suggested_text,
            "reason": self.reason,
            "clause_type": self.clause_type.value,
            "clause_reference": self.clause_reference,
            "risk_reduction": self.risk_reduction,
            "confidence": round(self.confidence, 3),
        }


@dataclass
class ObligationExtraction:
    """Extracted contractual obligation"""
    id: str
    type: ObligationType
    description: str
    responsible_party: str
    due_date: Optional[date] = None
    recurrence: Optional[str] = None  # "monthly", "quarterly", "annually"
    clause_reference: str = ""
    confidence: float = 0.0
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.type.value,
            "description": self.description,
            "responsible_party": self.responsible_party,
            "due_date": self.due_date.isoformat() if self.due_date else None,
            "recurrence": self.recurrence,
            "clause_reference": self.clause_reference,
            "confidence": round(self.confidence, 3),
        }


@dataclass
class DocumentContext:
    """AI context for a document with versioning"""
    document_id: str
    tenant_id: str
    matter_id: str
    version: int
    title: str
    document_type: str
    jurisdiction: Optional[Jurisdiction] = None
    linked_documents: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "document_id": self.document_id,
            "tenant_id": self.tenant_id,
            "matter_id": self.matter_id,
            "version": self.version,
            "title": self.title,
            "document_type": self.document_type,
            "jurisdiction": self.jurisdiction.value if self.jurisdiction else None,
            "linked_documents": self.linked_documents,
            "metadata": self.metadata,
        }


# =============================================================================
# Validation Functions
# =============================================================================

def validate_clause_type(value: str) -> ClauseType:
    """Validate and normalize clause type"""
    return ClauseType.from_string(value)


def validate_risk_level(value: str) -> RiskLevel:
    """Validate risk level string"""
    # Map numeric scores to levels
    if isinstance(value, (int, float)):
        if value >= 0.8:
            return RiskLevel.CRITICAL
        elif value >= 0.6:
            return RiskLevel.HIGH
        elif value >= 0.4:
            return RiskLevel.MEDIUM
        elif value >= 0.2:
            return RiskLevel.LOW
        else:
            return RiskLevel.INFO

    if isinstance(value, str):
        try:
            return RiskLevel(value.lower())
        except ValueError:
            return RiskLevel.MEDIUM

    return RiskLevel.MEDIUM


def validate_jurisdiction(value: str) -> Optional[Jurisdiction]:
    """Validate jurisdiction string"""
    if not value:
        return None
    try:
        return Jurisdiction(value.upper())
    except ValueError:
        # Try common variations
        state_map = {
            "california": Jurisdiction.CA,
            "new york": Jurisdiction.NY,
            "texas": Jurisdiction.TX,
            "delaware": Jurisdiction.DE,
            "florida": Jurisdiction.FL,
        }
        return state_map.get(value.lower())
