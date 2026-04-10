# ============================================================
# EvidentIS AI Service Dockerfile
# Python FastAPI AI/ML Service
# ============================================================

FROM python:3.11-slim AS builder

# Install system dependencies for OCR and ML
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgomp1 \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download spaCy model
RUN python -m spacy download en_core_web_trf

# ============================================================
# Production image
# ============================================================
FROM python:3.11-slim AS runner

# Install runtime dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-eng \
    libgomp1 \
    libgl1 \
    libglib2.0-0 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Security: Create non-root user
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup appuser

WORKDIR /app

# Copy installed packages from builder
COPY --from=builder /usr/local/lib/python3.11/site-packages /usr/local/lib/python3.11/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copy application code
COPY --chown=appuser:appgroup . .

# Create model cache directory
RUN mkdir -p /models && chown -R appuser:appgroup /models

# Security: Run as non-root user
USER appuser

EXPOSE 5000

ENV PYTHONUNBUFFERED=1
ENV MODEL_CACHE_DIR=/models

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
