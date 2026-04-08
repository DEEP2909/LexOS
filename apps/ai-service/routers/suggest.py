"""
LexOS AI Service - Redline Suggestions Router
Generate intelligent contract redline suggestions.
"""

import json
import logging
from typing import List, Optional
from enum import Enum

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from prompts import REDLINE_SUGGESTION, add_safety_guardrails, validate_response

logger = logging.getLogger(__name__)

router = APIRouter()


class SuggestionType(str, Enum):
    """Type of redline suggestion."""
    DELETION = "deletion"
    INSERTION = "insertion"
    REPLACEMENT = "replacement"
    COMMENT = "comment"


class RedlineSuggestion(BaseModel):
    """A single redline suggestion."""
    id: str
    type: SuggestionType
    original_text: str
    suggested_text: str
    rationale: str
    clause_type: Optional[str] = None
    confidence: float
    start_offset: int
    end_offset: int


class SuggestRedlineRequest(BaseModel):
    """Request for redline suggestions."""
    document_id: str
    clause_id: str
    clause_type: str
    clause_text: str = Field(..., max_length=10000)
    flag_message: Optional[str] = Field(
        default=None,
        description="The risk flag message that triggered this request"
    )
    playbook_position: Optional[str] = Field(
        default=None,
        description="Desired position per playbook (e.g., 'mutual indemnification', 'cap at 12 months')"
    )
    jurisdiction: Optional[str] = None


class SuggestRedlineResponse(BaseModel):
    """Redline suggestions response."""
    document_id: str
    clause_id: str
    suggestions: List[RedlineSuggestion]
    disclaimer: str


# Standard legal language templates for common modifications
LEGAL_TEMPLATES = {
    "mutual_indemnification": """Each party (the "Indemnifying Party") shall indemnify, defend, and hold harmless the other party and its officers, directors, employees, agents, successors, and assigns (collectively, the "Indemnified Parties") from and against any and all claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising out of or relating to: (a) the Indemnifying Party's breach of this Agreement; (b) the Indemnifying Party's gross negligence or willful misconduct; or (c) any third-party claims arising from the Indemnifying Party's performance under this Agreement.""",
    
    "liability_cap": """IN NO EVENT SHALL EITHER PARTY'S TOTAL LIABILITY UNDER THIS AGREEMENT EXCEED THE GREATER OF (A) THE AMOUNTS PAID OR PAYABLE BY [CLIENT] TO [VENDOR] DURING THE TWELVE (12) MONTH PERIOD IMMEDIATELY PRECEDING THE EVENT GIVING RISE TO SUCH LIABILITY, OR (B) [AMOUNT]. THIS LIMITATION SHALL NOT APPLY TO (I) BREACHES OF CONFIDENTIALITY OBLIGATIONS, (II) INDEMNIFICATION OBLIGATIONS, (III) GROSS NEGLIGENCE OR WILLFUL MISCONDUCT, OR (IV) INFRINGEMENT OF INTELLECTUAL PROPERTY RIGHTS.""",
    
    "cure_period": """Upon any material breach of this Agreement by either party, the non-breaching party shall provide written notice specifying the nature of the breach. The breaching party shall have thirty (30) days from receipt of such notice to cure the breach. If the breach is not cured within such period, the non-breaching party may terminate this Agreement immediately upon written notice.""",
    
    "termination_notice": """Either party may terminate this Agreement for convenience upon thirty (30) days' prior written notice to the other party. Upon such termination, [VENDOR] shall be entitled to payment for all services performed and expenses incurred through the effective date of termination.""",
    
    "confidentiality_term": """The obligations of confidentiality under this Section shall survive termination or expiration of this Agreement for a period of three (3) years; provided, however, that with respect to trade secrets, such obligations shall continue for so long as the information qualifies as a trade secret under applicable law.""",
    
    "legal_disclosure": """Notwithstanding the foregoing, the Receiving Party may disclose Confidential Information to the extent required by applicable law, regulation, or legal process, provided that the Receiving Party (a) gives the Disclosing Party prompt written notice of such requirement (to the extent legally permitted), (b) cooperates with the Disclosing Party's efforts to obtain a protective order, and (c) discloses only the minimum information required.""",
}


async def generate_suggestions_llm(
    clause_text: str,
    clause_type: str,
    flag_message: Optional[str],
    playbook_position: Optional[str],
    jurisdiction: Optional[str],
    ollama_url: str,
    model: str,
    timeout: int
) -> List[dict]:
    """
    Use LLM to generate redline suggestions.
    """
    playbook_guidance = playbook_position or "No additional playbook guidance provided."
    issues = flag_message or "No specific risk flag was provided."
    if clause_type in ["indemnification", "limitation_of_liability", "termination_for_cause", "confidentiality"]:
        issues += "\n- Use industry-standard protective language for this clause type."

    prompt = REDLINE_SUGGESTION.format(
        original_text=clause_text,
        clause_type=clause_type,
        client_role="client-side counsel",
        jurisdiction=jurisdiction or "US",
        playbook_guidance=playbook_guidance,
        issues=issues,
    )
    prompt += """

Return ONLY a JSON array where each item includes:
{
  "type": "deletion" | "insertion" | "replacement",
  "original_text": "exact text from clause to modify",
  "suggested_text": "replacement or new text",
  "rationale": "legal reasoning for this change"
}

No additional prose."""

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.post(
                f"{ollama_url}/api/generate",
                json={
                    "model": model,
                    "prompt": prompt,
                    "stream": False,
                    "format": "json",
                    "options": {"temperature": 0.2}
                }
            )
            
            if response.status_code != 200:
                return []
            
            result = response.json()
            response_text = result.get("response", "[]")
            if not validate_response(response_text, "json"):
                logger.error("Redline model returned non-JSON content")
                return []
            suggestions = json.loads(response_text)
            
            if isinstance(suggestions, dict) and "suggestions" in suggestions:
                suggestions = suggestions["suggestions"]
            
            return suggestions
            
    except Exception as e:
        logger.error(f"LLM redline generation failed: {e}")
        return []


