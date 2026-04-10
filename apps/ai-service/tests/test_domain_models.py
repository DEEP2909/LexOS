from datetime import date

from domain_models import (
    ClauseExtraction,
    ClauseType,
    DocumentContext,
    Jurisdiction,
    ObligationExtraction,
    ObligationType,
    RedlineSuggestion,
    RiskAssessmentResult,
    RiskFinding,
    RiskLevel,
    validate_clause_type,
    validate_jurisdiction,
    validate_risk_level,
)


def test_clause_type_parser_handles_exact_and_fuzzy_values():
    assert ClauseType.from_string("governing law") == ClauseType.GOVERNING_LAW
    assert ClauseType.from_string("non-compete") == ClauseType.NON_COMPETE
    assert ClauseType.from_string("ip") == ClauseType.INTELLECTUAL_PROPERTY
    assert ClauseType.from_string("not-a-real-clause") == ClauseType.UNKNOWN


def test_risk_level_numeric_value_maps_severity():
    assert RiskLevel.CRITICAL.numeric_value == 4
    assert RiskLevel.LOW.numeric_value == 1
    assert RiskLevel.INFO.numeric_value == 0


def test_validate_risk_level_supports_string_and_numeric_inputs():
    assert validate_risk_level("high") == RiskLevel.HIGH
    assert validate_risk_level(0.95) == RiskLevel.CRITICAL
    assert validate_risk_level(0.65) == RiskLevel.HIGH
    assert validate_risk_level(0.45) == RiskLevel.MEDIUM
    assert validate_risk_level(0.25) == RiskLevel.LOW
    assert validate_risk_level(-1) == RiskLevel.INFO
    assert validate_risk_level("not-a-level") == RiskLevel.MEDIUM


def test_validate_jurisdiction_supports_codes_and_common_names():
    assert validate_jurisdiction("ca") == Jurisdiction.CA
    assert validate_jurisdiction("California") == Jurisdiction.CA
    assert validate_jurisdiction("new york") == Jurisdiction.NY
    assert validate_jurisdiction("unknown-place") is None
    assert validate_jurisdiction("") is None


def test_validate_clause_type_delegates_to_clause_parser():
    assert validate_clause_type("liability") == ClauseType.LIMITATION_OF_LIABILITY


def test_clause_extraction_to_dict_serializes_expected_shape():
    clause = ClauseExtraction(
        id="c1",
        type=ClauseType.CONFIDENTIALITY,
        text="Keep all information confidential.",
        start_offset=10,
        end_offset=48,
        page_number=2,
        confidence=0.93,
        section_reference="Section 5.1",
    )

    payload = clause.to_dict()
    assert payload["type"] == "confidentiality"
    assert payload["page_number"] == 2
    assert payload["confidence"] == 0.93
    assert payload["section_reference"] == "Section 5.1"


def test_risk_finding_to_dict_rounds_and_truncates():
    finding = RiskFinding(
        id="r1",
        risk_level=RiskLevel.HIGH,
        risk_score=0.81234,
        reason="Broad indemnification with no cap.",
        clause_reference="Section 12.4",
        clause_type=ClauseType.INDEMNIFICATION,
        clause_excerpt="x" * 700,
        confidence=0.98765,
        suggestion="Add mutual cap and carve-outs.",
        jurisdiction_note="CA courts scrutinize broad indemnities.",
    )

    payload = finding.to_dict()
    assert payload["risk_level"] == "high"
    assert payload["risk_score"] == 0.812
    assert payload["confidence"] == 0.988
    assert len(payload["clause_excerpt"]) == 500


def test_risk_assessment_result_to_dict_serializes_findings():
    finding = RiskFinding(
        id="r2",
        risk_level=RiskLevel.MEDIUM,
        risk_score=0.55,
        reason="Notice period is short.",
        clause_reference="Section 3.2",
        clause_type=ClauseType.NOTICE_REQUIREMENTS,
        clause_excerpt="Notice must be provided within 24 hours.",
        confidence=0.75,
    )
    result = RiskAssessmentResult(
        document_id="doc-123",
        overall_risk_level=RiskLevel.MEDIUM,
        overall_risk_score=0.55321,
        findings=[finding],
        summary="One moderate issue identified.",
        recommendation="Increase notice period to 72 hours.",
        confidence=0.80456,
    )

    payload = result.to_dict()
    assert payload["overall_risk_level"] == "medium"
    assert payload["overall_risk_score"] == 0.553
    assert payload["confidence"] == 0.805
    assert payload["findings"][0]["id"] == "r2"
    assert "attorney review" in payload["disclaimer"]


def test_redline_and_obligation_serialization():
    redline = RedlineSuggestion(
        id="s1",
        original_text="Vendor has no liability cap.",
        suggested_text="Vendor liability capped at fees paid in prior 12 months.",
        reason="Add market-standard liability cap.",
        clause_type=ClauseType.LIMITATION_OF_LIABILITY,
        clause_reference="Section 9.1",
        risk_reduction="high_to_medium",
        confidence=0.9177,
    )
    obligation = ObligationExtraction(
        id="o1",
        type=ObligationType.REPORTING,
        description="Provide compliance reports quarterly.",
        responsible_party="Vendor",
        due_date=date(2026, 12, 31),
        recurrence="quarterly",
        clause_reference="Section 4.7",
        confidence=0.8321,
    )

    redline_payload = redline.to_dict()
    obligation_payload = obligation.to_dict()
    assert redline_payload["clause_type"] == "limitation_of_liability"
    assert redline_payload["confidence"] == 0.918
    assert obligation_payload["type"] == "reporting"
    assert obligation_payload["due_date"] == "2026-12-31"
    assert obligation_payload["confidence"] == 0.832


def test_document_context_serialization_includes_optional_jurisdiction():
    context = DocumentContext(
        document_id="doc-abc",
        tenant_id="tenant-1",
        matter_id="matter-2",
        version=3,
        title="Master Services Agreement",
        document_type="MSA",
        jurisdiction=Jurisdiction.DE,
        linked_documents=["doc-a", "doc-b"],
        metadata={"source": "upload"},
    )

    payload = context.to_dict()
    assert payload["jurisdiction"] == "DE"
    assert payload["linked_documents"] == ["doc-a", "doc-b"]
    assert payload["metadata"]["source"] == "upload"
