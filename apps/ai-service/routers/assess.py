"""
LexOS AI Service - Risk Assessment Router
Assess legal risk of document clauses using playbook rules.
"""

import json
import logging
from typing import Any, Dict, List, Optional
from enum import Enum

import httpx
from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from llm_safety import RetryConfig, retry_with_backoff
from prompts import RISK_ASSESSMENT, validate_response

logger = logging.getLogger(__name__)

router = APIRouter()

LLM_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    initial_delay=1.0,
    max_delay=10.0,
    exponential_base=2.0,
)


class RiskLevel(str, Enum):
    """Risk level enumeration."""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# Risk level colors for UI
RISK_COLORS = {
    "critical": "#DC2626",
    "high": "#EA580C",
    "medium": "#D97706",
    "low": "#16A34A",
}


class PlaybookRule(BaseModel):
    """A playbook rule for risk assessment."""
    id: str
    clause_type: str
    condition: str
    risk_level: RiskLevel
    message: str
    jurisdiction: Optional[str] = None  # e.g., "CA", "NY", or None for all states


class ClauseForAssessment(BaseModel):
    """Clause to assess."""
    id: str
    clause_type: str
    text: str
    metadata: Optional[Dict[str, Any]] = None


class RiskAssessRequest(BaseModel):
    """Risk assessment request."""
    document_id: str
    clauses: List[ClauseForAssessment]
    playbook_rules: List[PlaybookRule]
    jurisdiction: Optional[str] = Field(
        default=None,
        description="State jurisdiction (e.g., 'CA', 'NY'). If provided, applies state-specific rules."
    )


class Flag(BaseModel):
    """Generated risk flag."""
    clause_id: str
    rule_id: str
    risk_level: RiskLevel
    message: str
    suggested_edit: Optional[str] = None
    confidence: float


class RiskAssessResponse(BaseModel):
    """Risk assessment response."""
    document_id: str
    flags: List[Flag]
    summary: Dict[str, int]
    highest_risk: RiskLevel


# Default playbook rules for common scenarios
DEFAULT_RULES: List[Dict] = [
    # Indemnification
    {
        "id": "indem-001",
        "clause_type": "indemnification",
        "condition": "one-way indemnification favoring counterparty",
        "risk_level": "high",
        "message": "One-way indemnification clause only protects the counterparty. Consider requesting mutual indemnification.",
    },
    {
        "id": "indem-002",
        "clause_type": "indemnification",
        "condition": "unlimited indemnification liability",
        "risk_level": "critical",
        "message": "Indemnification has no cap. Recommend adding a liability cap.",
    },
    
    # Limitation of Liability
    {
        "id": "lol-001",
        "clause_type": "limitation_of_liability",
        "condition": "no cap on liability",
        "risk_level": "critical",
        "message": "No liability cap found. Recommend adding cap at 12 months fees or contract value.",
    },
    {
        "id": "lol-002",
        "clause_type": "limitation_of_liability",
        "condition": "excludes gross negligence or willful misconduct carveout",
        "risk_level": "high",
        "message": "Liability limitation may not carve out gross negligence/willful misconduct.",
    },
    
    # Termination
    {
        "id": "term-001",
        "clause_type": "termination_for_convenience",
        "condition": "counterparty can terminate without notice",
        "risk_level": "high",
        "message": "No notice period for termination. Recommend requiring 30-day written notice.",
    },
    {
        "id": "term-002",
        "clause_type": "termination_for_cause",
        "condition": "no cure period for breach",
        "risk_level": "medium",
        "message": "No cure period specified for material breach. Recommend 30-day cure period.",
    },
    
    # Confidentiality
    {
        "id": "conf-001",
        "clause_type": "confidentiality",
        "condition": "perpetual confidentiality obligation",
        "risk_level": "medium",
        "message": "Confidentiality obligation has no time limit. Consider 3-5 year term.",
    },
    {
        "id": "conf-002",
        "clause_type": "confidentiality",
        "condition": "no exceptions for legally required disclosure",
        "risk_level": "high",
        "message": "No exception for legally compelled disclosure. Add standard carveout.",
    },
    
    # Non-compete (State-specific)
    {
        "id": "nc-001",
        "clause_type": "non_compete",
        "condition": "non-compete in California",
        "risk_level": "critical",
        "message": "Non-compete clauses are unenforceable in California per Bus. & Prof. Code § 16600.",
        "jurisdiction": "CA",
    },
    {
        "id": "nc-002",
        "clause_type": "non_compete",
        "condition": "non-compete duration exceeds 2 years",
        "risk_level": "high",
        "message": "Non-compete duration may be excessive. Most courts limit to 1-2 years.",
    },
    
    # Governing Law
    {
        "id": "gov-001",
        "clause_type": "governing_law",
        "condition": "governing law differs from client's jurisdiction",
        "risk_level": "medium",
        "message": "Contract governed by foreign state law. Consider negotiating home state law.",
    },
    
    # Arbitration
    {
        "id": "arb-001",
        "clause_type": "arbitration",
        "condition": "mandatory arbitration with limited discovery",
        "risk_level": "medium",
        "message": "Arbitration clause limits discovery rights. Evaluate impact on potential claims.",
    },
    {
        "id": "arb-002",
        "clause_type": "arbitration",
        "condition": "arbitration in distant venue",
        "risk_level": "medium",
        "message": "Arbitration venue may be inconvenient. Consider negotiating local venue.",
    },
    
    # Jury Waiver
    {
        "id": "jury-001",
        "clause_type": "jury_waiver",
        "condition": "jury trial waiver present",
        "risk_level": "medium",
        "message": "Jury trial waiver present. Evaluate whether bench trial is preferable.",
    },
    
    # Class Action Waiver
    {
        "id": "class-001",
        "clause_type": "class_action_waiver",
        "condition": "class action waiver in consumer contract",
        "risk_level": "high",
        "message": "Class action waiver may be unenforceable in some states for consumer contracts.",
    },
    
    # IP
    {
        "id": "ip-001",
        "clause_type": "intellectual_property",
        "condition": "broad IP assignment",
        "risk_level": "high",
        "message": "Broad IP assignment may transfer more rights than intended. Review scope carefully.",
    },
    {
        "id": "ip-002",
        "clause_type": "intellectual_property",
        "condition": "work for hire without exception for pre-existing IP",
        "risk_level": "high",
        "message": "Work for hire clause should carve out pre-existing intellectual property.",
    },
    
    # Data Privacy
    {
        "id": "priv-001",
        "clause_type": "data_privacy",
        "condition": "missing CCPA compliance in California",
        "risk_level": "critical",
        "message": "California contracts must comply with CCPA/CPRA for personal information handling.",
        "jurisdiction": "CA",
    },
    {
        "id": "priv-002",
        "clause_type": "data_privacy",
        "condition": "data handling terms missing",
        "risk_level": "high",
        "message": "Contract lacks data processing/handling terms. Add data privacy addendum.",
    },
    
    # Insurance
    {
        "id": "ins-001",
        "clause_type": "insurance_requirements",
        "condition": "insurance requirements exceed industry standard",
        "risk_level": "medium",
        "message": "Insurance requirements may exceed industry norms. Verify availability and cost.",
    },
    
    # Audit
    {
        "id": "audit-001",
        "clause_type": "audit_rights",
        "condition": "unlimited audit rights without notice",
        "risk_level": "medium",
        "message": "Audit rights should require reasonable notice (e.g., 30 days) and limits.",
    },
    
    # Assignment
    {
        "id": "assign-001",
        "clause_type": "assignment",
        "condition": "counterparty can assign without consent",
        "risk_level": "medium",
        "message": "Counterparty can assign freely. Consider requiring consent for assignment.",
    },
]


