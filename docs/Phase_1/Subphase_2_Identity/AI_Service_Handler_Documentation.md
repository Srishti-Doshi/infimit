# Subphase 2 — Identity & AI Contract Lock · AI Service Handler

**Owners:** Zaman, Saloni · **Duration:** Week 3–4 · **Tag at exit:** `v0.2.0`

> **Theme of this subphase:** Lock the `/v1/summarize` contract **completely**, ship a **deterministic stub implementation**, and start internal R&D for the real BART pipeline that lands in Subphase 3. Backend can integrate against the stub without waiting for the real model.

---

## 1. Objectives

1. Finalize Pydantic request/response schemas for `/v1/summarize` matching [`docs/06-ai-service.md`](../../06-ai-service.md) §6.2.1 byte-for-byte.
2. Implement a **deterministic stub** of `/v1/summarize` that returns plausible-shaped JSON without loading any model.
3. Implement real Prometheus middleware metrics (request count, latency histogram, model load time, cache hit/miss counter).
4. Begin local R&D on `facebook/bart-large-cnn`: download to volume, measure cold-start RAM + latency on dev machines, document findings.
5. Strengthen error handling: 422 for empty text, 413 for payload too large, 401 for missing key.
6. Improve test coverage: pytest contract tests pretending to be the backend.

---

## 2. Scope of Work

### In scope
- **Contract freeze for `/v1/summarize`:**
  - Pydantic v2 request schema: `{ text: str, maxWords: int (default 60, range 20–120), style: Literal["neutral","engaging","academic"] (default "neutral") }`.
  - Response schema: `{ summary: str, confidence: float, model: str, tokensIn: int, tokensOut: int, cached: bool }`.
  - Validation rules: `text` length 1–20,000 chars (over → 413), `maxWords` clamped to int range.
- **Stub implementation** in `app/services/summarizer.py`:
  - Returns first N words of input + ellipsis (deterministic).
  - `model: "stub-v0"`, `confidence: 0.0`, `cached: false`.
  - Honors style param by tweaking output prefix (`"Summary: "`, `"In brief — "`, `"Abstract: "`).
- **Error handling:**
  - 422 on empty `text` after strip.
  - 413 on `text` > 20,000 chars (per [`docs/06-ai-service.md`](../../06-ai-service.md) §6.5).
  - 401 on missing/wrong internal key.
  - Custom exception handler maps `RequestValidationError` to envelope.
- **Prometheus metrics** (replace skeleton):
  - `ai_requests_total{endpoint, status}`
  - `ai_request_duration_seconds{endpoint}` (histogram)
  - `ai_model_load_duration_seconds{model}` (histogram, will populate in Subphase 3)
  - `ai_cache_hits_total{endpoint}`, `ai_cache_misses_total{endpoint}` (no-op in stub)
- **Lazy loader R&D (no production code yet)**:
  - In `app/models/loader.py`, define interface; implementation still raises NotImplementedError for `get("summarize")`.
  - Side-band: download `facebook/bart-large-cnn` into the mounted `./models` volume; document RAM (≈ 2 GB), cold-load latency, p50 inference time on a 5 KB article, in `ai-service/docs/bart-benchmark.md`.
- **Tests:**
  - `tests/test_contract.py` — pretends to be backend; asserts schema, headers, error envelopes.
  - `tests/test_summarize_stub.py` — happy path + 422 + 413 + 401.
  - `tests/test_metrics.py` — request increments counter.
- **OpenAPI / Swagger** — FastAPI's auto-doc is sufficient. Confirm `/docs` renders behind the internal key (or expose without auth in dev, document the policy).

### Out of scope
- Real BART inference path → Subphase 3.
- In-memory LRU cache → Subphase 3.
- `/v1/keywords`, `/v1/recommend`, etc. → Phase 2 per [`docs/09-development-phases.md`](../../09-development-phases.md) §9.2.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| `/v1/summarize` contract (authoritative) | [`06-ai-service.md`](../../06-ai-service.md) §6.2.1 |
| Design principles | [`06-ai-service.md`](../../06-ai-service.md) §6.1 |
| Size limits & 413 rules | [`06-ai-service.md`](../../06-ai-service.md) §6.5 |
| Models & runtime spec | [`06-ai-service.md`](../../06-ai-service.md) §6.3 |
| Folder layout | [`12-folder-structure.md`](../../12-folder-structure.md) §12.3 |
| Phase 1 AI exit criteria | [`09-development-phases.md`](../../09-development-phases.md) §9.1 |

---

## 4. Expected Implementation Direction

### Final Pydantic schemas

`app/schemas/summarize.py`:

