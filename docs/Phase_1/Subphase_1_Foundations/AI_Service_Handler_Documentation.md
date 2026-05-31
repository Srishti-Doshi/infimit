# Subphase 1 — Foundations · AI Service Handler

**Owners:** Zaman, Saloni · **Duration:** Week 1–2 · **Tag at exit:** `v0.1.0`

> **Theme of this subphase:** Stand up a production-shaped FastAPI service that _does_ nothing yet — but every cross-cutting concern (config, auth, logging, metrics, lazy model loader skeleton, healthz/readyz) is in place. By the end, the service is reachable from the backend container, and the project structure mirrors [`docs/12-folder-structure.md`](../../12-folder-structure.md) §12.3 exactly.

---

## 1. Objectives

1. Bootstrap the FastAPI + Python 3.11 microservice per [`docs/06-ai-service.md`](../../06-ai-service.md) and [`docs/12-folder-structure.md`](../../12-folder-structure.md) §12.3.
2. Lock down the internal contract: `X-Internal-Key` header auth, JSON I/O, standard error format.
3. Implement `/v1/healthz` and `/v1/readyz` with model-loader readiness signal.
4. Wire structured logging + Prometheus metrics middleware (skeletons OK; real metrics in Subphase 4).
5. Build a Dockerfile (multi-stage, non-root) and integrate with root `docker-compose.yml`.
6. Decide the model storage strategy (volume mount vs baked-in) and document it.

---

## 2. Scope of Work

### In scope

- FastAPI app factory + Uvicorn entrypoint.
- Pydantic v2 settings (`app/config.py`) — read env, validate at boot.
- `app/dependencies.py` — DI for internal-key auth, lazy model loader handle.
- Middleware:
  - `auth.py` — checks `X-Internal-Key` header; returns 401 on mismatch. Bypass for `/v1/healthz` and `/v1/readyz`.
  - `logging.py` — structlog JSON output with `request_id`.
  - `metrics.py` — `prometheus_client` skeleton (real metrics added Subphase 4).
- Routers:
  - `health.py` — `GET /v1/healthz`, `GET /v1/readyz`.
  - Empty router files for `summarize.py`, `keywords.py`, `recommend.py`, `tts.py`, `semantic_search.py`, `moderate.py` (each returns 501 for now).
- Services:
  - `models/loader.py` — lazy, memoized loader skeleton with cache state introspection (`is_loaded(model_name) -> bool`).
  - Empty service files per [`docs/12-folder-structure.md`](../../12-folder-structure.md) §12.3.
- Schemas:
  - Skeleton Pydantic models per endpoint (filled in Subphase 2 for `summarize`).
- Utilities:
  - `utils/text.py` — char/word counter, plain-text sanitizer.
  - `utils/cache.py` — LRU helper (real cache in Subphase 3).
- Dockerfile (multi-stage), `requirements.txt`, `pyproject.toml` with ruff/black/mypy config.
- `tests/` skeleton with pytest + httpx async client + a passing `/healthz` test.
- `.env.example`, `README.md`.

### Out of scope (later subphases)

- Real model downloads, real `/summarize` implementation → Subphase 2 (stub) and Subphase 3 (real BART).
- Final Prometheus metric definitions → Subphase 4.
- Production observability dashboards → Subphase 5.

---

## 3. Relevant References

| Topic                                                               | Doc                                                                   |
| ------------------------------------------------------------------- | --------------------------------------------------------------------- |
| AI service spec (must read end to end)                              | [`06-ai-service.md`](../../06-ai-service.md)                          |
| Endpoint envelopes                                                  | [`06-ai-service.md`](../../06-ai-service.md) §6.2                     |
| Design principles (stateless, narrow surface, graceful degradation) | [`06-ai-service.md`](../../06-ai-service.md) §6.1                     |
| Folder layout                                                       | [`12-folder-structure.md`](../../12-folder-structure.md) §12.3        |
| Why a separate AI service                                           | [`02-system-architecture.md`](../../02-system-architecture.md) §2.3.3 |
| Dockerfile guidance                                                 | [`11-devops.md`](../../11-devops.md) §11.4                            |
| Local compose                                                       | [`11-devops.md`](../../11-devops.md) §11.3                            |

