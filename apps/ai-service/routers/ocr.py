"""
EvidentIS AI Service - OCR Router
Optical Character Recognition endpoints.
"""

import logging
from typing import Optional

import cv2
import numpy as np
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from pydantic import BaseModel

from llm_safety import retry_with_backoff, RetryConfig

logger = logging.getLogger(__name__)

router = APIRouter()

# Retry configuration for OCR operations (transient failures from model loading, memory pressure)
OCR_RETRY_CONFIG = RetryConfig(max_attempts=3, initial_delay=0.5, max_delay=5.0, exponential_base=2.0)


class OCRResponse(BaseModel):
    """OCR response model."""
    text: str
    page_count: int
    confidence: float
    engine_used: str
    word_count: int


class OCRRequest(BaseModel):
    """OCR request with base64 image."""
    image_base64: str
    engine: Optional[str] = None


def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """
    Preprocess image for better OCR results.
    - Convert to grayscale
    - Apply adaptive thresholding
    - Denoise
    """
    # Read image
    nparr = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    
    if img is None:
        raise ValueError("Failed to decode image")
    
    # Convert to grayscale
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    
    # Apply Gaussian blur to reduce noise
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    
    # Apply adaptive thresholding
    thresh = cv2.adaptiveThreshold(
        blurred, 255,
        cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
        cv2.THRESH_BINARY, 11, 2
    )
    
    return thresh


def ocr_with_tesseract(image: np.ndarray) -> tuple[str, float]:
    """Perform OCR using Tesseract."""
    import pytesseract
    
    # Get text with confidence data
    data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DICT)
    
    # Extract text
    text_parts = []
    confidences = []
    
    for i, conf in enumerate(data["conf"]):
        if conf > 0:  # Filter out low confidence results
            text_parts.append(data["text"][i])
            confidences.append(conf)
    
    text = " ".join(text_parts)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    
    return text, avg_confidence / 100


def ocr_with_easyocr(image: np.ndarray, reader) -> tuple[str, float]:
    """Perform OCR using EasyOCR."""
    results = reader.readtext(image)
    
    text_parts = []
    confidences = []
    
    for bbox, text, conf in results:
        text_parts.append(text)
        confidences.append(conf)
    
    text = " ".join(text_parts)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    
    return text, avg_confidence


def ocr_with_paddleocr(image: np.ndarray, ocr) -> tuple[str, float]:
    """Perform OCR using PaddleOCR."""
    results = ocr.ocr(image, cls=True)
    
    text_parts = []
    confidences = []
    
    if results and results[0]:
        for line in results[0]:
            text_parts.append(line[1][0])
            confidences.append(line[1][1])
    
    text = " ".join(text_parts)
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0
    
    return text, avg_confidence


@router.post("", response_model=OCRResponse)
async def perform_ocr(
    request: Request,
    file: UploadFile = File(...),
    engine: Optional[str] = None
) -> OCRResponse:
    """
    Perform OCR on an uploaded image or PDF.
    
    Supports:
    - PNG, JPG, TIFF images
    - PDF documents (first page only in this endpoint)
    
    Engine options:
    - tesseract: Fast, good for clean documents
    - easyocr: Good for complex layouts
    - paddleocr: Best for tables and financial documents
    """
    models = request.app.state.models
    
    # Read file content
    content = await file.read()
    
    # Check file type
    content_type = file.content_type or ""
    
    if "pdf" in content_type.lower():
        # For PDFs, extract first page as image
        # In production, would use pdf2image or similar
        raise HTTPException(
            status_code=400,
            detail="PDF OCR requires conversion to images first. Use the document ingestion pipeline."
        )
    
    # Preprocess image
    try:
        processed_image = preprocess_image(content)
    except Exception as e:
        logger.error(f"Image preprocessing failed: {e}")
        raise HTTPException(status_code=400, detail=f"Failed to process image: {e}")
    
    # Get available engines
    available_engines = models.get_available_ocr_engines()
    
    if not available_engines:
        raise HTTPException(
            status_code=503,
            detail="No OCR engines available"
        )
    
    # Select engine
    selected_engine = str(engine if engine in available_engines else available_engines[0])
    
    # Perform OCR with retry wrapper for transient failures
    text = ""
    confidence = 0.0
    
    async def perform_ocr_with_engine():
        nonlocal text, confidence
        if selected_engine == "tesseract":
            text, confidence = ocr_with_tesseract(processed_image)
            
        elif selected_engine == "easyocr":
            engine_info = models.get_ocr_engine("easyocr")
            if engine_info and engine_info.get("reader"):
                text, confidence = ocr_with_easyocr(processed_image, engine_info["reader"])
            else:
                raise HTTPException(status_code=503, detail="EasyOCR not available")
                
        elif selected_engine == "paddleocr":
            engine_info = models.get_ocr_engine("paddleocr")
            if engine_info and engine_info.get("ocr"):
                text, confidence = ocr_with_paddleocr(processed_image, engine_info["ocr"])
            else:
                raise HTTPException(status_code=503, detail="PaddleOCR not available")
    
    try:
        await retry_with_backoff(perform_ocr_with_engine, OCR_RETRY_CONFIG)
    except Exception as e:
        logger.error(f"OCR failed with {selected_engine} after retries: {e}")
        raise HTTPException(status_code=500, detail=f"OCR failed: {e}")
    
    # Calculate word count
    word_count = len(text.split()) if text else 0
    
    return OCRResponse(
        text=text.strip(),
        page_count=1,
        confidence=round(confidence, 4),
        engine_used=selected_engine,
        word_count=word_count,
    )
