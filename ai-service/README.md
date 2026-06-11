# AI Service

A standalone FastAPI microservice for the INFIMIT platform that provides AI-related capabilities to the backend via a narrow internal REST API.

## Purpose

- Host AI endpoints behind an internal-only contract.
- Expose a stable `/v1/*` surface for summarization, keyword extraction, recommendations, TTS, semantic search, and moderation.
- Provide health and readiness probes plus observability helpers.
- Keep the service stateless and safe to run inside Docker Compose.

## Key Features

- `GET /v1/healthz` — liveness probe, no auth required.
- `GET /v1/readyz` — readiness probe, no auth required.
- `POST /v1/summarize` — placeholder endpoint for article summarization.
- `POST /v1/keywords` — placeholder endpoint for keyword extraction.
- `POST /v1/recommend` — placeholder endpoint for recommendation ranking.
- `POST /v1/tts` — placeholder endpoint for audio generation.
- `POST /v1/semantic-search` — placeholder endpoint for semantic retrieval.
- `POST /v1/moderate` — placeholder endpoint for toxicity/spam classification.
- `GET /v1/metrics` — Prometheus-compatible metrics exposure.

## Auth Contract

- Every endpoint except `/v1/healthz` and `/v1/readyz` requires `X-Internal-Key: <secret>`.
- The secret is loaded from the environment variable `AI_INTERNAL_KEY`.
- Invalid or missing internal keys return `401 Unauthorized` with a standard error envelope.

## Runtime Contract

- The service is configured with Pydantic v2 settings in `app/config.py`.
- Models are loaded lazily via a memoized model loader skeleton.
- `app.state.model_loader` is available through dependency injection for future endpoints.
- Endpoint stubs return `501 NOT_IMPLEMENTED` until the implementation is added.

## Local Development

1. Copy `.env.example` to `.env` and set the required values.
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Run the service:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000
   ```
4. Confirm the service is healthy:
   ```bash
   curl http://localhost:8000/v1/healthz
   ```

## Environment Variables

- `AI_INTERNAL_KEY` — internal auth secret.
- `PORT` — service port (e.g. `8000`).
- `LOG_LEVEL` — logging level (`info`, `debug`, etc.).
- `MODELS_CACHE_DIR` — local model cache directory.
- `ENABLE_METRICS` — enable Prometheus metrics.

## Docker

- A multi-stage `Dockerfile` builds a small non-root runtime image.
- The service is intended to run in Docker Compose as `ai-service`.
- Model files are stored externally so the image remains lightweight.

## Project Structure

```
ai-service/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── dependencies.py
│   ├── routers/
│   ├── services/
│   ├── models/
│   ├── schemas/
│   ├── middleware/
│   └── utils/
├── tests/
├── Dockerfile
├── requirements.txt
├── .env.example
└── README.md
```