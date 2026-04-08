"""
LexOS AI Service - Health Router
Health check endpoints.
"""

from typing import Any, Dict
from fastapi import APIRouter, Request
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