async def assess_with_llm(
    clause: ClauseForAssessment,
    rules: List[PlaybookRule],
    jurisdiction: Optional[str],
    ollama_url: str,
    model: str,
    timeout: int
) -> List[Flag]:
    """
    Use LLM to assess clause against playbook rules.
    """
    applicable_rules = [
        r for r in rules
        if r.clause_type == clause.clause_type
        and (r.jurisdiction is None or r.jurisdiction == jurisdiction)
    ]
    
    if not applicable_rules:
        return []
    
    rules_payload = [
        {
            "id": r.id,
            "clause_type": r.clause_type,
            "condition": r.condition,
            "risk_level": r.risk_level,
            "message": r.message,
            "jurisdiction": r.jurisdiction,
        }
        for r in applicable_rules
    ]

    prompt = RISK_ASSESSMENT.format(
        clauses_json=json.dumps(
            [
                {
                    "id": clause.id,
                    "clause_type": clause.clause_type,
                    "text": clause.text,
                }
            ],
            indent=2,
        ),
        jurisdiction=jurisdiction or "US",
        client_role="contract reviewer",
        playbook_rules=json.dumps(rules_payload, indent=2),
    )
    prompt += """

For each playbook rule, return:
{
  "rule_id": "the rule ID",
  "applies": true/false,
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation",
  "suggested_edit": "optional suggested modification"
}

Return ONLY a JSON array of rule assessments. No other text."""

    payload: Dict[str, Any] = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1},
    }

    async def _call_llm() -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{ollama_url}/api/generate",
                json=payload,
            )
            if response.status_code != 200:
                raise RuntimeError(f"Ollama error: {response.status_code}")
            return response.json()

    try:
        result = await retry_with_backoff(
            _call_llm,
            config=LLM_RETRY_CONFIG,
        )
        response_text = result.get("response", "[]")
        if not validate_response(response_text, "json"):
            logger.error("Risk assessment model returned non-JSON content")
            return []
        assessments = json.loads(response_text)

        if isinstance(assessments, dict) and "assessments" in assessments:
            assessments = assessments["assessments"]

        flags = []
        for assessment in assessments:
            if assessment.get("applies"):
                rule = next((r for r in applicable_rules if r.id == assessment.get("rule_id")), None)
                if rule:
                    flags.append(Flag(
                        clause_id=clause.id,
                        rule_id=rule.id,
                        risk_level=rule.risk_level,
                        message=rule.message,
                        suggested_edit=assessment.get("suggested_edit"),
                        confidence=float(assessment.get("confidence", 0.7))
                    ))

        return flags

    except Exception as e:
        logger.error(f"LLM assessment failed: {e}")
        return []


