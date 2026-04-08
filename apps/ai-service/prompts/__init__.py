"""
LexOS Legal Prompt Templates
Centralized prompt engineering for legal AI tasks.
All prompts follow legal domain best practices and include safety guardrails.
"""

from dataclasses import dataclass


@dataclass
class PromptTemplate:
    """A prompt template with metadata."""
    name: str
    template: str
    description: str
    max_tokens: int = 2048
    temperature: float = 0.1
    
    def format(self, **kwargs) -> str:
        """Format the template with the given variables."""
        return self.template.format(**kwargs)


# =============================================================================
# CLAUSE EXTRACTION PROMPTS
# =============================================================================

CLAUSE_EXTRACTION = PromptTemplate(
    name="clause_extraction",
    description="Extract and classify legal clauses from contract text",
    max_tokens=4096,
    temperature=0.1,
    template="""You are a legal document analyzer specializing in US contract law.

TASK: Extract and classify legal clauses from the following contract text.

CLAUSE TYPES TO IDENTIFY:
- indemnification: Provisions where one party agrees to compensate the other for losses
- limitation_of_liability: Caps on damages or liability
- termination_for_convenience: Right to end contract without cause
- termination_for_cause: Right to end contract due to breach
- confidentiality: Non-disclosure obligations
- non_compete: Restrictions on competitive activities
- non_solicitation: Restrictions on soliciting employees/customers
- intellectual_property: IP ownership and licensing terms
- governing_law: Choice of law provisions
- arbitration: Mandatory arbitration clauses
- jury_waiver: Waiver of jury trial rights
- class_action_waiver: Waiver of class action rights
- force_majeure: Excuses for non-performance due to extraordinary events
- assignment: Rights to transfer contract obligations
- notice_requirements: How parties must communicate
- amendment: How contract can be modified
- severability: Effect of invalid provisions
- entire_agreement: Integration clause
- warranty_disclaimer: Limitations on warranties
- data_privacy: Data handling obligations
- insurance_requirements: Required insurance coverage
- compliance_with_laws: Regulatory compliance obligations
- audit_rights: Rights to audit the other party
- most_favored_nation: Price protection clauses

CONTRACT TEXT:
{document_text}

JURISDICTION CONTEXT: {jurisdiction}

INSTRUCTIONS:
1. Identify each distinct clause in the text
2. Classify each clause into one of the types above
3. Extract the exact text of the clause
4. Note the approximate location (page/paragraph if available)
5. Assign a confidence score (0.0-1.0) for your classification

OUTPUT FORMAT (JSON array):
[
  {{
    "type": "clause_type",
    "text": "exact clause text",
    "confidence": 0.95,
    "location": {{"page": 1, "paragraph": 3}},
    "notes": "any relevant observations"
  }}
]

IMPORTANT:
- Only extract actual clauses, not general text
- If unsure about classification, use lower confidence score
- Consider jurisdiction-specific implications
- Flag any unusual or non-standard terms
"""
)


# =============================================================================
# RISK ASSESSMENT PROMPTS
# =============================================================================

RISK_ASSESSMENT = PromptTemplate(
    name="risk_assessment",
    description="Assess legal risks in contract clauses",
    max_tokens=4096,
    temperature=0.2,
    template="""You are a senior legal counsel analyzing contract risks for a US-based law firm.

TASK: Assess the legal risks in the following contract clauses.

CLAUSES TO ANALYZE:
{clauses_json}

JURISDICTION: {jurisdiction}
CLIENT ROLE: {client_role} (e.g., "service provider", "customer", "licensor")
PLAYBOOK STANDARDS:
{playbook_rules}

RISK CATEGORIES:
- critical: Immediate legal exposure, potential litigation, regulatory violation
- high: Significant unfavorable terms, material financial risk
- medium: Non-standard terms requiring negotiation
- low: Minor deviations from standard, acceptable with awareness

ANALYSIS INSTRUCTIONS:
1. Evaluate each clause against:
   - Industry standards for this contract type
   - Playbook rules (if provided)
   - Jurisdiction-specific requirements
   - Client's position and interests

2. For each risk identified, provide:
   - Severity level (critical/high/medium/low)
   - Specific concern description
   - Potential impact
   - Recommended action

3. Consider interactions between clauses

OUTPUT FORMAT (JSON array):
[
  {{
    "clause_id": "reference to clause",
    "clause_type": "type",
    "severity": "critical|high|medium|low",
    "title": "Brief risk title",
    "description": "Detailed risk description",
    "impact": "Potential business/legal impact",
    "recommendation": "Suggested action or negotiation point",
    "jurisdiction_note": "Any state-specific considerations"
  }}
]

CRITICAL RULES:
- Always flag unlimited liability provisions as high risk
- Always flag one-sided indemnification as medium+ risk
- Consider non-compete enforceability by state (CA/OK/ND/MN ban them)
- Note data privacy law applicability (CCPA, VCDPA, etc.)
- Flag missing standard protections (e.g., no limitation of liability)
"""
)


# =============================================================================
# REDLINE SUGGESTION PROMPTS
# =============================================================================

