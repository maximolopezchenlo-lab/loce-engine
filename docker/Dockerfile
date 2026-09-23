# Multi-stage production Dockerfile for LiveVoice Open-Caption Engine (LOCE)

# Stage 1: Build Web Frontend
FROM node:22-alpine AS web-builder
WORKDIR /build/web

COPY web/package.json ./
RUN npm install --ignore-scripts

COPY web/ ./
RUN npm run build

# Stage 2: Python Backend Runtime
FROM python:3.12-slim AS runner

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DEBIAN_FRONTEND=noninteractive

WORKDIR /app

# Install system audio dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source code
COPY core/ ./core/
COPY server/ ./server/
COPY fixtures/ ./fixtures/
COPY scripts/ ./scripts/
COPY pyproject.toml .

# Copy compiled frontend assets from web-builder
COPY --from=web-builder /build/web/dist ./web/dist

EXPOSE 8000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/healthz || exit 1

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
