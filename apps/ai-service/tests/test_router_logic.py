import json

import pytest
from fastapi.testclient import TestClient

from main import app
from routers import assess, extract, obligations

client = TestClient(app)


class _DummyResponse:
    def __init__(self, status_code, payload):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _DummyAsyncClient:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def post(self, *args, **kwargs):
        return self._response


def test_find_sentence_boundaries_expands_to_paragraph():
    text = (
        "Header paragraph.\n\n"
        "Indemnification applies when Seller shall indemnify Buyer from all claims and losses.\n\n"
        "Footer paragraph."
    )
    match_start = text.index("indemnify")
    match_end = match_start + len("indemnify")

    start, end = extract.find_sentence_boundaries(text, match_start, match_end)
    excerpt = text[start:end]

    assert "Seller shall indemnify Buyer" in excerpt
    assert excerpt.startswith("\n")
    assert excerpt.endswith("\n")


def test_extract_clauses_regex_detects_expected_types():
    text = (
        "INDEMNIFICATION. Seller shall indemnify and hold harmless Buyer for third-party claims "
        "and resulting losses, costs, and expenses under this agreement.\n\n"
        "CONFIDENTIALITY. Recipient must keep proprietary information confidential for five years."
    )
    clauses = extract.extract_clauses_regex(text, ["indemnification", "confidentiality"])

    clause_types = {item.clause_type for item in clauses}
    assert "indemnification" in clause_types
    assert "confidentiality" in clause_types
    assert all(0 <= item.start_offset < item.end_offset for item in clauses)


@pytest.mark.asyncio
async def test_extract_clauses_llm_parses_valid_json(monkeypatch):
    response_payload = {
        "response": json.dumps(
            {
                "clauses": [
                    {
                        "clause_type": "confidentiality",
                        "text": "Recipient shall keep information confidential.",
                        "confidence": 0.92,
                    }
                ]
            }
        )
    }
    monkeypatch.setattr(
        extract.httpx,
        "AsyncClient",
        lambda timeout: _DummyAsyncClient(_DummyResponse(200, response_payload)),
    )
    monkeypatch.setattr(extract, "validate_response", lambda _text, _kind: True)

    clauses = await extract.extract_clauses_llm(
        text="Recipient shall keep information confidential.",
        clause_types=["confidentiality"],
        ollama_url="http://example.invalid",
        model="unit-model",
        timeout=10,
    )

    assert len(clauses) == 1
    assert clauses[0].clause_type == "confidentiality"
    assert clauses[0].confidence == 0.92


@pytest.mark.asyncio
async def test_extract_clauses_llm_rejects_non_json_response(monkeypatch):
    monkeypatch.setattr(
        extract.httpx,
        "AsyncClient",
        lambda timeout: _DummyAsyncClient(_DummyResponse(200, {"response": "not-json"})),
    )
    monkeypatch.setattr(extract, "validate_response", lambda _text, _kind: False)

    clauses = await extract.extract_clauses_llm(
        text="Any text",
        clause_types=["indemnification"],
        ollama_url="http://example.invalid",
        model="unit-model",
        timeout=10,
    )

    assert clauses == []


def test_merge_clauses_prefers_llm_and_sorts():
    llm_clause = extract.ExtractedClause(
        clause_type="confidentiality",
        text="LLM confidentiality text",
        start_offset=100,
        end_offset=180,
        confidence=0.9,
        metadata={"method": "llm"},
    )
    overlapping_regex = extract.ExtractedClause(
        clause_type="confidentiality",
        text="Regex confidentiality text",
        start_offset=120,
        end_offset=170,
        confidence=0.7,
        metadata={"method": "regex"},
    )
    distinct_regex = extract.ExtractedClause(
        clause_type="indemnification",
        text="Regex indemnity text",
        start_offset=300,
        end_offset=380,
        confidence=0.7,
        metadata={"method": "regex"},
    )

    merged = extract.merge_clauses([overlapping_regex, distinct_regex], [llm_clause])

    assert len(merged) == 2
    assert merged[0].metadata["method"] == "llm"
    assert merged[1].clause_type == "indemnification"