```python
from typing import Literal
from pydantic import BaseModel, Field, field_validator

class SummarizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    maxWords: int = Field(default=60, ge=20, le=120)
    style: Literal["neutral", "engaging", "academic"] = "neutral"

    @field_validator("text")
    @classmethod
    def strip_and_check(cls, v: str) -> str:
        v = v.strip()
        if not v:
            raise ValueError("text must not be empty after strip")
        return v

class SummarizeResponse(BaseModel):
    summary: str
    confidence: float = Field(ge=0.0, le=1.0)
    model: str
    tokensIn: int
    tokensOut: int
    cached: bool
```

### Error envelope (final)

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "text must not be empty", "details": [...] } }
```

Custom exception handlers:
- `RequestValidationError` → 422 with `code: VALIDATION_ERROR`.
- `PayloadTooLargeError` (custom) → 413 with `code: PAYLOAD_TOO_LARGE`.
- Auth failure → 401 with `code: INVALID_INTERNAL_KEY`.
- Unhandled → 500 with `code: INTERNAL_ERROR`.

### Stub implementation

`app/services/summarizer.py`:

```python
class SummarizerService:
    def summarize(self, text: str, max_words: int, style: str) -> dict:
        prefix = {"neutral": "", "engaging": "In brief — ", "academic": "Abstract: "}[style]
        words = text.split()[:max_words]
        summary = prefix + " ".join(words) + ("…" if len(text.split()) > max_words else "")
        return {
            "summary": summary,
            "confidence": 0.0,
            "model": "stub-v0",
            "tokensIn": len(text.split()),
            "tokensOut": len(words),
            "cached": False,
        }
```

### Router

```python
@router.post("/v1/summarize", response_model=SummarizeResponse)
async def summarize(req: SummarizeRequest, _: None = Depends(verify_internal_key), svc: SummarizerService = Depends(get_summarizer)) -> SummarizeResponse:
    with metrics.track("summarize"):
        return SummarizerService.summarize(req.text, req.maxWords, req.style)
