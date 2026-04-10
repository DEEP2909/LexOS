"""
EvidentIS AI Service
FastAPI application for AI/ML capabilities including OCR, embeddings, 
clause extraction, risk assessment, and semantic research.
"""

import logging
from contextlib import asynccontextmanager
from typing import Any, Dict

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from config import get_settings
from models.loader import ModelRegistry
from routers import ocr, embed, extract, assess, research, suggest, obligations, health
from evaluation.evaluator import run_evaluation
from evaluation.scoring import compute_metrics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)

settings = get_settings()

# Global model registry
model_registry: ModelRegistry | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle management - load models on startup."""
    global model_registry
    
    logger.info("Starting EvidentIS AI Service...")
    logger.info(f"Embedding model: {settings.embedding_model}")
    logger.info(f"OCR engines: {settings.ocr_engine_list}")
    logger.info(f"LLM model: {settings.ollama_model_extract}")
    
    # Initialize model registry and load models
    model_registry = ModelRegistry(settings)
    await model_registry.load_all()
    
    # Store in app state for access in routes
    app.state.models = model_registry
    app.state.settings = settings
    
    logger.info("AI Service ready")
    
    yield
    
    # Cleanup on shutdown
    logger.info("Shutting down AI Service...")
    if model_registry:
        await model_registry.unload_all()


# Create FastAPI app
app = FastAPI(
    title="EvidentIS AI Service",
    description="AI/ML service for legal document analysis",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS configuration
# AI service is internal-only (called by API server, not browsers)
# In production, CORS should be disabled or restricted to the API server only
if settings.environment == "development":
    # Allow localhost for development/testing
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:4000"],  # API server only
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Content-Type", "Authorization", "X-Tenant-ID"],
    )
else:
    # Production: No CORS needed (internal service)
    # If CORS is required, configure via environment variable
    allowed_origins = settings.cors_origins if hasattr(settings, 'cors_origins') else []
    if allowed_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=allowed_origins,
            allow_credentials=False,
            allow_methods=["GET", "POST"],
            allow_headers=["Content-Type", "Authorization", "X-Tenant-ID"],
        )

# Register routers
app.include_router(health.router, tags=["Health"])
app.include_router(ocr.router, prefix="/ocr", tags=["OCR"])
app.include_router(embed.router, prefix="/embed", tags=["Embeddings"])
app.include_router(extract.router, prefix="/extract-clauses", tags=["Extraction"])
app.include_router(assess.router, prefix="/assess-risk", tags=["Risk Assessment"])
app.include_router(research.router, prefix="/research", tags=["Research"])
app.include_router(suggest.router, prefix="/suggest-redline", tags=["Suggestions"])
app.include_router(obligations.router, prefix="/extract-obligations", tags=["Obligations"])


@app.get("/")
async def root() -> Dict[str, Any]:
    """Root endpoint with service info."""
    return {
        "service": "EvidentIS AI Service",
        "version": "1.0.0",
        "status": "running",
        "models": {
            "embedding": settings.embedding_model,
            "llm": settings.ollama_model_extract,
            "ocr": settings.ocr_engine_list,
        }
    }


@app.get("/models")
async def list_models() -> Dict[str, Any]:
    """List loaded models and their status."""
    if not model_registry:
        raise HTTPException(status_code=503, detail="Models not loaded")
    
    return {
        "models": model_registry.get_status(),
        "gpu_enabled": settings.gpu_enabled,
    }


@app.post("/eval/run", include_in_schema=False)
async def run_eval(dataset: str = "default") -> Dict[str, Any]:
    """
    Internal endpoint to run AI model evaluation.
    Used for benchmarking clause extraction and risk assessment accuracy.
    """
    from evaluation.datasets import load_golden_dataset
    
    try:
        load_golden_dataset(dataset)
        
        # Define a mock inference function for testing
        async def inference_fn(input_data: Dict[str, Any]) -> Dict[str, Any]:
            # In production, this would call the actual AI endpoints
            return {"clauses": [], "risk_level": "medium"}
        
        result = await run_evaluation(
            model_version=settings.ollama_model_extract,
            dataset_path=dataset,
            inference_fn=inference_fn,
        )
        metrics = compute_metrics([result]) if result else {}
        
        return {
            "status": "completed",
            "dataset": dataset,
            "result": result.to_dict() if result else None,
            "metrics": metrics,
        }
    except Exception as e:
        logger.error(f"Evaluation failed: {e}")
        raise HTTPException(status_code=500, detail=f"Evaluation failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
    )
