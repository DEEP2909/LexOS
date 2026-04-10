"""
EvidentIS AI Service - Obligations Router
Extract and track contractual obligations with deadlines.
"""

import json
import logging
import re
from typing import Dict, List, Optional
from enum import Enum

import httpx
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from llm_safety import RetryConfig, retry_with_backoff
from prompts import OBLIGATION_EXTRACTION, validate_response

logger = logging.getLogger(__name__)

router = APIRouter()

LLM_RETRY_CONFIG = RetryConfig(
    max_attempts=3,
    initial_delay=1.0,
    max_delay=10.0,
    exponential_base=2.0,
)


class ObligationType(str, Enum):
    """Type of contractual obligation."""
    PAYMENT = "payment"
    DELIVERY = "delivery"
    NOTICE = "notice"
    REPORTING = "reporting"
    RENEWAL = "renewal"
    TERMINATION = "termination"
    COMPLIANCE = "compliance"
    INSURANCE = "insurance"
    AUDIT = "audit"
    CONFIDENTIALITY = "confidentiality"
    OTHER = "other"


class ObligationParty(str, Enum):
    """Party responsible for obligation."""
    CLIENT = "client"
    COUNTERPARTY = "counterparty"
    BOTH = "both"


class RecurrencePattern(str, Enum):
    """Recurrence pattern for obligations."""
    ONCE = "once"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    ANNUALLY = "annually"


class ExtractedObligation(BaseModel):
    """An extracted contractual obligation."""
    id: str
    type: ObligationType
    party: ObligationParty
    description: str
    source_text: str
    deadline: Optional[str] = Field(
        default=None,
        description="ISO date or relative deadline (e.g., '30 days after notice')"
    )
    recurrence: RecurrencePattern = RecurrencePattern.ONCE
    trigger_event: Optional[str] = Field(
        default=None,
        description="Event that triggers this obligation"
    )
    penalty: Optional[str] = Field(
        default=None,
        description="Consequence of missing obligation"
    )
    start_offset: int
    end_offset: int
    confidence: float


class ExtractObligationsRequest(BaseModel):
    """Obligation extraction request."""
    document_id: str
    text: str = Field(..., max_length=500000)
    effective_date: Optional[str] = Field(
        default=None,
        description="Contract effective date for calculating deadlines (ISO format)"
    )
    parties: Optional[Dict[str, str]] = Field(
        default=None,
        description="Party names mapping, e.g., {'client': 'Acme Corp', 'counterparty': 'Vendor Inc'}"
    )


class ExtractObligationsResponse(BaseModel):
    """Obligation extraction response."""
    document_id: str
    obligations: List[ExtractedObligation]
    total_found: int
    by_type: Dict[str, int]
    by_party: Dict[str, int]


# Patterns for detecting obligation keywords
OBLIGATION_PATTERNS = {
    ObligationType.PAYMENT: [
        r"(?i)shall\s+pay",
        r"(?i)payment\s+(?:due|shall|must)",
        r"(?i)within\s+\d+\s+days.*(?:pay|invoice)",
        r"(?i)net\s+\d+",
    ],
    ObligationType.DELIVERY: [
        r"(?i)shall\s+deliver",
        r"(?i)delivery\s+(?:date|deadline|within)",
        r"(?i)provide\s+within",
    ],
    ObligationType.NOTICE: [
        r"(?i)shall\s+(?:provide|give)\s+(?:written\s+)?notice",
        r"(?i)notify.*within",
        r"(?i)notice\s+(?:shall|must|required)",
    ],
    ObligationType.REPORTING: [
        r"(?i)shall\s+(?:provide|submit|deliver)\s+(?:a\s+)?report",
        r"(?i)reporting\s+(?:requirement|obligation)",
        r"(?i)quarterly\s+report",
        r"(?i)annual\s+report",
    ],
    ObligationType.RENEWAL: [
        r"(?i)renewal\s+(?:notice|deadline|term)",
        r"(?i)auto-?renew",
        r"(?i)days\s+(?:prior|before).*(?:renewal|expiration)",
    ],
    ObligationType.TERMINATION: [
        r"(?i)terminat\w+\s+(?:upon|within|by)",
        r"(?i)right\s+to\s+terminate",
        r"(?i)notice\s+of\s+termination",
    ],
    ObligationType.COMPLIANCE: [
        r"(?i)shall\s+comply",
        r"(?i)compliance\s+(?:with|requirement)",
        r"(?i)maintain\s+compliance",
    ],
    ObligationType.INSURANCE: [
        r"(?i)shall\s+maintain.*insurance",
        r"(?i)insurance\s+(?:requirement|coverage|certificate)",
        r"(?i)provide\s+(?:proof|certificate)\s+of\s+insurance",
    ],
    ObligationType.AUDIT: [
        r"(?i)audit\s+(?:right|upon\s+request)",
        r"(?i)shall\s+permit.*audit",
        r"(?i)access\s+to\s+(?:records|books)",
    ],
    ObligationType.CONFIDENTIALITY: [
        r"(?i)shall\s+(?:maintain|keep).*confidential",
        r"(?i)confidentiality\s+(?:obligation|requirement)",
        r"(?i)not\s+disclose",
    ],
}

