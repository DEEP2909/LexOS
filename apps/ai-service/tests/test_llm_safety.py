import pytest

import llm_safety
from llm_safety import (
    CircuitBreaker,
    CircuitBreakerConfig,
    CircuitOpenError,
    CircuitState,
    LLMConfig,
    RetryConfig,
    SafeLLMClient,
    add_legal_disclaimer,
    require_confidence,
    retry_with_backoff,
)


@pytest.fixture(autouse=True)
def reset_circuit_breakers():
    llm_safety._circuit_breakers.clear()
    yield
    llm_safety._circuit_breakers.clear()


def test_circuit_breaker_transitions_open_half_open_closed(monkeypatch):
    clock = {"now": 100.0}
    monkeypatch.setattr(llm_safety.time, "time", lambda: clock["now"])

    breaker = CircuitBreaker(
        "unit-test",
        CircuitBreakerConfig(failure_threshold=1, recovery_timeout=10.0, success_threshold=1),
    )
    breaker.record_failure()
    assert breaker.state == CircuitState.OPEN

    clock["now"] = 111.0
    assert breaker.state == CircuitState.HALF_OPEN

    breaker.record_success()
    assert breaker.state == CircuitState.CLOSED


@pytest.mark.asyncio
async def test_retry_with_backoff_retries_then_succeeds(monkeypatch):
    attempts = {"count": 0}
    delays = []

    async def flaky():
        attempts["count"] += 1
        if attempts["count"] < 3:
            raise RuntimeError("temporary failure")
        return "ok"

    async def fake_sleep(delay):
        delays.append(delay)

    monkeypatch.setattr(llm_safety.asyncio, "sleep", fake_sleep)
    result = await retry_with_backoff(
        flaky,
        config=RetryConfig(max_attempts=3, initial_delay=1.0, max_delay=10.0, jitter=False),
    )

    assert result == "ok"
    assert delays == [1.0, 2.0]


@pytest.mark.asyncio
async def test_retry_with_backoff_raises_last_exception(monkeypatch):
    async def always_fail():
        raise ValueError("fatal")

    async def fake_sleep(_delay):
        return None

    monkeypatch.setattr(llm_safety.asyncio, "sleep", fake_sleep)

    with pytest.raises(ValueError, match="fatal"):
        await retry_with_backoff(
            always_fail,
            config=RetryConfig(max_attempts=2, initial_delay=0.01, jitter=False),
        )


def test_estimate_confidence_accounts_for_markers():
    client = SafeLLMClient("http://example.invalid")

    low = client._estimate_confidence({"response": "I think this might be right"})
    high = client._estimate_confidence(
        {"response": "This clearly and definitely applies to the clause language in question."}
    )

    assert 0.1 <= low <= 0.99
    assert 0.1 <= high <= 0.99
    assert high > low


@pytest.mark.asyncio
async def test_generate_uses_fallback_when_primary_confidence_is_low(monkeypatch):
    client = SafeLLMClient(
        "http://example.invalid",
        LLMConfig(primary_model="primary", fallback_model="fallback", max_retries=1),
    )

    async def fake_retry(_func, _model, _prompt, _breaker, config=None, **kwargs):
        return {"response": "I think maybe"}

    async def fake_call_model(model, _prompt, _breaker, **kwargs):
        assert model == "fallback"
        return {
            "response": "This clearly and definitely applies based on the contract language.",
        }

    monkeypatch.setattr(llm_safety, "retry_with_backoff", fake_retry)
    monkeypatch.setattr(client, "_call_model", fake_call_model)

    result = await client.generate("Analyze this clause", min_confidence=0.7)

    assert result["fallback_used"] is True
    assert result["model_used"] == "fallback"
    assert result["confidence"] >= 0.7


@pytest.mark.asyncio
async def test_generate_returns_primary_when_confident(monkeypatch):
    client = SafeLLMClient(
        "http://example.invalid",
        LLMConfig(primary_model="primary", fallback_model="fallback", max_retries=1),
    )

    async def fake_retry(_func, _model, _prompt, _breaker, config=None, **kwargs):
        return {
            "response": "This clearly and definitely applies with specific supporting text.",
        }

    async def should_not_call_fallback(*_args, **_kwargs):
        raise AssertionError("fallback should not be called for confident primary output")

    monkeypatch.setattr(llm_safety, "retry_with_backoff", fake_retry)
    monkeypatch.setattr(client, "_call_model", should_not_call_fallback)

    result = await client.generate("Analyze this clause", min_confidence=0.7)

    assert result["fallback_used"] is False
    assert result["model_used"] == "primary"


@pytest.mark.asyncio
async def test_generate_uses_fallback_when_primary_circuit_is_open(monkeypatch):
    client = SafeLLMClient(
        "http://example.invalid",
        LLMConfig(primary_model="primary", fallback_model="fallback", max_retries=1),
    )

    async def fake_retry(_func, model, _prompt, _breaker, config=None, **kwargs):
        if model == "primary":
            raise CircuitOpenError("primary is open")
        return {"response": "Fallback model response with sufficient details."}

    monkeypatch.setattr(llm_safety, "retry_with_backoff", fake_retry)

    result = await client.generate("Analyze this clause", min_confidence=0.7)

    assert result["fallback_used"] is True
    assert result["model_used"] == "fallback"


@pytest.mark.asyncio
async def test_generate_with_validation_marks_failed_after_retries(monkeypatch):
    client = SafeLLMClient("http://example.invalid")
    calls = {"count": 0}

    async def fake_generate(_prompt, _min_confidence=0.7, **kwargs):
        calls["count"] += 1
        return {"response": f"bad-response-{calls['count']}", "confidence": 0.8}

    monkeypatch.setattr(client, "generate", fake_generate)

    result = await client.generate_with_validation(
        prompt="Give me JSON",
        validator=lambda _text: False,
        max_validation_attempts=2,
    )

    assert calls["count"] == 2
    assert result["validation_failed"] is True
    assert result["confidence"] <= 0.3


@pytest.mark.asyncio
async def test_require_confidence_decorator_flags_low_confidence():
    @require_confidence(min_confidence=0.8)
    async def produce_result():
        return {"response": "ok", "confidence": 0.4}

    result = await produce_result()
    assert result["needs_review"] is True
    assert "below threshold" in result["review_reason"]


def test_add_legal_disclaimer_appends_notice():
    payload = {"response": "analysis"}
    updated = add_legal_disclaimer(payload)

    assert "disclaimer" in updated
    assert "does not constitute legal advice" in updated["disclaimer"]


def test_get_health_status_reports_both_breakers():
    client = SafeLLMClient("http://example.invalid")
    status = client.get_health_status()

    assert set(status.keys()) == {"primary", "fallback"}
    assert status["primary"]["name"] == "llm_primary"
    assert status["fallback"]["name"] == "llm_fallback"
