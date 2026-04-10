from explainability import (
    ConfidenceLevel,
    ExplainabilityBuilder,
    explain_clause_extraction,
    explain_research_result,
    explain_risk_assessment,
)


def test_builder_builds_high_confidence_with_defaults():
    builder = ExplainabilityBuilder("risk_assessment")
    builder.add_step(
        action="Step one",
        observation="Observed contract structure",
        conclusion="Structure is complete",
        confidence=0.9,
    )
    builder.add_step(
        action="Step two",
        observation="Observed indemnification clause",
        conclusion="Clause increases exposure",
        confidence=0.86,
    )
    builder.add_limitation("Custom reviewer note")

    explanation = builder.build("Overall summary")
    payload = explanation.to_dict()

    assert payload["confidence_level"] == ConfidenceLevel.HIGH.value
    assert "Risk scores are based on pattern matching, not legal judgment" in payload["limitations"]
    assert "Custom reviewer note" in payload["limitations"]
    assert "attorney review" in payload["disclaimer"].lower()


def test_clause_reference_excerpt_is_truncated():
    builder = ExplainabilityBuilder("clause_extraction")
    builder.add_clause_reference(
        clause_id="c1",
        clause_type="confidentiality",
        excerpt="x" * 700,
        page_number=4,
        relevance_score=0.95,
    )

    explanation = builder.build("Clause summary")
    reference = explanation.clause_references[0]

    assert reference.excerpt.endswith("...")
    assert len(reference.excerpt) == 503
    assert reference.page_number == 4


def test_explain_risk_assessment_payload_contains_expected_structure():
    result = explain_risk_assessment(
        risk_level="high",
        risk_score=0.82,
        factors=[
            {
                "category": "liability",
                "observation": "Unlimited indemnity",
                "impact": "Raises financial exposure",
                "confidence": 0.88,
                "evidence": ["Section 12.4"],
            }
        ],
        clauses=[
            {
                "id": "cl-1",
                "type": "indemnification",
                "excerpt": "Seller shall indemnify Buyer for all claims.",
                "page": 2,
                "relevance": 0.93,
            }
        ],
    )

    assert "high risk level" in result["summary"]
    assert result["confidence_level"] in {level.value for level in ConfidenceLevel}
    assert len(result["reasoning_chain"]) >= 2
    assert result["clause_references"][0]["clause_id"] == "cl-1"


def test_explain_clause_extraction_tracks_type_counts():
    result = explain_clause_extraction(
        clauses=[
            {"id": "c1", "type": "confidentiality", "excerpt": "Keep data confidential."},
            {"id": "c2", "type": "confidentiality", "excerpt": "NDA survives for 3 years."},
            {"id": "c3", "type": "governing_law", "excerpt": "Delaware law governs."},
        ],
        document_type="msa",
    )

    assert result["summary"].startswith("Extracted 3 clauses")
    assert len(result["reasoning_chain"]) >= 3
    assert result["confidence_level"] in {level.value for level in ConfidenceLevel}


def test_explain_research_result_adds_citations_and_jurisdiction_note():
    result = explain_research_result(
        query="What are California non-compete limits?",
        answer="California generally prohibits employee non-competes.",
        sources=[
            {
                "citation": "Bus. & Prof. Code 16600",
                "type": "statute",
                "jurisdiction": "CA",
                "relevance_note": "Primary authority",
                "url": "https://leginfo.legislature.ca.gov/",
            }
        ],
        jurisdiction="CA",
    )

    assert len(result["legal_citations"]) == 1
    assert any("focused on CA jurisdiction" in limitation for limitation in result["limitations"])
    assert result["reasoning_chain"][0]["action"] == "Analyzed research query"
