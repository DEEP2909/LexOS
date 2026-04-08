"""
LexOS Model Registry
Manages loading and access to all AI/ML models.
"""

import logging
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


class ModelRegistry:
    """
    Central registry for all AI/ML models.
    Handles lazy loading and provides unified access.
    """
    
    def __init__(self, settings):
        self.settings = settings
        self._embedding_model = None
        self._spacy_model = None
        self._ocr_engines = {}
        self._loaded = False
    
    async def load_all(self) -> None:
        """Load all models at startup."""
        logger.info("Loading AI models...")
        
        # Load embedding model
        await self._load_embedding_model()
        
        # Load spaCy NER model
        await self._load_spacy_model()
        
        # Initialize OCR engines
        await self._load_ocr_engines()
        
        self._loaded = True
        logger.info("All models loaded successfully")
    
    async def _load_embedding_model(self) -> None:
        """Load sentence-transformers embedding model."""
        logger.info(f"Loading embedding model: {self.settings.embedding_model}")
        
        try:
            from sentence_transformers import SentenceTransformer
            
            self._embedding_model = SentenceTransformer(
                self.settings.embedding_model,
                cache_folder=self.settings.model_cache_dir,
                device="cuda" if self.settings.gpu_enabled else "cpu"
            )
            
            logger.info("Embedding model loaded")
        except Exception as e:
            logger.error(f"Failed to load embedding model: {e}")
            raise
    
    async def _load_spacy_model(self) -> None:
        """Load spaCy NER model."""
        logger.info(f"Loading spaCy model: {self.settings.spacy_model}")
        
        try:
            import spacy
            
            # Try to load the transformer model, fall back to smaller model
            try:
                self._spacy_model = spacy.load(self.settings.spacy_model)
            except OSError:
                logger.warning(f"Model {self.settings.spacy_model} not found, using en_core_web_sm")
                self._spacy_model = spacy.load("en_core_web_sm")
            
            logger.info("spaCy model loaded")
        except Exception as e:
            logger.error(f"Failed to load spaCy model: {e}")
            raise
    
    async def _load_ocr_engines(self) -> None:
        """Initialize OCR engines."""
        logger.info(f"Initializing OCR engines: {self.settings.ocr_engine_list}")
        
        for engine in self.settings.ocr_engine_list:
            try:
                if engine == "tesseract":
                    # Tesseract is available via pytesseract
                    self._ocr_engines["tesseract"] = {"type": "tesseract", "available": True}
                    logger.info("Tesseract OCR initialized")
                    
                elif engine == "easyocr":
                    import easyocr
                    # Create reader for English
                    reader = easyocr.Reader(
                        ["en"],
                        gpu=self.settings.gpu_enabled,
                        model_storage_directory=self.settings.model_cache_dir
                    )
                    self._ocr_engines["easyocr"] = {"type": "easyocr", "reader": reader, "available": True}
                    logger.info("EasyOCR initialized")
                    
                elif engine == "paddleocr":
                    from paddleocr import PaddleOCR
                    ocr = PaddleOCR(
                        use_angle_cls=True,
                        lang="en",
                        use_gpu=self.settings.gpu_enabled
                    )
                    self._ocr_engines["paddleocr"] = {"type": "paddleocr", "ocr": ocr, "available": True}
                    logger.info("PaddleOCR initialized")
                    
            except Exception as e:
                logger.warning(f"Failed to initialize {engine}: {e}")
                self._ocr_engines[engine] = {"type": engine, "available": False, "error": str(e)}
    
    async def unload_all(self) -> None:
        """Cleanup models on shutdown."""
        logger.info("Unloading models...")
        self._embedding_model = None
        self._spacy_model = None
        self._ocr_engines = {}
        self._loaded = False
    
    @property
    def embedding_model(self):
        """Get embedding model."""
        if not self._embedding_model:
            raise RuntimeError("Embedding model not loaded")
        return self._embedding_model
    
    @property
    def spacy_model(self):
        """Get spaCy model."""
        if not self._spacy_model:
            raise RuntimeError("spaCy model not loaded")
        return self._spacy_model
    
    def get_ocr_engine(self, name: str) -> Optional[Dict[str, Any]]:
        """Get a specific OCR engine."""
        return self._ocr_engines.get(name)
    
    def get_available_ocr_engines(self) -> list:
        """Get list of available OCR engines."""
        return [name for name, info in self._ocr_engines.items() if info.get("available")]
    
    def get_status(self) -> Dict[str, Any]:
        """Get status of all models."""
        return {
            "embedding": {
                "model": self.settings.embedding_model,
                "loaded": self._embedding_model is not None,
                "dim": self.settings.embedding_dim,
            },
            "spacy": {
                "model": self.settings.spacy_model,
                "loaded": self._spacy_model is not None,
            },
            "ocr": {
                name: {
                    "available": info.get("available", False),
                    "error": info.get("error"),
                }
                for name, info in self._ocr_engines.items()
            },
            "llm": {
                "ollama_url": self.settings.ollama_base_url,
                "extract_model": self.settings.ollama_model_extract,
                "research_model": self.settings.ollama_model_research,
            }
        }
