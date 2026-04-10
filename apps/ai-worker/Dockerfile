# ============================================================
# EvidentIS AI Worker Dockerfile
# Python Celery Async Worker
# ============================================================

FROM python:3.11-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Security: Create non-root user
RUN groupadd --system --gid 1001 appgroup && \
    useradd --system --uid 1001 --gid appgroup appuser

WORKDIR /app

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir celery[redis] redis httpx pydantic pydantic-settings

# Copy application code
COPY --chown=appuser:appgroup . .

# Security: Run as non-root user
USER appuser

ENV PYTHONUNBUFFERED=1

CMD ["celery", "-A", "celery_app", "worker", "--loglevel=info"]
