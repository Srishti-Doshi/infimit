# Builder
FROM python:3.11-slim AS builder

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip wheel --wheel-dir /wheels -r requirements.txt


# Runner
FROM python:3.11-slim

RUN useradd --create-home --uid 1001 app && \
    mkdir -p /models /app && \
    chown -R app:app /models /app

WORKDIR /app

COPY --from=builder /wheels /wheels
COPY requirements.txt .

RUN pip install --no-cache-dir --find-links /wheels -r requirements.txt && rm -rf /wheels

COPY app/ app/

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD curl -f http://localhost:8000/v1/healthz || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]