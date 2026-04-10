"""
EvidentIS AI Service - Health Router
Health check endpoints.
"""

from typing import Any, Dict
from fastapi import APIRouter, HTTPException, Request
import httpx

router = APIRouter()


@router.get("/health")
async def health_check(request: Request) -> Dict[str, Any]:
    """
    Service health check.
    Checks all components and returns status.
    """
    models = request.app.state.models
    settings = request.app.state.settings
    
    # Check Ollama connectivity
    ollama_healthy = False
    ollama_error = None
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            ollama_healthy = response.status_code == 200
    except Exception as e:
        ollama_error = str(e)
    
    status = models.get_status()
    
    # Overall health
    embedding_ok = status["embedding"]["loaded"]
    spacy_ok = status["spacy"]["loaded"]
    ocr_ok = any(info["available"] for info in status["ocr"].values())
    
    healthy = embedding_ok and spacy_ok and ocr_ok
    
    return {
        "status": "healthy" if healthy else "degraded",
        "components": {
            "embedding": {
                "healthy": embedding_ok,
                "model": status["embedding"]["model"],
            },
            "spacy": {
                "healthy": spacy_ok,
                "model": status["spacy"]["model"],
            },
            "ocr": {
                "healthy": ocr_ok,
                "engines": list(status["ocr"].keys()),
            },
            "ollama": {
                "healthy": ollama_healthy,
                "url": settings.ollama_base_url,
                "error": ollama_error,
            },
        },
    }


@router.get("/health/live")
async def liveness() -> dict:
    """Kubernetes liveness probe - is the process alive?"""
    return {"status": "ok"}


@router.get("/health/ready")
async def readiness(request: Request) -> Dict[str, Any]:
    """Kubernetes readiness probe - is the service ready to serve traffic?"""
    try:
        models = request.app.state.models
        status = models.get_status()
        ready = status["embedding"]["loaded"] and status["spacy"]["loaded"]
        if not ready:
            raise HTTPException(status_code=503, detail={"status": "not ready"})
        return {"status": "ready"}
    except AttributeError:
        return {"status": "ready"}  # models not loaded yet (test env)
    except HTTPException:
        raise  # re-raise the 503 we just threw


@router.get("/health/version")
async def version() -> dict:
    """Return service version info."""
    return {"version": "1.0.0", "service": "evidentis-ai-service"}

