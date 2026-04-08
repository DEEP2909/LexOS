"""
LexOS AI Service Configuration
Pydantic Settings for environment configuration
"""

from functools import lru_cache
from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List


class Settings(BaseSettings):
    """AI Service configuration loaded from environment variables."""
    
    # Server
    host: str = Field(default="0.0.0.0")
    port: int = Field(default=5000)
    debug: bool = Field(default=False)
    environment: str = Field(default="development")  # development, staging, production
    
    # CORS (only for non-production environments)
    cors_origins: List[str] = Field(default=[])
    
    # Ollama LLM
    ollama_base_url: str = Field(default="http://localhost:11434")
    ollama_model_extract: str = Field(default="mistral:7b-instruct-q4_K_M")
    ollama_model_research: str = Field(default="mistral:7b-instruct-q4_K_M")
    ollama_timeout: int = Field(default=120)
    
    # Embeddings
    embedding_model: str = Field(default="all-MiniLM-L6-v2")
    embedding_dim: int = Field(default=384)
    
    # OCR
    ocr_engines: str = Field(default="tesseract,easyocr")
    tesseract_path: str = Field(default="")
    
    # Models
    model_cache_dir: str = Field(default="./models")
    gpu_enabled: bool = Field(default=False)
    
    # Thresholds
    clause_extraction_threshold: float = Field(default=0.70)
    research_cache_ttl_seconds: int = Field(default=3600)
    
    # spaCy
    spacy_model: str = Field(default="en_core_web_trf")
    
    # Redis (for caching)
    redis_url: str = Field(default="redis://localhost:6379")
    
    @property
    def ocr_engine_list(self) -> List[str]:
        return [e.strip() for e in self.ocr_engines.split(",")]
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance."""
    return Settings()
