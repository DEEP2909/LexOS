"""
EvidentIS AI Service - Embeddings Router
Text embedding generation endpoints.
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from llm_safety import retry_with_backoff, RetryConfig

logger = logging.getLogger(__name__)

router = APIRouter()

# Retry configuration for embedding operations (transient model failures)
EMBED_RETRY_CONFIG = RetryConfig(max_attempts=3, initial_delay=0.2, max_delay=2.0, exponential_base=2.0)


class EmbedRequest(BaseModel):
    """Embedding request model."""
    texts: List[str] = Field(..., description="List of texts to embed", max_length=100)
    normalize: bool = Field(default=True, description="Whether to L2-normalize embeddings")


class EmbedResponse(BaseModel):
    """Embedding response model."""
    embeddings: List[List[float]]
    model: str
    dimension: int
    count: int


class SingleEmbedRequest(BaseModel):
    """Single text embedding request."""
    text: str = Field(..., description="Text to embed", max_length=50000)
    normalize: bool = Field(default=True)


class SingleEmbedResponse(BaseModel):
    """Single embedding response."""
    embedding: List[float]
    model: str
    dimension: int


@router.post("", response_model=EmbedResponse)
async def create_embeddings(
    request: Request,
    body: EmbedRequest
) -> EmbedResponse:
    """
    Generate embeddings for multiple texts.
    
    Uses all-MiniLM-L6-v2 (384 dimensions) by default.
    Embeddings are L2-normalized for cosine similarity.
    
    Max 100 texts per request.
    """
    models = request.app.state.models
    settings = request.app.state.settings
    
    if not body.texts:
        raise HTTPException(status_code=400, detail="No texts provided")
    
    if len(body.texts) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 texts per request")
    
    embeddings_list: list[list[float]] = []
    
    async def generate_embeddings():
        nonlocal embeddings_list
        # Generate embeddings
        embeddings = models.embedding_model.encode(
            body.texts,
            normalize_embeddings=body.normalize,
            show_progress_bar=False,
        )
        # Convert to list
        embeddings_list = embeddings.tolist()
    
    try:
        await retry_with_backoff(generate_embeddings, config=EMBED_RETRY_CONFIG)
        
        return EmbedResponse(
            embeddings=embeddings_list,
            model=settings.embedding_model,
            dimension=settings.embedding_dim,
            count=len(embeddings_list),
        )
        
    except Exception as e:
        logger.error(f"Embedding generation failed after retries: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")


@router.post("/single", response_model=SingleEmbedResponse)
async def create_single_embedding(
    request: Request,
    body: SingleEmbedRequest
) -> SingleEmbedResponse:
    """
    Generate embedding for a single text.
    
    Useful for search queries and single documents.
    """
    models = request.app.state.models
    settings = request.app.state.settings
    
    if not body.text:
        raise HTTPException(status_code=400, detail="No text provided")
    
    embedding_result: Optional[list[float]] = None
    
    async def generate_single_embedding():
        nonlocal embedding_result
        # Generate embedding
        embedding = models.embedding_model.encode(
            body.text,
            normalize_embeddings=body.normalize,
            show_progress_bar=False,
        )
        embedding_result = embedding.tolist()
    
    try:
        await retry_with_backoff(generate_single_embedding, config=EMBED_RETRY_CONFIG)
        if embedding_result is None:
            raise HTTPException(status_code=500, detail="Embedding generation returned no result")
        
        return SingleEmbedResponse(
            embedding=embedding_result,
            model=settings.embedding_model,
            dimension=settings.embedding_dim,
        )
        
    except Exception as e:
        logger.error(f"Embedding generation failed after retries: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")
