"""
LexOS LLM Safety Layer
Circuit breaker, retry logic, timeouts, and fallback models for resilient AI calls
"""

import asyncio
import time
import logging
from typing import Any, Callable, Optional, TypeVar, Generic
from dataclasses import dataclass, field
from enum import Enum
from functools import wraps
import httpx

logger = logging.getLogger(__name__)

T = TypeVar('T')


class CircuitState(str, Enum):
    """Circuit breaker states"""
    CLOSED = "closed"      # Normal operation
    OPEN = "open"          # Failing, reject calls
    HALF_OPEN = "half_open"  # Testing if recovered


@dataclass
class CircuitBreakerConfig:
    """Configuration for circuit breaker"""
    failure_threshold: int = 5      # Failures before opening
    recovery_timeout: float = 30.0  # Seconds before attempting recovery
    success_threshold: int = 2      # Successes needed to close
    timeout: float = 30.0           # Request timeout in seconds


@dataclass
class CircuitBreakerState:
    """State tracking for circuit breaker"""
    state: CircuitState = CircuitState.CLOSED
    failure_count: int = 0
    success_count: int = 0
    last_failure_time: float = 0.0
    last_success_time: float = 0.0


class CircuitBreaker:
    """Circuit breaker for external service calls"""
    
    def __init__(self, name: str, config: Optional[CircuitBreakerConfig] = None):
        self.name = name
        self.config = config or CircuitBreakerConfig()
        self._state = CircuitBreakerState()
    
    @property
    def state(self) -> CircuitState:
        # Check if we should transition from OPEN to HALF_OPEN
        if self._state.state == CircuitState.OPEN:
            if time.time() - self._state.last_failure_time >= self.config.recovery_timeout:
                self._state.state = CircuitState.HALF_OPEN
                self._state.success_count = 0
                logger.info(f"Circuit breaker '{self.name}' transitioning to HALF_OPEN")
        return self._state.state
    
    def record_success(self):
        """Record a successful call"""
        self._state.last_success_time = time.time()
        
        if self._state.state == CircuitState.HALF_OPEN:
            self._state.success_count += 1
            if self._state.success_count >= self.config.success_threshold:
                self._state.state = CircuitState.CLOSED
                self._state.failure_count = 0
                logger.info(f"Circuit breaker '{self.name}' closed after recovery")
        elif self._state.state == CircuitState.CLOSED:
            # Reset failure count on success
            self._state.failure_count = 0
    
    def record_failure(self):
        """Record a failed call"""
        self._state.failure_count += 1
        self._state.last_failure_time = time.time()
        
        if self._state.state == CircuitState.HALF_OPEN:
            # Any failure in half-open reopens the circuit
            self._state.state = CircuitState.OPEN
            logger.warning(f"Circuit breaker '{self.name}' reopened after failure in HALF_OPEN")
        elif self._state.state == CircuitState.CLOSED:
            if self._state.failure_count >= self.config.failure_threshold:
                self._state.state = CircuitState.OPEN
                logger.warning(f"Circuit breaker '{self.name}' opened after {self._state.failure_count} failures")
    
    def can_execute(self) -> bool:
        """Check if a call can be executed"""
        current_state = self.state  # This may transition OPEN -> HALF_OPEN
        return current_state != CircuitState.OPEN
    
    def get_stats(self) -> dict:
        """Get circuit breaker statistics"""
        return {
            "name": self.name,
            "state": self.state.value,
            "failure_count": self._state.failure_count,
            "success_count": self._state.success_count,
            "last_failure": self._state.last_failure_time,
            "last_success": self._state.last_success_time,
        }


# Global circuit breakers for different services
_circuit_breakers: dict[str, CircuitBreaker] = {}


def get_circuit_breaker(name: str, config: Optional[CircuitBreakerConfig] = None) -> CircuitBreaker:
    """Get or create a circuit breaker"""
    if name not in _circuit_breakers:
        _circuit_breakers[name] = CircuitBreaker(name, config)
    return _circuit_breakers[name]