---

## 4. Expected Implementation Direction

### Target folder structure (mirror `docs/12-folder-structure.md` §12.3)

```
ai-service/
├── app/
│   ├── __init__.py
│   ├── main.py                ← FastAPI app factory + Uvicorn entrypoint
│   ├── config.py              ← Pydantic settings
│   ├── dependencies.py        ← DI: auth key check, model loader handle
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── health.py          ← /v1/healthz, /v1/readyz   ← LIVE
│   │   ├── summarize.py       ← /v1/summarize → 501 stub
│   │   ├── keywords.py        ← 501
│   │   ├── recommend.py       ← 501
│   │   ├── tts.py             ← 501
│   │   ├── semantic_search.py ← 501
│   │   └── moderate.py        ← 501
│   ├── services/
│   │   ├── __init__.py
│   │   └── (skeletons)
│   ├── models/
│   │   └── loader.py          ← lazy, memoized model loader skeleton
│   ├── schemas/
│   │   └── (Pydantic skeletons per endpoint)
│   ├── middleware/
│   │   ├── auth.py            ← X-Internal-Key check
│   │   ├── logging.py         ← structlog JSON
│   │   └── metrics.py         ← prometheus_client skeleton
│   └── utils/
│       ├── text.py
│       └── cache.py
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   └── test_health.py
├── models_cache/              ← gitignored; volume-mounted in compose
├── Dockerfile
├── requirements.txt
├── pyproject.toml             ← ruff, black, mypy config
├── .env.example
└── README.md
```

### Endpoint contracts to lock in this subphase

#### `GET /v1/healthz` (no auth)

```json
{
  "status": "ok",
  "uptime_sec": 1234,
  "version": "0.1.0",
  "python": "3.11.x"
}
```

#### `GET /v1/readyz` (no auth)

Returns **200** only when:

- App boot completed.
- (Future) Required models successfully lazy-loadable. In Subphase 1 the loader is a no-op so always returns ready.

```json
{
  "ready": true,
  "models": { "summarize": "not_loaded" }
}
```

#### All other endpoints (this subphase)

Return **501 NOT_IMPLEMENTED** with envelope:

```json
{
  "error": {
    "code": "NOT_IMPLEMENTED",
    "message": "Endpoint not implemented yet"
  }
}
```

### Auth middleware

- Required header on **every endpoint except `/v1/healthz` and `/v1/readyz`**: `X-Internal-Key: <secret>`.
- 401 with `{"error": {"code": "INVALID_INTERNAL_KEY", "message": "..."}}` on mismatch.
- Secret read from env `AI_INTERNAL_KEY`. Must match what backend's `ai-proxy` sends.

### Logging contract (structlog)

Every request emits a single JSON log line at request completion with at least:

```json
{
  "ts": "2026-05-11T08:30:11Z",
  "level": "info",
  "msg": "request_complete",
  "request_id": "uuid",
  "method": "POST",
  "path": "/v1/summarize",
  "status": 200,
  "duration_ms": 42,
  "model": null,
  "cached": null
}
```

### Env schema (`app/config.py`) — minimum

| Var                | Required | Example        |
| ------------------ | -------- | -------------- |
| `AI_INTERNAL_KEY`  | yes      | random 32-char |
| `PORT`             | yes      | 8000           |
| `LOG_LEVEL`        | yes      | `info`         |
| `MODELS_CACHE_DIR` | yes      | `/models`      |
| `ENABLE_METRICS`   | yes      | `true`         |

Pydantic `Settings` class with `model_config = SettingsConfigDict(env_file=".env")`.

### Lazy model loader skeleton

```python
class ModelLoader:
    def __init__(self, cache_dir: str): ...
    def get(self, name: str): ...            # raises NotImplementedError in Subphase 1
    def is_loaded(self, name: str) -> bool: ...
```

A single instance lives on `app.state.model_loader` and is exposed via `Depends(get_model_loader)`.

---