def test_extract_endpoint_rejects_invalid_clause_type():
    response = client.post(
        "/extract-clauses",
        json={"document_id": "doc-1", "text": "Contract text", "extract_types": ["not_real"]},
    )

    assert response.status_code == 400
    assert "Invalid clause types" in response.json()["detail"]


def test_extract_endpoint_returns_hybrid_when_llm_has_matches(monkeypatch):
    async def fake_llm(*args, **kwargs):
        return [
            extract.ExtractedClause(
                clause_type="confidentiality",
                text="Recipient shall keep data confidential for five years.",
                start_offset=0,
                end_offset=58,
                confidence=0.91,
                metadata={"method": "llm", "clause_id": "cl-1"},
            )
        ]

    monkeypatch.setattr(extract, "extract_clauses_llm", fake_llm)

    response = client.post(
        "/extract-clauses",
        json={
            "document_id": "doc-2",
            "text": "Recipient shall keep data confidential for five years.",
            "extract_types": ["confidentiality"],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["extraction_method"] == "hybrid"
    assert payload["total_found"] >= 1
    assert payload["explanation"]["summary"].startswith("Extracted")


def test_obligation_helpers_detect_recurrence_deadline_and_party():
    assert obligations.detect_recurrence("Reports must be submitted quarterly.") == obligations.RecurrencePattern.QUARTERLY
    assert obligations.extract_deadline("Payment due within 30 days of invoice.") == "30 days"
    assert (
        obligations.detect_party(
            "Acme Corp shall notify Vendor Inc within 10 days.",
            {"client": "Acme Corp", "counterparty": "Vendor Inc"},
        )
        == obligations.ObligationParty.BOTH
    )


def test_extract_obligations_regex_detects_multiple_obligations():
    text = (
        "The Buyer shall pay the invoice within 30 days of receipt. "
        "The Vendor shall provide written notice of delay within 5 days."
    )
    found = obligations.extract_obligations_regex(text, {"client": "Buyer", "counterparty": "Vendor"})

    assert len(found) >= 2
    types = {item.type for item in found}
    assert obligations.ObligationType.PAYMENT in types
    assert obligations.ObligationType.NOTICE in types


@pytest.mark.asyncio
async def test_extract_obligations_llm_normalizes_invalid_enum_values(monkeypatch):
    response_payload = {
        "response": json.dumps(
            [
                {
                    "type": "not-valid",
                    "party": "nobody",
                    "description": "Do something important",
                    "deadline": "15 days",
                    "recurrence": "invalid",
                    "source_text": "Counterparty shall complete onboarding within 15 days.",
                }
            ]
        )
    }
    monkeypatch.setattr(
        obligations.httpx,
        "AsyncClient",
        lambda timeout: _DummyAsyncClient(_DummyResponse(200, response_payload)),
    )
    monkeypatch.setattr(obligations, "validate_response", lambda _text, _kind: True)

    extracted = await obligations.extract_obligations_llm(
        text="Counterparty shall complete onboarding within 15 days.",
        parties=None,
        effective_date=None,
        ollama_url="http://example.invalid",
        model="unit-model",
        timeout=10,
    )

    assert len(extracted) == 1
    assert extracted[0].type == obligations.ObligationType.OTHER
    assert extracted[0].party == obligations.ObligationParty.COUNTERPARTY
    assert extracted[0].recurrence == obligations.RecurrencePattern.ONCE


def test_extract_obligations_endpoint_merges_results_and_summarizes(monkeypatch):
    async def fake_llm(*args, **kwargs):
        return [
            obligations.ExtractedObligation(
                id="llm-1",
                type=obligations.ObligationType.PAYMENT,
                party=obligations.ObligationParty.CLIENT,
                description="Client must pay annual subscription",
                source_text="Client shall pay annual subscription fees.",
                deadline="30 days",
                recurrence=obligations.RecurrencePattern.ANNUALLY,
                trigger_event=None,
                penalty=None,
                start_offset=0,
                end_offset=45,
                confidence=0.9,
            )
        ]

    monkeypatch.setattr(obligations, "extract_obligations_llm", fake_llm)

    response = client.post(
        "/extract-obligations",
        json={
            "document_id": "doc-1234-xyz",
            "text": "Client shall pay annual subscription fees.",
            "parties": {"client": "Client", "counterparty": "Vendor"},
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["total_found"] >= 1
    assert all(item["id"].startswith("obl-doc-1234-") for item in payload["obligations"])
    assert payload["by_type"]["payment"] >= 1
    assert payload["by_party"]["client"] >= 1


def test_assess_with_heuristics_flags_expected_conditions():
    rules = [
        assess.PlaybookRule(
            id="nc-ca",
            clause_type="non_compete",
            condition="non-compete in California",
            risk_level=assess.RiskLevel.CRITICAL,
            message="Non-compete unenforceable in CA.",
            jurisdiction="CA",
        ),
        assess.PlaybookRule(
            id="indem-unlimited",
            clause_type="indemnification",
            condition="unlimited indemnification liability",
            risk_level=assess.RiskLevel.HIGH,
            message="Indemnity has no cap.",
        ),
    ]
    non_compete_clause = assess.ClauseForAssessment(
        id="c1",
        clause_type="non_compete",
        text="Employee agrees not to compete in California for two years.",
    )
    indemnity_clause = assess.ClauseForAssessment(
        id="c2",
        clause_type="indemnification",
        text="Seller shall indemnify Buyer for all claims with unlimited liability.",
    )

    ca_flags = assess.assess_with_heuristics(non_compete_clause, rules, "CA")
    indemnity_flags = assess.assess_with_heuristics(indemnity_clause, rules, None)

    assert any(flag.rule_id == "nc-ca" for flag in ca_flags)
    assert any(flag.rule_id == "indem-unlimited" for flag in indemnity_flags)


@pytest.mark.asyncio
async def test_assess_with_llm_parses_applicable_flags(monkeypatch):
    response_payload = {
        "response": json.dumps(
            [
                {
                    "rule_id": "rule-1",
                    "applies": True,
                    "confidence": 0.83,
                    "suggested_edit": "Add a liability cap.",
                }
            ]
        )
    }
    monkeypatch.setattr(
        assess.httpx,
        "AsyncClient",
        lambda timeout: _DummyAsyncClient(_DummyResponse(200, response_payload)),
    )
    monkeypatch.setattr(assess, "validate_response", lambda _text, _kind: True)

    clause = assess.ClauseForAssessment(
        id="cl-1",
        clause_type="indemnification",
        text="Seller shall indemnify Buyer for all losses.",
    )
    rules = [
        assess.PlaybookRule(
            id="rule-1",
            clause_type="indemnification",
            condition="unlimited indemnification liability",
            risk_level=assess.RiskLevel.HIGH,
            message="Add a cap.",
        )
    ]

    flags = await assess.assess_with_llm(
        clause=clause,
        rules=rules,
        jurisdiction=None,
        ollama_url="http://example.invalid",
        model="unit-model",
        timeout=10,
    )

    assert len(flags) == 1
    assert flags[0].rule_id == "rule-1"
    assert flags[0].risk_level == assess.RiskLevel.HIGH
    assert flags[0].suggested_edit == "Add a liability cap."


def test_assess_endpoint_handles_empty_clause_list():
    response = client.post(
        "/assess-risk",
        json={"document_id": "doc-empty", "clauses": [], "playbook_rules": []},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["flags"] == []
    assert payload["summary"] == {"critical": 0, "high": 0, "medium": 0, "low": 0}
    assert payload["highest_risk"] == "low"


def test_assess_endpoint_falls_back_to_heuristics_when_llm_returns_empty(monkeypatch):
    async def fake_llm(*args, **kwargs):
        return []

    monkeypatch.setattr(assess, "assess_with_llm", fake_llm)

    response = client.post(
        "/assess-risk",
        json={
            "document_id": "doc-risk",
            "jurisdiction": "CA",
            "clauses": [
                {
                    "id": "c1",
                    "clause_type": "non_compete",
                    "text": "Employee agrees not to compete in California for two years.",
                }
            ],
            "playbook_rules": [
                {
                    "id": "r1",
                    "clause_type": "non_compete",
                    "condition": "non-compete in California",
                    "risk_level": "critical",
                    "message": "Unenforceable in CA",
                    "jurisdiction": "CA",
                }
            ],
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["critical"] >= 1
    assert payload["highest_risk"] == "critical"
    assert len(payload["flags"]) >= 1
