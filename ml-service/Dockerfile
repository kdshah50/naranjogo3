# ── Tianguis ML Service — Dockerfile ─────────────────────────────────────────
# Deployed on Railway (persistent Python container) — arch doc §9.1
# Target: < 4s end-to-end for image upload + ML categorization (arch doc §9.2)

FROM python:3.11-slim

# Build dependencies for Pillow + numpy
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python deps first (layer caching)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app/ ./app/
COPY scripts/ ./scripts/

# Create model directory — mounted volume on Railway or baked in
RUN mkdir -p app/models

# Railway sets PORT automatically
ENV PORT=8000

EXPOSE 8000

# Uvicorn with 2 workers (Railway Hobby: 512MB RAM — keep workers low)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