# Deadline extraction patterns
DEADLINE_PATTERNS = [
    r"within\s+(\d+)\s+(days?|weeks?|months?|years?)",
    r"(\d+)\s+(days?|weeks?|months?|years?)\s+(?:after|from|following)",
    r"no\s+later\s+than\s+(\d+)\s+(days?|weeks?|months?|years?)",
    r"by\s+(\d+)\s+(days?|weeks?|months?|years?)",
    r"prior\s+to\s+(\d+)\s+(days?|weeks?|months?|years?)",
]

# Recurrence detection
RECURRENCE_PATTERNS = {
    RecurrencePattern.DAILY: [r"(?i)daily", r"(?i)each\s+day", r"(?i)every\s+day"],
    RecurrencePattern.WEEKLY: [r"(?i)weekly", r"(?i)each\s+week", r"(?i)every\s+week"],
    RecurrencePattern.MONTHLY: [r"(?i)monthly", r"(?i)each\s+month", r"(?i)every\s+month"],
    RecurrencePattern.QUARTERLY: [r"(?i)quarterly", r"(?i)each\s+quarter", r"(?i)every\s+(?:three|3)\s+months"],
    RecurrencePattern.ANNUALLY: [r"(?i)annual(?:ly)?", r"(?i)each\s+year", r"(?i)every\s+year"],
}


def detect_recurrence(text: str) -> RecurrencePattern:
    """Detect recurrence pattern in text."""
    for pattern, regexes in RECURRENCE_PATTERNS.items():
        for regex in regexes:
            if re.search(regex, text):
                return pattern
    return RecurrencePattern.ONCE


def extract_deadline(text: str) -> Optional[str]:
    """Extract deadline from text."""
    for pattern in DEADLINE_PATTERNS:
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            number = match.group(1)
            unit = match.group(2).lower()
            # Normalize unit
            if unit.endswith('s'):
                unit = unit[:-1]
            return f"{number} {unit}s"
    return None


def detect_party(text: str, parties: Optional[Dict[str, str]]) -> ObligationParty:
    """Detect which party has the obligation."""
    text_lower = text.lower()
    
    # Check for specific party names
    if parties:
        client_name = parties.get("client", "").lower()
        counterparty_name = parties.get("counterparty", "").lower()
        
        has_client = client_name and client_name in text_lower
        has_counterparty = counterparty_name and counterparty_name in text_lower
        
        if has_client and has_counterparty:
            return ObligationParty.BOTH
        elif has_client:
            return ObligationParty.CLIENT
        elif has_counterparty:
            return ObligationParty.COUNTERPARTY
    
    # Generic detection
    if "each party" in text_lower or "both parties" in text_lower or "parties shall" in text_lower:
        return ObligationParty.BOTH
    elif "vendor" in text_lower or "provider" in text_lower or "supplier" in text_lower:
        return ObligationParty.COUNTERPARTY
    elif "customer" in text_lower or "client" in text_lower or "buyer" in text_lower:
        return ObligationParty.CLIENT
    
    return ObligationParty.COUNTERPARTY  # Default assumption