@dataclass
class RetryConfig:
    """Configuration for retry logic"""
    max_attempts: int = 3
    initial_delay: float = 1.0
    max_delay: float = 30.0
    exponential_base: float = 2.0
    jitter: bool = True


async def retry_with_backoff(
    func: Callable[..., Any],
    *args,
    config: Optional[RetryConfig] = None,
    **kwargs
) -> Any:
    """Execute a function with exponential backoff retry"""
    config = config or RetryConfig()
    last_exception = None
    
    for attempt in range(config.max_attempts):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            last_exception = e
            
            if attempt == config.max_attempts - 1:
                # Last attempt, don't wait
                break
            
            # Calculate delay with exponential backoff
            delay = min(
                config.initial_delay * (config.exponential_base ** attempt),
                config.max_delay
            )
            
            # Add jitter to prevent thundering herd
            if config.jitter:
                import random
                delay = delay * (0.5 + random.random())
            
            logger.warning(
                f"Attempt {attempt + 1} failed: {e}. Retrying in {delay:.2f}s"
            )
            await asyncio.sleep(delay)
    
    raise last_exception


@dataclass
class LLMConfig:
    """Configuration for LLM calls"""
    primary_model: str = "mistral:7b-instruct"
    fallback_model: str = "mistral:7b-instruct-q4_K_M"
    timeout: float = 60.0
    max_retries: int = 3
    circuit_breaker_config: CircuitBreakerConfig = field(default_factory=CircuitBreakerConfig)