REDLINE_SUGGESTION = PromptTemplate(
    name="redline_suggestion",
    description="Generate redline suggestions for contract clauses",
    max_tokens=4096,
    temperature=0.3,
    template="""You are a contracts attorney drafting redline suggestions.

TASK: Suggest specific text changes to improve the following clause.

ORIGINAL CLAUSE:
{original_text}

CLAUSE TYPE: {clause_type}
CLIENT POSITION: {client_role}
JURISDICTION: {jurisdiction}
PLAYBOOK GUIDANCE:
{playbook_guidance}

IDENTIFIED ISSUES:
{issues}

INSTRUCTIONS:
1. Draft specific replacement language
2. Preserve the clause's core intent while protecting client interests
3. Use standard legal drafting conventions
4. Consider enforceability in the specified jurisdiction
5. Keep changes minimal but effective

OUTPUT FORMAT (JSON):
{{
  "suggested_text": "Your proposed replacement text",
  "changes_summary": "Brief description of changes made",
  "rationale": "Legal reasoning for the changes",
  "confidence": 0.85,
  "alternative_approaches": [
    {{
      "text": "Alternative suggestion if any",
      "when_to_use": "Circumstances where this alternative is preferable"
    }}
  ],
  "negotiation_fallback": "Minimum acceptable position if full change rejected"
}}

DRAFTING STANDARDS:
- Use defined terms consistently
- Avoid ambiguous pronouns
- Include specific timeframes where applicable
- Use "shall" for obligations, "may" for permissions
- Consider mutual vs. one-sided obligations
"""
)


# =============================================================================
# RESEARCH / RAG PROMPTS
# =============================================================================

RESEARCH_QUERY = PromptTemplate(
    name="research_query",
    description="Answer legal research questions using retrieved context",
    max_tokens=4096,
    temperature=0.2,
    template="""You are a legal research assistant helping attorneys analyze contracts.

USER QUESTION:
{query}

RELEVANT CONTEXT (from client's document repository):
{context}

JURISDICTION FOCUS: {jurisdiction}

INSTRUCTIONS:
1. Answer the question based ONLY on the provided context
2. Cite specific documents/clauses when making claims
3. Note any gaps in the available information
4. Highlight jurisdiction-specific considerations
5. Identify any inconsistencies across documents

OUTPUT FORMAT:
Provide a clear, well-structured answer that:
- Directly addresses the user's question
- Cites relevant documents by name
- Notes confidence level in findings
- Suggests follow-up actions if appropriate

IMPORTANT LIMITATIONS:
- Do not invent information not present in the context
- If the context doesn't contain relevant information, say so
- Do not provide legal advice - only analysis and research findings
- Always note that findings require attorney review

Begin your response:
"""
)


# =============================================================================
# OBLIGATION EXTRACTION PROMPTS
# =============================================================================

OBLIGATION_EXTRACTION = PromptTemplate(
    name="obligation_extraction",
    description="Extract contractual obligations with deadlines",
    max_tokens=4096,
    temperature=0.1,
    template="""You are a contracts analyst extracting obligations from legal documents.

TASK: Identify all obligations, deadlines, and deliverables in the following text.

CONTRACT TEXT:
{document_text}

CONTRACT EFFECTIVE DATE: {effective_date}
CONTRACT TERM: {contract_term}

OBLIGATION TYPES:
- payment: Payment obligations with amounts and due dates
- delivery: Deliverables with deadlines
- reporting: Reporting requirements with frequency
- notice: Notice obligations with timeframes
- insurance: Insurance maintenance requirements
- compliance: Ongoing compliance obligations
- renewal: Renewal/termination notice deadlines
- milestone: Project milestones with dates

INSTRUCTIONS:
1. Extract each discrete obligation
2. Identify the obligated party
3. Calculate concrete dates where possible
4. Note recurring vs. one-time obligations
5. Identify any conditions precedent

OUTPUT FORMAT (JSON array):
[
  {{
    "type": "obligation_type",
    "description": "What must be done",
    "obligated_party": "who must do it",
    "deadline": "specific date or relative timing",
    "deadline_type": "fixed_date|relative|recurring",
    "recurrence_pattern": "monthly|quarterly|annually|null",
    "reminder_days_before": 30,
    "source_clause": "reference to contract section",
    "priority": "critical|high|medium|low"
  }}
]

NOTES:
- For relative deadlines, calculate from effective date
- Flag any ambiguous deadlines for manual review
- Consider business days vs. calendar days
- Note any grace periods
"""
)


# =============================================================================
# GUARDRAILS / SAFETY
# =============================================================================

SAFETY_DISCLAIMER = """
IMPORTANT DISCLAIMERS:
1. This analysis is AI-generated and requires attorney review before reliance
2. This does not constitute legal advice
3. Jurisdiction-specific laws may vary and should be independently verified
4. The AI may make errors - all outputs should be validated
5. Privileged or confidential information should be handled appropriately
"""

def add_safety_guardrails(response: str) -> str:
    """Add safety disclaimers to AI-generated responses."""
    return f"{response}\n\n---\n{SAFETY_DISCLAIMER.strip()}"


def validate_response(response: str, expected_format: str = "json") -> bool:
    """Basic validation of AI response format."""
    if expected_format == "json":
        import json
        try:
            json.loads(response)
            return True
        except json.JSONDecodeError:
            return False
    return True


# =============================================================================
# PROMPT REGISTRY
# =============================================================================

PROMPTS = {
    "clause_extraction": CLAUSE_EXTRACTION,
    "risk_assessment": RISK_ASSESSMENT,
    "redline_suggestion": REDLINE_SUGGESTION,
    "research_query": RESEARCH_QUERY,
    "obligation_extraction": OBLIGATION_EXTRACTION,
}


def get_prompt(name: str) -> PromptTemplate:
    """Get a prompt template by name."""
    if name not in PROMPTS:
        raise ValueError(f"Unknown prompt: {name}. Available: {list(PROMPTS.keys())}")
    return PROMPTS[name]
