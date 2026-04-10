"""
EvidentIS Explainability Layer
Provides reasoning chains, confidence scores, and supporting references for AI outputs
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Optional
from enum import Enum


class ConfidenceLevel(str, Enum):
    """Confidence levels for AI outputs"""
    HIGH = "high"       # >= 0.85 - Strong evidence, clear patterns
    MEDIUM = "medium"   # >= 0.70 - Moderate evidence, some ambiguity
    LOW = "low"         # >= 0.50 - Weak evidence, significant uncertainty
    VERY_LOW = "very_low"  # < 0.50 - Insufficient evidence, speculation


@dataclass
class ClauseReference:
    """Reference to a clause that supports a finding"""
    clause_id: str
    clause_type: str
    excerpt: str
    page_number: Optional[int] = None
    relevance_score: float = 0.0


@dataclass
class LegalCitation:
    """Reference to legal authority supporting a finding"""
    citation: str
    source_type: str  # case, statute, regulation, secondary
    jurisdiction: str
    relevance: str
    url: Optional[str] = None


@dataclass
class ReasoningStep:
    """A single step in the reasoning chain"""
    step_number: int
    action: str  # what was done
    observation: str  # what was found
    conclusion: str  # what it means
    confidence: float
    evidence: List[str] = field(default_factory=list)


@dataclass
class Explanation:
    """Complete explanation for an AI output"""
    summary: str
    reasoning_chain: List[ReasoningStep]
    clause_references: List[ClauseReference]
    legal_citations: List[LegalCitation]
    confidence_score: float
    confidence_level: ConfidenceLevel
    limitations: List[str]
    disclaimer: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "summary": self.summary,
            "reasoning_chain": [
                {
                    "step": step.step_number,
                    "action": step.action,
                    "observation": step.observation,
                    "conclusion": step.conclusion,
                    "confidence": step.confidence,
                    "evidence": step.evidence,
                }
                for step in self.reasoning_chain
            ],
            "clause_references": [
                {
                    "clause_id": ref.clause_id,
                    "clause_type": ref.clause_type,
                    "excerpt": ref.excerpt,
                    "page_number": ref.page_number,
                    "relevance_score": ref.relevance_score,
                }
                for ref in self.clause_references
            ],
            "legal_citations": [
                {
                    "citation": cit.citation,
                    "source_type": cit.source_type,
                    "jurisdiction": cit.jurisdiction,
                    "relevance": cit.relevance,
                    "url": cit.url,
                }
                for cit in self.legal_citations
            ],
            "confidence_score": self.confidence_score,
            "confidence_level": self.confidence_level.value,
            "limitations": self.limitations,
            "disclaimer": self.disclaimer,
        }


class ExplainabilityBuilder:
    """Builder for creating explanations"""
    
    def __init__(self, task_type: str):
        self.task_type = task_type
        self.steps: List[ReasoningStep] = []
        self.clause_refs: List[ClauseReference] = []
        self.citations: List[LegalCitation] = []
        self.limitations: List[str] = []
        self._step_counter = 0
    
    def add_step(
        self,
        action: str,
        observation: str,
        conclusion: str,
        confidence: float = 0.8,
        evidence: Optional[List[str]] = None
    ) -> "ExplainabilityBuilder":
        """Add a reasoning step"""
        self._step_counter += 1
        self.steps.append(ReasoningStep(
            step_number=self._step_counter,
            action=action,
            observation=observation,
            conclusion=conclusion,
            confidence=confidence,
            evidence=evidence or [],
        ))
        return self
    
    def add_clause_reference(
        self,
        clause_id: str,
        clause_type: str,
        excerpt: str,
        page_number: Optional[int] = None,
        relevance_score: float = 0.8
    ) -> "ExplainabilityBuilder":
        """Add a clause reference"""
        self.clause_refs.append(ClauseReference(
            clause_id=clause_id,
            clause_type=clause_type,
            excerpt=excerpt[:500] + "..." if len(excerpt) > 500 else excerpt,
            page_number=page_number,
            relevance_score=relevance_score,
        ))
        return self
    
    def add_citation(
        self,
        citation: str,
        source_type: str,
        jurisdiction: str,
        relevance: str,
        url: Optional[str] = None
    ) -> "ExplainabilityBuilder":
        """Add a legal citation"""
        self.citations.append(LegalCitation(
            citation=citation,
            source_type=source_type,
            jurisdiction=jurisdiction,
            relevance=relevance,
            url=url,
        ))
        return self
    
    def add_limitation(self, limitation: str) -> "ExplainabilityBuilder":
        """Add a limitation note"""
        self.limitations.append(limitation)
        return self
    
    def build(self, summary: str) -> Explanation:
        """Build the final explanation"""
        # Calculate overall confidence
        if self.steps:
            avg_confidence = sum(s.confidence for s in self.steps) / len(self.steps)
        else:
            avg_confidence = 0.5
        
        # Determine confidence level
        if avg_confidence >= 0.85:
            level = ConfidenceLevel.HIGH
        elif avg_confidence >= 0.70:
            level = ConfidenceLevel.MEDIUM
        elif avg_confidence >= 0.50:
            level = ConfidenceLevel.LOW
        else:
            level = ConfidenceLevel.VERY_LOW
        
        # Add default limitations based on task type
        all_limitations = self._get_default_limitations() + self.limitations
        
        return Explanation(
            summary=summary,
            reasoning_chain=self.steps,
            clause_references=self.clause_refs,
            legal_citations=self.citations,
            confidence_score=round(avg_confidence, 3),
            confidence_level=level,
            limitations=all_limitations,
            disclaimer=self._get_disclaimer(),
        )
    
    def _get_default_limitations(self) -> List[str]:
        """Get default limitations based on task type"""
        base = [
            "AI analysis may not capture all nuances of legal language",
            "Results should be verified by a licensed attorney",
        ]
        
        if self.task_type == "risk_assessment":
            base.extend([
                "Risk scores are based on pattern matching, not legal judgment",
                "Jurisdiction-specific nuances may not be fully captured",
            ])
        elif self.task_type == "clause_extraction":
            base.extend([
                "Clause boundaries may not exactly match human interpretation",
                "Some clause types may overlap or be classified differently",
            ])
        elif self.task_type == "research":
            base.extend([
                "Legal citations should be verified in official sources",
                "Case law may have been overruled or modified",
            ])
        
        return base
    
    def _get_disclaimer(self) -> str:
        """Get the standard AI disclaimer"""
        return (
            "AI-generated — requires attorney review. This analysis is provided "
            "for informational purposes only and does not constitute legal advice. "
            "A licensed attorney should review all AI-generated content before reliance."
        )


# Convenience functions for common explanations

def explain_risk_assessment(
    risk_level: str,
    risk_score: float,
    factors: List[Dict[str, Any]],
    clauses: List[Dict[str, Any]],
) -> Dict[str, Any]:
    """Create explanation for a risk assessment"""
    builder = ExplainabilityBuilder("risk_assessment")
    
    # Add reasoning steps
    builder.add_step(
        action="Analyzed contract structure",
        observation=f"Identified {len(clauses)} relevant clauses",
        conclusion="Document contains standard contract elements",
        confidence=0.9,
    )
    
    for i, factor in enumerate(factors[:5]):  # Top 5 factors
        builder.add_step(
            action=f"Evaluated {factor.get('category', 'factor')}",
            observation=factor.get('observation', 'Pattern detected'),
            conclusion=factor.get('impact', 'Contributes to risk score'),
            confidence=factor.get('confidence', 0.75),
            evidence=factor.get('evidence', []),
        )
    
    # Add clause references
    for clause in clauses[:10]:  # Top 10 clauses
        builder.add_clause_reference(
            clause_id=clause.get('id', ''),
            clause_type=clause.get('type', 'unknown'),
            excerpt=clause.get('excerpt', ''),
            page_number=clause.get('page'),
            relevance_score=clause.get('relevance', 0.7),
        )
    
    summary = (
        f"Risk assessment determined a {risk_level} risk level (score: {risk_score:.2f}). "
        f"This conclusion is based on analysis of {len(factors)} risk factors "
        f"and {len(clauses)} contract clauses."
    )
    
    return builder.build(summary).to_dict()


def explain_clause_extraction(
    clauses: List[Dict[str, Any]],
    document_type: str,
) -> Dict[str, Any]:
    """Create explanation for clause extraction"""
    builder = ExplainabilityBuilder("clause_extraction")
    
    builder.add_step(
        action="Parsed document structure",
        observation=f"Document identified as {document_type}",
        conclusion="Applied appropriate extraction model",
        confidence=0.85,
    )
    
    clause_types: dict[str, int] = {}
    for clause in clauses:
        ctype = clause.get('type', 'unknown')
        clause_types[ctype] = clause_types.get(ctype, 0) + 1
    
    builder.add_step(
        action="Extracted clause boundaries",
        observation=f"Found {len(clauses)} total clauses across {len(clause_types)} types",
        conclusion="Clause segmentation completed",
        confidence=0.8,
    )
    
    for ctype, count in list(clause_types.items())[:5]:
        builder.add_step(
            action=f"Classified {ctype} clauses",
            observation=f"Identified {count} instance(s)",
            conclusion=f"{ctype} classification confidence varies by context",
            confidence=0.75,
        )
    
    summary = (
        f"Extracted {len(clauses)} clauses from {document_type} document. "
        f"Identified {len(clause_types)} distinct clause types."
    )
    
    return builder.build(summary).to_dict()


def explain_research_result(
    query: str,
    answer: str,
    sources: List[Dict[str, Any]],
    jurisdiction: Optional[str] = None,
) -> Dict[str, Any]:
    """Create explanation for research result"""
    builder = ExplainabilityBuilder("research")
    
    builder.add_step(
        action="Analyzed research query",
        observation=f"Query: '{query[:100]}...'",
        conclusion="Identified key legal concepts and jurisdiction",
        confidence=0.9,
    )
    
    builder.add_step(
        action="Retrieved relevant sources",
        observation=f"Found {len(sources)} potentially relevant sources",
        conclusion="Sources ranked by relevance and recency",
        confidence=0.85,
    )
    
    # Add citations
    for source in sources[:10]:
        builder.add_citation(
            citation=source.get('citation', ''),
            source_type=source.get('type', 'secondary'),
            jurisdiction=source.get('jurisdiction', jurisdiction or 'General'),
            relevance=source.get('relevance_note', 'Relevant to query'),
            url=source.get('url'),
        )
    
    if jurisdiction:
        builder.add_limitation(
            f"Analysis focused on {jurisdiction} jurisdiction - may not apply elsewhere"
        )
    
    summary = (
        f"Research completed for query regarding {query[:50]}... "
        f"Answer synthesized from {len(sources)} legal sources."
    )
    
    return builder.build(summary).to_dict()