class SafeLLMClient:
    """
    Safe LLM client with:
    - Circuit breaker
    - Retry with backoff
    - Timeout handling
    - Fallback models
    - Confidence thresholding
    """
    
    def __init__(
        self,
        base_url: str,
        config: Optional[LLMConfig] = None,
    ):
        self.base_url = base_url.rstrip('/')
        self.config = config or LLMConfig()
        self.primary_breaker = get_circuit_breaker(
            "llm_primary",
            self.config.circuit_breaker_config
        )
        self.fallback_breaker = get_circuit_breaker(
            "llm_fallback",
            self.config.circuit_breaker_config
        )
    
    async def _call_model(
        self,
        model: str,
        prompt: str,
        circuit_breaker: CircuitBreaker,
        **kwargs
    ) -> dict:
        """Make a call to a specific model"""
        if not circuit_breaker.can_execute():
            raise CircuitOpenError(f"Circuit breaker for {model} is open")
        
        try:
            async with httpx.AsyncClient(timeout=self.config.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json={
                        "model": model,
                        "prompt": prompt,
                        "stream": False,
                        **kwargs
                    }
                )
                response.raise_for_status()
                result = response.json()
                circuit_breaker.record_success()
                return result
        except Exception as e:
            circuit_breaker.record_failure()
            raise
    
    async def generate(
        self,
        prompt: str,
        min_confidence: float = 0.7,
        **kwargs
    ) -> dict:
        """
        Generate response with fallback handling
        
        Args:
            prompt: The prompt to send
            min_confidence: Minimum confidence threshold
            **kwargs: Additional arguments for the model
        
        Returns:
            Response dict with 'response', 'model_used', 'confidence'
        """
        # Try primary model
        try:
            result = await retry_with_backoff(
                self._call_model,
                self.config.primary_model,
                prompt,
                self.primary_breaker,
                config=RetryConfig(max_attempts=self.config.max_retries),
                **kwargs
            )
            
            confidence = self._estimate_confidence(result)
            
            # If confidence is too low and we have fallback, try fallback
            if confidence < min_confidence and self.fallback_breaker.can_execute():
                logger.info(f"Primary model confidence {confidence:.2f} below threshold, trying fallback")
                try:
                    fallback_result = await self._call_model(
                        self.config.fallback_model,
                        prompt,
                        self.fallback_breaker,
                        **kwargs
                    )
                    fallback_confidence = self._estimate_confidence(fallback_result)
                    
                    # Use fallback if it has higher confidence
                    if fallback_confidence > confidence:
                        return {
                            "response": fallback_result.get("response", ""),
                            "model_used": self.config.fallback_model,
                            "confidence": fallback_confidence,
                            "fallback_used": True,
                        }
                except Exception as e:
                    logger.warning(f"Fallback model failed: {e}")
            
            return {
                "response": result.get("response", ""),
                "model_used": self.config.primary_model,
                "confidence": confidence,
                "fallback_used": False,
            }
            
        except CircuitOpenError:
            # Primary circuit is open, try fallback directly
            logger.warning("Primary model circuit open, using fallback")
            result = await retry_with_backoff(
                self._call_model,
                self.config.fallback_model,
                prompt,
                self.fallback_breaker,
                config=RetryConfig(max_attempts=self.config.max_retries),
                **kwargs
            )
            
            return {
                "response": result.get("response", ""),
                "model_used": self.config.fallback_model,
                "confidence": self._estimate_confidence(result),
                "fallback_used": True,
            }
    
    def _estimate_confidence(self, result: dict) -> float:
        """Estimate confidence from model response"""
        # Use eval_count and tokens as proxy for confidence
        # More tokens often means more certain response
        response = result.get("response", "")
        
        # Base confidence
        confidence = 0.7
        
        # Adjust based on response characteristics
        if len(response) < 50:
            confidence -= 0.1  # Very short responses are suspicious
        
        # Check for uncertainty markers
        uncertainty_markers = [
            "i'm not sure", "i think", "possibly", "might be",
            "unclear", "cannot determine", "insufficient"
        ]
        response_lower = response.lower()
        for marker in uncertainty_markers:
            if marker in response_lower:
                confidence -= 0.15
                break
        
        # Check for confidence markers
        confidence_markers = [
            "clearly", "definitely", "certainly", "specifically states"
        ]
        for marker in confidence_markers:
            if marker in response_lower:
                confidence += 0.1
                break
        
        return max(0.1, min(0.99, confidence))
    
    async def generate_with_validation(
        self,
        prompt: str,
        validator: Callable[[str], bool],
        min_confidence: float = 0.7,
        max_validation_attempts: int = 2,
        **kwargs
    ) -> dict:
        """
        Generate response with output validation
        
        Args:
            prompt: The prompt to send
            validator: Function to validate the response
            min_confidence: Minimum confidence threshold
            max_validation_attempts: Max attempts to get valid response
        """
        for attempt in range(max_validation_attempts):
            result = await self.generate(prompt, min_confidence, **kwargs)
            
            if validator(result["response"]):
                return result
            
            logger.warning(f"Response validation failed (attempt {attempt + 1})")
            
            # Modify prompt for retry
            if attempt < max_validation_attempts - 1:
                prompt = f"{prompt}\n\nPlease ensure your response is properly formatted and complete."
        
        # Return last result with low confidence if validation keeps failing
        result["confidence"] = min(result["confidence"], 0.3)
        result["validation_failed"] = True
        return result
    
    def get_health_status(self) -> dict:
        """Get health status of all circuit breakers"""
        return {
            "primary": self.primary_breaker.get_stats(),
            "fallback": self.fallback_breaker.get_stats(),
        }


class CircuitOpenError(Exception):
    """Raised when circuit breaker is open"""
    pass


# Confidence threshold decorator
def require_confidence(min_confidence: float = 0.7):
    """Decorator to enforce minimum confidence threshold"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            result = await func(*args, **kwargs)
            
            confidence = result.get("confidence", 0)
            if confidence < min_confidence:
                result["needs_review"] = True
                result["review_reason"] = f"Confidence {confidence:.2f} below threshold {min_confidence}"
            
            return result
        return wrapper
    return decorator


# Legal safety disclaimer wrapper
def add_legal_disclaimer(result: dict) -> dict:
    """Add legal disclaimer to AI response"""
    result["disclaimer"] = (
        "AI-generated — requires attorney review. "
        "This analysis is provided for informational purposes only "
        "and does not constitute legal advice."
    )
    return result