```

### BART benchmark doc (deliverable artifact)

`ai-service/docs/bart-benchmark.md` — captures (on dev machines):
- Model size on disk
- Peak RAM during load
- Peak RAM during inference (1 short, 1 long article)
- p50/p95 inference latency
- CPU vs GPU comparison if a GPU is handy
- Recommendation: stick with `facebook/bart-large-cnn` or switch to a distilled variant (e.g., `sshleifer/distilbart-cnn-12-6`).

---

## 5. Dependencies

### Blocking
- Subphase 1 scaffold (auth middleware, healthz, structure).

### Soft
- Backend's plan to call `/v1/summarize` in Subphase 4 — the contract here must satisfy that integration plan.

### Provides for downstream
- Frozen `/v1/summarize` contract → consumed by backend `ai-proxy` in Subphase 4.
- Stub implementation → backend can integration-test as soon as Subphase 4.
- Benchmark data → informs Subphase 3 real implementation (whether to keep BART or swap to distilled).

---

## 6. Suggested Development Order

1. **Day 1** — Pydantic schemas (`SummarizeRequest`, `SummarizeResponse`). Unit tests on validation edges.
2. **Day 2** — Router for `/v1/summarize`. Wire to stub service. Verify 200 path.
3. **Day 3** — Error handlers: 422 (empty), 413 (oversize). Override default `RequestValidationError`.
4. **Day 4** — Prometheus middleware: counters and histograms. Verify with `curl /v1/metrics`.
5. **Day 5** — Contract tests (`tests/test_contract.py`) — exercises the endpoint as if from the backend.
6. **Day 6–7** — BART R&D: download model to `./models`, write a one-shot script to load + summarize. Capture metrics.
7. **Day 8** — Write `ai-service/docs/bart-benchmark.md` with findings + recommendation.
8. **Day 9** — Strengthen logging: include `model`, `cached`, `payload_chars` (not text!), `duration_ms` in the request-complete log.
9. **Day 10** — Decide on the real cache eviction policy (LRU vs LFU, max size, TTL). Document.
10. **Day 11** — README update with curl examples, env var documentation, run-tests instructions.
11. **Day 12** — pytest coverage report ≥ 70% for the parts implemented.
12. **Day 13 — Integration Day** — Backend handler calls `/v1/summarize` from a manual curl through the compose network: confirms 200, headers, envelope. AI internal key working.
13. **Day 14** — Exit review, tag `v0.2.0`.

---

## 7. Important Considerations

- **The contract is a hard freeze.** Once Subphase 2 ends, changes to `/v1/summarize` payload shape require a contract PR and re-coordination with backend. Get it right now.
- **Deterministic stub** — must be deterministic so backend integration tests aren't flaky.
- **No text in logs.** Log only `len(text)`. If you must echo for debugging, hash it (`hashlib.sha256(text)`) and store the prefix.
- **maxWords default of 60** matches [`06-ai-service.md`](../../06-ai-service.md) §6.2.1 example.
- **Confidence is bounded 0–1.** Even in stub, return `0.0` (legitimately low confidence) — never above.
- **413 vs 422.** 413 = payload too large (size). 422 = semantically invalid (empty after strip). Distinct error codes.
- **Metrics endpoint security.** `/v1/metrics` is intended for Prometheus scraping inside the VPC. In P1 it can be open behind the internal key check. Document that in README.
- **Don't expose Swagger publicly.** FastAPI auto-docs at `/docs` and `/redoc`. In P1 staging, gate them behind the internal-key dependency or disable them in production via `docs_url=None`.
- **Cold start budget.** Loader skeleton stays a no-op this subphase. But factor in cold-start latency: when Subphase 3 loads BART, the first request will be slow (5–15 s). Plan a warm-up call on startup *or* signal `readyz` only after the model is in memory.
- **Concurrency model.** Uvicorn `--workers 1` for dev; production tuning is Subphase 5. Model lives in the worker process — multiple workers means multiple model copies (RAM-heavy).

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff | Confirm the request/response shape is the final word; cite `docs/06-ai-service.md` §6.2.1 as authoritative. Confirm error envelope `{ "error": { "code", "message", "details" } }`. Confirm 2-second timeout from the backend side. Agree internal-key header. |
| **Backend** | Day 5 | Share `tests/test_contract.py` — backend handler validates that their `ai-proxy` request shape passes these tests. |
| **Backend** | Integration Day | End-to-end curl from inside the compose network; agree on a fix-forward list if any header/envelope mismatch surfaces. |
| **Frontend** | — | No direct comm. Backend is the only client. |
| **Tech lead** | Day 8 | Submit the benchmark doc; raise the model-choice decision if BART RAM exceeds budget on dev machines. |

---

## 9. Deliverables

- [ ] Pydantic schemas for `/v1/summarize` matching `docs/06-ai-service.md` §6.2.1 exactly.
- [ ] Router for `/v1/summarize` returning a deterministic stub response.
- [ ] 422, 413, 401 error envelopes correct.
- [ ] Prometheus middleware emitting request count, latency histogram, model load placeholder, cache hit/miss placeholders.
- [ ] `/v1/metrics` returning Prometheus exposition format.
- [ ] BART benchmark document at `ai-service/docs/bart-benchmark.md` with concrete numbers + model recommendation.
- [ ] `tests/test_contract.py` mimicking the backend integration.
- [ ] `tests/test_summarize_stub.py` covering happy + sad paths.
- [ ] `tests/test_metrics.py` validating the metrics endpoint.
- [ ] README updated with curl examples, env vars, test instructions.
- [ ] CI green on ruff + black + mypy + pytest.

### Acceptance checklist
- `POST /v1/summarize` with valid payload + correct `X-Internal-Key` → 200 with full envelope.
- `POST /v1/summarize` with empty text → 422 with `code: VALIDATION_ERROR`.
- `POST /v1/summarize` with 20,001-char text → 413 with `code: PAYLOAD_TOO_LARGE`.
- `POST /v1/summarize` without key → 401 with `code: INVALID_INTERNAL_KEY`.
- `GET /v1/metrics` → 200 with Prometheus text format including `ai_requests_total`.
- Benchmark doc committed with at least 3 data points (load RAM, p50 latency, p95 latency).
- Pytest coverage ≥ 70% on `app/routers` and `app/services`.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Pydantic v2 validator semantics differ from v1 | Pin Pydantic v2; use `@field_validator`; test thoroughly. Document any quirks in `README.md`. |
| BART model download size (≈ 1.6 GB) slows dev machine setup | Document the one-time `python -c "from transformers import AutoModelForSeq2SeqLM; ..."` snippet to pre-cache; mount `./models` volume so it's reused. |
| FastAPI `RequestValidationError` defaults override our envelope | Register custom exception handler explicitly in `main.py`. Add a test that confirms the override works. |
| Style param wording disagreement (engaging vs editorial) | Stick with `neutral / engaging / academic` per `docs/06-ai-service.md` §6.2.1 — do not invent new values. |
| Stub determinism breaks under unicode edge cases | Test with multilingual text; ensure `.split()` is whitespace-based and idempotent. |
| Prometheus client adds overhead per request | The histogram bucket count matters; use defaults; benchmark in Subphase 3. |
| Internal-key bypass for `/docs` and `/metrics` debated | Decide in subphase kickoff: in P1 staging, keep `/docs` behind the internal key; disable in production via env. |
| Real BART benchmark shows > 2s p95 on CPU | Recommend `sshleifer/distilbart-cnn-12-6` (smaller, faster) in the benchmark doc and present trade-off (~3% ROUGE loss). Final call is the tech lead's. |