## 5. Dependencies

### Blocking

- None.

### Soft

- Backend handler's confirmation that the internal-key header is `X-Internal-Key` (already in `docs/06-ai-service.md`).
- Backend confirms internal URL in compose: `http://ai-service:8000`.

### Provides for downstream

- The skeleton + auth + healthz are consumed by **integration day** smoke tests starting Subphase 1.
- The contract envelope is locked here and inherited by every future endpoint.

---

## 6. Suggested Development Order

1. **Day 1** — Project init (`uv` or `pip-tools`), pin Python 3.11, `pyproject.toml` with ruff + black + mypy. Repo hygiene (pre-commit).
2. **Day 2** — FastAPI app factory in `main.py`; Uvicorn run target. `/v1/healthz` returning 200.
3. **Day 3** — `config.py` (Pydantic settings); env loaded; validated at boot.
4. **Day 4** — Auth middleware (`X-Internal-Key`). Tests for 401 / 200 paths.
5. **Day 5** — Structured logging middleware (`structlog`) with `request_id`. Verify JSON output.
6. **Day 6** — Router skeletons (one file each per endpoint in [`docs/06-ai-service.md`](../../06-ai-service.md) §6.2), all returning 501 with standard error envelope.
7. **Day 7** — `models/loader.py` skeleton + `app.state.model_loader` lifespan event. `/v1/readyz` returns model load state.
8. **Day 8** — Prometheus middleware skeleton — exposes `GET /v1/metrics` with at least `process_*` defaults.
9. **Day 9** — Multi-stage Dockerfile (`python:3.11-slim` runner, non-root `app` user). Image target < 1.5 GB. Mount `./models:/models` per [`docs/11-devops.md`](../../11-devops.md) §11.3.
10. **Day 10** — Compose integration: add `ai-service` block to root `docker-compose.yml`, depends on nothing (stateless), exposes `:8000`.
11. **Day 11** — pytest: `test_health.py`, `test_auth.py`. CI: ruff + black + mypy + pytest workflow in GitHub Actions.
12. **Day 12** — `README.md`, `.env.example`. Document the model-storage strategy decision (volume vs baked image — recommend volume per `docs/06-ai-service.md` §6.3).
13. **Day 13 — Integration Day** — From inside compose: `docker exec backend curl http://ai-service:8000/v1/healthz` → 200. Backend's stub `ai-proxy` confirms the internal key is accepted.
14. **Day 14** — Exit review, tag `v0.1.0`.

---

## 7. Important Considerations

- **Stateless.** No DB connection in this service, ever. All data comes through request payloads — guard against accidentally adding a DB driver to `requirements.txt`.
- **Pin every dependency.** Use `requirements.txt` with `==` versions or `uv lock`. Floating versions break ML models notoriously.
- **CPU-only torch in Phase 1.** Install `torch` with the CPU wheels (`+cpu` index) to keep the Docker image manageable. GPU is Phase 2/3 concern.
- **Lazy load means lazy.** Do not import `transformers` or load models at app boot. Loader's `get(name)` is the first import point; it should also memoize.
- **413 handling early.** Even though real `/summarize` is Subphase 3, set FastAPI's `request.body_size_limit` (or check `Content-Length`) so payload caps from [`docs/06-ai-service.md`](../../06-ai-service.md) §6.5 are enforceable.
- **No global mutable state.** Use `app.state` for the loader; never module-level globals. Tests must instantiate fresh apps.
- **Timeouts.** Set Uvicorn keep-alive timeout to 5 s; per-request worker timeout to 60 s. Backend's circuit breaker uses 2 s — anything longer is treated as a failure.
- **Never log payloads.** Article text is potentially copyrighted; log only `len(text)` and hash if needed. Per [`docs/10-security.md`](../../10-security.md) §10.1.
- **Determinism in tests.** Mock the model loader entirely in pytest. Real-model tests are slow and Subphase 3 territory.

---

## 8. Communication Points with Other Handlers