def extract_obligations_regex(
    text: str,
    parties: Optional[Dict[str, str]]
) -> List[ExtractedObligation]:
    """Extract obligations using regex patterns."""
    obligations: list[ExtractedObligation] = []
    seen_ranges: set[tuple[int, int]] = set()
    
    for obl_type, patterns in OBLIGATION_PATTERNS.items():
        for pattern in patterns:
            for match in re.finditer(pattern, text):
                # Find sentence boundaries
                start = match.start()
                end = match.end()
                
                # Expand to sentence
                while start > 0 and text[start - 1] not in '.!?\n':
                    start -= 1
                while end < len(text) and text[end] not in '.!?\n':
                    end += 1
                
                # Skip duplicates
                range_key = (start // 100, end // 100)
                if range_key in seen_ranges:
                    continue
                seen_ranges.add(range_key)
                
                source_text = text[start:end].strip()
                
                # Skip if too short
                if len(source_text) < 30:
                    continue
                
                # Extract details
                deadline = extract_deadline(source_text)
                recurrence = detect_recurrence(source_text)
                party = detect_party(source_text, parties)
                
                obligations.append(ExtractedObligation(
                    id=f"obl-{len(obligations)}",
                    type=obl_type,
                    party=party,
                    description=f"{obl_type.value.title()} obligation",
                    source_text=source_text,
                    deadline=deadline,
                    recurrence=recurrence,
                    trigger_event=None,
                    penalty=None,
                    start_offset=start,
                    end_offset=end,
                    confidence=0.7,
                ))
    
    return obligations


async def extract_obligations_llm(
    text: str,
    parties: Optional[Dict[str, str]],
    effective_date: Optional[str],
    ollama_url: str,
    model: str,
    timeout: int
) -> List[ExtractedObligation]:
    """Use LLM to extract obligations."""
    # Truncate text if too long
    max_chars = 30000
    if len(text) > max_chars:
        text = text[:max_chars]
    
    enriched_text = text
    if parties:
        enriched_text = (
            f"Parties: Client = {parties.get('client', 'Unknown')}, "
            f"Counterparty = {parties.get('counterparty', 'Unknown')}\n\n{text}"
        )

    prompt = OBLIGATION_EXTRACTION.format(
        document_text=enriched_text,
        effective_date=effective_date or "Not specified",
        contract_term="Not specified",
    )
    prompt += """

Return ONLY a JSON array where each item includes:
{
  "type": "payment|delivery|notice|reporting|renewal|termination|compliance|insurance|audit|confidentiality|other",
  "party": "client|counterparty|both",
  "description": "brief description of the obligation",
  "deadline": "deadline if specified (e.g., '30 days', 'quarterly')",
  "recurrence": "once|daily|weekly|monthly|quarterly|annually",
  "trigger_event": "event that triggers this obligation if any",
  "penalty": "consequence of missing obligation if stated",
  "source_text": "exact text containing this obligation"
}

No additional prose."""

    payload = {
        "model": model,
        "prompt": prompt,
        "stream": False,
        "format": "json",
        "options": {"temperature": 0.1},
    }

    async def _call_llm() -> dict:
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
            logger.error("Obligation extraction model returned non-JSON content")
            return []
        obligations_data = json.loads(response_text)

        if isinstance(obligations_data, dict) and "obligations" in obligations_data:
            obligations_data = obligations_data["obligations"]

        obligations: list[ExtractedObligation] = []
        for i, item in enumerate(obligations_data):
            source_text = item.get("source_text", "")
            start = text.find(source_text[:50]) if source_text else 0

            try:
                obl_type = ObligationType(item.get("type", "other"))
            except ValueError:
                obl_type = ObligationType.OTHER

            try:
                party = ObligationParty(item.get("party", "counterparty"))
            except ValueError:
                party = ObligationParty.COUNTERPARTY

            try:
                recurrence = RecurrencePattern(item.get("recurrence", "once"))
            except ValueError:
                recurrence = RecurrencePattern.ONCE

            obligations.append(ExtractedObligation(
                id=f"obl-llm-{i}",
                type=obl_type,
                party=party,
                description=item.get("description", ""),
                source_text=source_text,
                deadline=item.get("deadline"),
                recurrence=recurrence,
                trigger_event=item.get("trigger_event"),
                penalty=item.get("penalty"),
                start_offset=max(0, start),
                end_offset=max(0, start + len(source_text)),
                confidence=0.85,
            ))

        return obligations

    except Exception as e:
        logger.error(f"LLM obligation extraction failed: {e}")
        return []


@router.post("", response_model=ExtractObligationsResponse)
async def extract_obligations(
    request: Request,
    body: ExtractObligationsRequest
) -> ExtractObligationsResponse:
    """
    Extract contractual obligations from document text.
    
    Features:
    - Identifies payment, delivery, notice, and other obligation types
    - Extracts deadlines and recurrence patterns
    - Detects responsible party (client vs counterparty)
    - Identifies trigger events and penalties
    
    Useful for obligation tracking and calendar generation.
    """
    settings = request.app.state.settings
    
    if not body.text:
        raise HTTPException(status_code=400, detail="Text required")
    
    # Regex extraction
    regex_obligations = extract_obligations_regex(body.text, body.parties)
    logger.info(f"Regex found {len(regex_obligations)} obligations")
    
    # LLM extraction for better accuracy
    llm_obligations: list[ExtractedObligation] = []
    if len(body.text) < 100000:
        llm_obligations = await extract_obligations_llm(
            body.text,
            body.parties,
            body.effective_date,
            settings.ollama_base_url,
            settings.ollama_model_extract,
            settings.ollama_timeout
        )
        logger.info(f"LLM found {len(llm_obligations)} obligations")
    
    # Merge results (prefer LLM)
    if llm_obligations:
        all_obligations: list[ExtractedObligation] = llm_obligations
        # Add unique regex ones
        llm_ranges = {(o.start_offset // 200, o.end_offset // 200) for o in llm_obligations}
        for obl in regex_obligations:
            range_key = (obl.start_offset // 200, obl.end_offset // 200)
            if range_key not in llm_ranges:
                all_obligations.append(obl)
    else:
        all_obligations = regex_obligations
    
    # Re-assign IDs
    for i, obl in enumerate(all_obligations):
        obl.id = f"obl-{body.document_id[:8]}-{i}"
    
    # Calculate summaries
    by_type: dict[str, int] = {}
    for obl in all_obligations:
        by_type[obl.type.value] = by_type.get(obl.type.value, 0) + 1
    
    by_party: dict[str, int] = {}
    for obl in all_obligations:
        by_party[obl.party.value] = by_party.get(obl.party.value, 0) + 1
    
    return ExtractObligationsResponse(
        document_id=body.document_id,
        obligations=all_obligations,
        total_found=len(all_obligations),
        by_type=by_type,
        by_party=by_party,
    )