def generate_template_suggestions(
    clause_text: str,
    clause_type: str,
    flag_message: Optional[str]
) -> List[dict]:
    """
    Generate template-based suggestions as fallback.
    """
    suggestions = []
    text_lower = clause_text.lower()
    
    # Mutual indemnification suggestion
    if clause_type == "indemnification" and "mutual" not in text_lower:
        suggestions.append({
            "type": "replacement",
            "original_text": clause_text[:200] + "..." if len(clause_text) > 200 else clause_text,
            "suggested_text": LEGAL_TEMPLATES["mutual_indemnification"],
            "rationale": "Convert one-way indemnification to mutual indemnification for balanced risk allocation."
        })
    
    # Liability cap suggestion
    if clause_type == "limitation_of_liability":
        if "cap" not in text_lower and "limit" not in text_lower:
            suggestions.append({
                "type": "replacement",
                "original_text": clause_text,
                "suggested_text": LEGAL_TEMPLATES["liability_cap"],
                "rationale": "Add explicit liability cap to limit exposure. Standard is 12 months of fees."
            })
    
    # Cure period suggestion
    if clause_type == "termination_for_cause" and "cure" not in text_lower:
        suggestions.append({
            "type": "insertion",
            "original_text": "",
            "suggested_text": LEGAL_TEMPLATES["cure_period"],
            "rationale": "Add 30-day cure period to allow opportunity to remedy breach before termination."
        })
    
    # Termination notice suggestion
    if clause_type == "termination_for_convenience" and "notice" not in text_lower:
        suggestions.append({
            "type": "replacement",
            "original_text": clause_text,
            "suggested_text": LEGAL_TEMPLATES["termination_notice"],
            "rationale": "Require 30-day notice for termination to allow adequate transition time."
        })
    
    # Confidentiality term suggestion
    if clause_type == "confidentiality" and ("perpetual" in text_lower or "indefinite" in text_lower):
        suggestions.append({
            "type": "replacement",
            "original_text": clause_text,
            "suggested_text": LEGAL_TEMPLATES["confidentiality_term"],
            "rationale": "Limit confidentiality term to 3 years (5 for trade secrets) per industry standard."
        })
    
    # Legal disclosure carveout
    if clause_type == "confidentiality" and "legal" not in text_lower and "compel" not in text_lower:
        suggestions.append({
            "type": "insertion",
            "original_text": "",
            "suggested_text": LEGAL_TEMPLATES["legal_disclosure"],
            "rationale": "Add standard carveout for legally compelled disclosure."
        })
    
    return suggestions


@router.post("", response_model=SuggestRedlineResponse)
async def suggest_redlines(
    request: Request,
    body: SuggestRedlineRequest
) -> SuggestRedlineResponse:
    """
    Generate intelligent redline suggestions for a contract clause.
    
    Features:
    - LLM-powered suggestions based on clause context
    - Template-based suggestions for common scenarios
    - Playbook-aligned recommendations
    - State-specific considerations
    
    All suggestions include legal rationale.
    """
    settings = request.app.state.settings
    
    if not body.clause_text:
        raise HTTPException(status_code=400, detail="Clause text required")
    
    # Try LLM suggestions first
    llm_suggestions = await generate_suggestions_llm(
        body.clause_text,
        body.clause_type,
        body.flag_message,
        body.playbook_position,
        body.jurisdiction,
        settings.ollama_base_url,
        settings.ollama_model_extract,
        settings.ollama_timeout
    )
    
    # Add template suggestions as fallback/supplement
    template_suggestions = generate_template_suggestions(
        body.clause_text,
        body.clause_type,
        body.flag_message
    )
    
    # Combine and deduplicate
    all_suggestions = llm_suggestions + template_suggestions
    
    # Convert to response model
    suggestions = []
    for i, s in enumerate(all_suggestions[:5]):  # Limit to 5 suggestions
        original = s.get("original_text", "")
        start = body.clause_text.find(original) if original else 0
        end = start + len(original) if start >= 0 else len(body.clause_text)
        
        suggestions.append(RedlineSuggestion(
            id=f"sug-{body.clause_id}-{i}",
            type=SuggestionType(s.get("type", "replacement")),
            original_text=original,
            suggested_text=s.get("suggested_text", ""),
            rationale=s.get("rationale", ""),
            clause_type=body.clause_type,
            confidence=0.8 if i < len(llm_suggestions) else 0.6,
            start_offset=max(0, start),
            end_offset=max(0, end),
        ))
    
    return SuggestRedlineResponse(
        document_id=body.document_id,
        clause_id=body.clause_id,
        suggestions=suggestions,
        disclaimer=add_safety_guardrails(
            "AI-generated suggestions — requires attorney review before implementation."
        ),
    )