| With         | When            | What                                                                                                                                                                   |
| ------------ | --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Backend**  | Kickoff (Day 1) | Lock `X-Internal-Key` header name. Lock compose URL `http://ai-service:8000`. Confirm both teams agree on the error envelope shape (`{"error": {"code", "message"}}`). |
| **Backend**  | Day 4           | Provide a working stub of `AI_INTERNAL_KEY` so backend can wire its env var.                                                                                           |
| **Backend**  | Integration Day | Cross-ping from backend container; verify auth works (401 on missing key, 200 on correct key + healthz bypass).                                                        |
| **Frontend** | —               | None this subphase. AI service is not reachable from the SPA.                                                                                                          |
| **All**      | Daily standup   | Surface model-storage and image-size decisions early.                                                                                                                  |

---

## 9. Deliverables

- [ ] FastAPI app booting locally (`uvicorn app.main:app --reload`) and via `docker compose up`.
- [ ] `GET /v1/healthz` → 200 with status payload.
- [ ] `GET /v1/readyz` → 200 with model load states.
- [ ] All other endpoint routers exist and return 501 with envelope.
- [ ] `X-Internal-Key` middleware blocks unauth requests with 401.
- [ ] Structured JSON logging via structlog, with `request_id`.
- [ ] Prometheus middleware skeleton + `/v1/metrics` returning default Python metrics.
- [ ] `models/loader.py` skeleton wired to `app.state` via lifespan event.
- [ ] Multi-stage Dockerfile building under 1.5 GB.
- [ ] Compose entry for `ai-service` reachable from `backend` container.
- [ ] pytest suite green (health + auth coverage).
- [ ] GitHub Actions: ruff + black + mypy + pytest CI job passing.
- [ ] `README.md` documenting local dev, env vars, how to add an endpoint.
- [ ] `.env.example` complete.
- [ ] Decision recorded: **models mounted via volume**, not baked into image. Location `./models:/models`.

### Acceptance checklist

- `docker compose up` brings up `ai-service` in < 30 s (no model loaded).
- `curl -H "X-Internal-Key: $KEY" http://localhost:8000/v1/summarize -X POST -d '{}'` → 501 with envelope.
- `curl http://localhost:8000/v1/healthz` (no key) → 200.
- `curl http://localhost:8000/v1/summarize -X POST` (no key) → 401.
- All 13 endpoints return 501 with consistent envelope.
- Image size ≤ 1.5 GB (verify with `docker images`).

---

## 10. Risks & Blockers

| Risk                                                                  | Mitigation                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker image bloats above 1.5 GB before any model                     | Use `python:3.11-slim` runner, install only runtime deps; defer `transformers` and `torch` imports to lazy load — but they still inflate the image. If image exceeds budget, switch to a `pip install --no-cache-dir` strategy and consider `python:3.11-slim-bookworm` minimal variant. |
| `torch` install resolves GPU wheels by default                        | Pin to `torch==2.x+cpu` and use the CPU index URL in `requirements.txt`.                                                                                                                                                                                                                 |
| `transformers` cache writes inside container break read-only FS       | Set `TRANSFORMERS_CACHE=/models` env; volume-mount that path.                                                                                                                                                                                                                            |
| Structured logging library churn (structlog vs loguru vs std logging) | Pick **structlog** and stick with it — it's documented in [`06-ai-service.md`](../../06-ai-service.md). Configure once in `middleware/logging.py`.                                                                                                                                       |
| Pydantic v1 vs v2 confusion                                           | Use Pydantic v2; pin `pydantic>=2.5,<3`. Use `pydantic-settings` for env config.                                                                                                                                                                                                         |
| Internal key leaks via logs                                           | Strip headers from request logging middleware. Allowlist only safe headers (`User-Agent`, `Accept`).                                                                                                                                                                                     |
| FastAPI returns its own 422 format vs our envelope                    | Override the default `RequestValidationError` exception handler to wrap into `{"error": {"code": "VALIDATION_ERROR", "message": ...}}`.                                                                                                                                                  |
| Test pollution between tests due to module-level FastAPI app          | Use `pytest` fixture that builds a fresh app per test session; never import the global app instance in tests.                                                                                                                                                                            |