def assess_with_heuristics(
    clause: ClauseForAssessment,
    rules: List[PlaybookRule],
    jurisdiction: Optional[str]
) -> List[Flag]:
    """
    Heuristic-based assessment as fallback.
    Uses keyword matching and pattern detection.
    """
    flags = []
    text_lower = clause.text.lower()
    
    applicable_rules = [
        r for r in rules
        if r.clause_type == clause.clause_type
        and (r.jurisdiction is None or r.jurisdiction == jurisdiction)
    ]
    
    for rule in applicable_rules:
        condition_lower = rule.condition.lower()
        
        # Check for keywords from condition in clause text
        condition_words = [w for w in condition_lower.split() if len(w) > 3]
        matches = sum(1 for word in condition_words if word in text_lower)
        match_ratio = matches / len(condition_words) if condition_words else 0
        
        # Specific heuristic checks
        triggered = False
        confidence = 0.5
        
        # Non-compete in California
        if clause.clause_type == "non_compete" and jurisdiction == "CA":
            if any(w in text_lower for w in ["compete", "competition", "competitive"]):
                triggered = True
                confidence = 0.95
        
        # Unlimited liability
        if clause.clause_type in ["indemnification", "limitation_of_liability"]:
            if "unlimited" in text_lower or "no cap" in text_lower:
                triggered = True
                confidence = 0.85
            elif "cap" not in text_lower and "limit" not in text_lower and "maximum" not in text_lower:
                if rule.condition == "no cap on liability" or "unlimited" in rule.condition:
                    triggered = True
                    confidence = 0.7
        
        # No cure period
        if clause.clause_type == "termination_for_cause":
            if "cure" not in text_lower and ("breach" in text_lower or "terminate" in text_lower):
                if "cure period" in rule.condition:
                    triggered = True
                    confidence = 0.7
        
        # Perpetual confidentiality
        if clause.clause_type == "confidentiality":
            if "perpetual" in text_lower or "indefinite" in text_lower:
                if "perpetual" in rule.condition:
                    triggered = True
                    confidence = 0.8
        
        # General keyword match fallback
        if not triggered and match_ratio > 0.5:
            triggered = True
            confidence = min(0.6, match_ratio)
        
        if triggered:
            flags.append(Flag(
                clause_id=clause.id,
                rule_id=rule.id,
                risk_level=rule.risk_level,
                message=rule.message,
                suggested_edit=None,
                confidence=confidence
            ))
    
    return flags


@router.post("", response_model=RiskAssessResponse)
async def assess_risk(
    request: Request,
    body: RiskAssessRequest
) -> RiskAssessResponse:
    """
    Assess legal risk of document clauses against playbook rules.
    
    Uses a hybrid approach:
    1. LLM-based assessment for nuanced analysis
    2. Heuristic fallback for reliability
    
    Supports state-specific rules for all 50 US states.
    """
    settings = request.app.state.settings
    
    if not body.clauses:
        return RiskAssessResponse(
            document_id=body.document_id,
            flags=[],
            summary={"critical": 0, "high": 0, "medium": 0, "low": 0},
            highest_risk=RiskLevel.LOW
        )
    
    # Use provided rules or defaults
    rules = body.playbook_rules or [PlaybookRule(**r) for r in DEFAULT_RULES]
    
    all_flags = []
    
    for clause in body.clauses:
        # Try LLM assessment first
        llm_flags = await assess_with_llm(
            clause,
            rules,
            body.jurisdiction,
            settings.ollama_base_url,
            settings.ollama_model_extract,
            settings.ollama_timeout
        )
        
        if llm_flags:
            all_flags.extend(llm_flags)
        else:
            # Fall back to heuristics
            heuristic_flags = assess_with_heuristics(clause, rules, body.jurisdiction)
            all_flags.extend(heuristic_flags)
    
    # Calculate summary
    summary = {
        "critical": sum(1 for f in all_flags if f.risk_level == RiskLevel.CRITICAL),
        "high": sum(1 for f in all_flags if f.risk_level == RiskLevel.HIGH),
        "medium": sum(1 for f in all_flags if f.risk_level == RiskLevel.MEDIUM),
        "low": sum(1 for f in all_flags if f.risk_level == RiskLevel.LOW),
    }
    
    # Determine highest risk
    if summary["critical"] > 0:
        highest_risk = RiskLevel.CRITICAL
    elif summary["high"] > 0:
        highest_risk = RiskLevel.HIGH
    elif summary["medium"] > 0:
        highest_risk = RiskLevel.MEDIUM
    else:
        highest_risk = RiskLevel.LOW
    
    return RiskAssessResponse(
        document_id=body.document_id,
        flags=all_flags,
        summary=summary,
        highest_risk=highest_risk,
    )
