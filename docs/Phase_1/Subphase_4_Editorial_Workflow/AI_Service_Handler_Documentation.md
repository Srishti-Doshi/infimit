# Subphase 4 — Editorial Workflow + AI Integration · AI Service Handler

**Owners:** Zaman, Saloni · **Duration:** Week 7–8 · **Tag at exit:** `v0.4.0`

> **Theme of this subphase:** Harden, observe, document. The real `/v1/summarize` shipped in Subphase 3 is now under live integration with the monolith. Focus this subphase: ensure metrics, cache, fallback, and contract are bulletproof. Publish Swagger. Provide a test toggle for backend's circuit breaker testing. Finalize a latency SLO and a 1-page integration spec.

---

## 1. Objectives

1. Final tuning of `/v1/summarize` performance + observability.
2. Implement the `FORCE_FALLBACK` env toggle so backend can exercise the degradation path during integration.
3. Implement the `WARM_ON_STARTUP` env toggle so deployments can opt to block readyz on model load (avoiding cold-start surprises).
4. Expose Prometheus `/v1/metrics` with stable label semantics; document the metric names backend will rely on for alerts.
5. Publish Swagger / ReDoc at `/docs` and `/redoc` with full endpoint documentation, behind internal-key gating in non-prod.
6. Write the contract integration spec in `ai-service/docs/integration-with-monolith.md`.
7. Run a load test (e.g., k6 or Locust) and record p50/p95/p99 + RAM ceiling.
8. Write the AI on-call runbook (first draft).

---

## 2. Scope of Work

### In scope
- **Env toggles:**
  - `FORCE_FALLBACK=true` — `SummarizerService.summarize` short-circuits to fallback path with `X-Degraded: true`. Used by backend to test circuit breaker / degradation handling.
  - `WARM_ON_STARTUP=true` — `lifespan` event loads the summarizer eagerly. `/v1/readyz` only returns 200 after load completes. Default: false.
  - `READY_REQUIRES_MODEL=true` — `/v1/readyz` returns 503 until the summarize model is loaded (regardless of warm-on-startup). Default: false (lazy ready).
- **Cache hardening:**
  - Configurable size via env `LRU_CAPACITY` (default 1024).
  - Optional TTL via `LRU_TTL_SEC` (default 0 = no TTL).
  - Metrics: `ai_cache_evictions_total{endpoint}`.
- **Metrics finalization:**
  - `ai_requests_total{endpoint, status, degraded}` — counter.
  - `ai_request_duration_seconds{endpoint}` — histogram.
  - `ai_model_load_duration_seconds{model}` — histogram.
  - `ai_cache_hits_total{endpoint}`, `ai_cache_misses_total{endpoint}`, `ai_cache_evictions_total{endpoint}` — counters.
  - `ai_model_loaded{model}` — gauge (0/1).
- **Docs:**
  - Swagger UI at `/docs`, ReDoc at `/redoc`. Both gated behind `EXPOSE_DOCS=true` in non-dev. In dev: always on. In production: off by default.
  - Inline Pydantic schema descriptions so Swagger reads cleanly.
- **Integration spec:**
  - `ai-service/docs/integration-with-monolith.md` — single-pager describing: base URL, internal key, contract, error codes, fallback header, latency SLO, retry guidance.
- **Load test:**
  - `scripts/loadtest.py` (locust or k6) — 50 concurrent users, 5-minute soak, mixed cache-hit / cache-miss load.
  - Capture: p50, p95, p99 latency; RSS; cache hit ratio.
  - Write results to `ai-service/docs/loadtest-p1.md`.
- **On-call runbook:**
  - `ai-service/docs/runbook.md` covering:
    - "AI service is degraded" → check `ai_requests_total{degraded="true"}` rate; restart pod; clear LRU.
    - "Cold start slow" → set `WARM_ON_STARTUP=true`.
    - "OOM kills" → verify model choice, lower `LRU_CAPACITY`, restart.
    - "Backend circuit open" → check AI healthz; confirm internal key is correct.
- **Tests:**
  - `tests/test_force_fallback.py` covering env-toggle behavior.
  - `tests/test_metrics_labels.py` confirming the label semantics backend depends on.

### Out of scope
- New endpoints (`/v1/keywords`, `/v1/recommend`, `/v1/moderate`, `/v1/tts`) — these are Phase 2 / 3 per `docs/09-development-phases.md` §9.2/9.3.
- Migration to hosted LLMs (Claude/GPT-4o) → Phase 3.
- Multi-worker / model server pattern → Phase 2.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| AI contract | [`06-ai-service.md`](../../06-ai-service.md) §6.2.1 |
| Integration flow | [`06-ai-service.md`](../../06-ai-service.md) §6.4 |
| Failure policy | [`06-ai-service.md`](../../06-ai-service.md) §6.4 |
| `/v1/metrics` | [`06-ai-service.md`](../../06-ai-service.md) §6.2.9 |
| Future extensibility | [`06-ai-service.md`](../../06-ai-service.md) §6.6 |
| DevOps observability | [`11-devops.md`](../../11-devops.md) §11.7 |

---

## 4. Expected Implementation Direction

### Env-toggle wiring

```python
# app/config.py
class Settings(BaseSettings):
    ai_internal_key: str
    models_cache_dir: str = "/models"
    log_level: str = "info"
    enable_metrics: bool = True
    expose_docs: bool = True
    force_fallback: bool = False           # new
    warm_on_startup: bool = False          # new
    ready_requires_model: bool = False     # new
    lru_capacity: int = 1024               # new
    lru_ttl_sec: int = 0                   # new
```

```python
# app/services/summarizer.py
async def summarize(self, text, max_words, style):
    if settings.force_fallback:
        return self._fallback(text, max_words, style, degraded=True)
    ...
```

### Lifespan event for warm-up

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.model_loader = ModelLoader(settings.models_cache_dir)
    if settings.warm_on_startup:
        await app.state.model_loader.get_summarizer()
    yield
```

### Metrics naming (lock these — backend will alert on them)

```
ai_requests_total                  counter        labels: endpoint, status, degraded
ai_request_duration_seconds        histogram      labels: endpoint
ai_model_load_duration_seconds     histogram      labels: model
ai_cache_hits_total                counter        labels: endpoint
ai_cache_misses_total              counter        labels: endpoint
ai_cache_evictions_total           counter        labels: endpoint
ai_model_loaded                    gauge          labels: model
```

Sample registration:

```python
from prometheus_client import Counter, Histogram, Gauge

REQUESTS = Counter("ai_requests_total", "AI requests", ["endpoint", "status", "degraded"])
LATENCY = Histogram("ai_request_duration_seconds", "AI request latency", ["endpoint"], buckets=(0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10))
```

### `integration-with-monolith.md` (single page)

```markdown
# Integration spec: monolith ↔ ai-service

## Base
- URL: http://ai-service:8000 (inside compose)
- Auth: X-Internal-Key: <secret>
- Timeout (recommended caller side): 2000 ms

## /v1/summarize
- Request: { text: str (1..20000), maxWords: int (20..120, default 60), style: "neutral"|"engaging"|"academic" (default "neutral") }
- Response: { summary, confidence (0..1), model, tokensIn, tokensOut, cached } + header `X-Degraded: true|false`
- Errors:
  - 422 VALIDATION_ERROR
  - 413 PAYLOAD_TOO_LARGE
  - 401 INVALID_INTERNAL_KEY
  - 500 INTERNAL_ERROR

## Degradation
- 200 + `X-Degraded: true` → AI returned a fallback. Caller may store but should flag in audit.
- Network/timeout errors → caller may retry once with 200 ms jitter. After repeated failures, caller should open its circuit.

## Latency SLO
- p50 ≤ 600 ms
- p95 ≤ 2000 ms
- p99 ≤ 5000 ms
(measured on dev hardware in Subphase 3; staging targets re-validated in Subphase 5)

## Operational toggles
- FORCE_FALLBACK=true — always returns fallback. Use for chaos testing.
- WARM_ON_STARTUP=true — preload model.
- READY_REQUIRES_MODEL=true — gate readyz on model load.
```

### Swagger gating

```python
app = FastAPI(
  docs_url="/docs" if settings.expose_docs else None,
  redoc_url="/redoc" if settings.expose_docs else None,
)
```

In production env file, set `EXPOSE_DOCS=false`. Staging keeps them on.

---

## 5. Dependencies

### Blocking
- Subphase 3 deliverables: real summarizer, LRU cache, metrics skeleton.

### Soft
- Backend's plan for circuit-breaker thresholds — informs whether to push for any latency improvements before staging.

### Provides for downstream
- Metric name registry — Phase 2 alert rules build on these.
- Runbook — used by whoever takes on-call rotation in Phase 2.
- Integration spec — frozen reference for any future caller.

---

## 6. Suggested Development Order

1. **Day 1** — Add config fields: `force_fallback`, `warm_on_startup`, `ready_requires_model`, `lru_capacity`, `lru_ttl_sec`.
2. **Day 2** — Wire `FORCE_FALLBACK` env path into `SummarizerService`. Tests for it.
3. **Day 3** — Wire `WARM_ON_STARTUP` lifespan. Update `/v1/readyz` to reflect `READY_REQUIRES_MODEL`.
4. **Day 4** — LRU cache: parameterize capacity + TTL; add eviction metric.
5. **Day 5** — Finalize Prometheus metric names + labels per the spec table above. Lock down in `app/middleware/metrics.py`.
6. **Day 6** — Swagger / ReDoc gating; verify schemas show descriptions.
7. **Day 7** — Write `ai-service/docs/integration-with-monolith.md` and circulate with backend handler for review.
8. **Day 8** — Implement `scripts/loadtest.py` (Locust preferred — `locustfile.py`).
9. **Day 9** — Run a 5-min soak at 50 concurrent users; capture metrics; write `ai-service/docs/loadtest-p1.md`.
10. **Day 10** — Tune any hot spots: cache key cost, JSON serialization, prometheus_client overhead. Re-run load test.
11. **Day 11** — Write `ai-service/docs/runbook.md`.
12. **Day 12** — Final test run; ensure CI is green on full suite.
13. **Day 13 — Integration Day** — Pair with backend: exercise FORCE_FALLBACK, then a real flow. Inspect both teams' logs and metrics.
14. **Day 14** — Exit review, tag `v0.4.0`.

---

## 7. Important Considerations

- **Label cardinality.** `degraded` as a label is fine (boolean). Don't add `request_id` or `model_name` to the histogram — high-cardinality labels blow up Prometheus.
- **Backwards compatibility for metric names.** Once published, backend alert rules will reference these. Any rename requires a coordinated PR. Treat the metric names as a public contract.
- **`/v1/metrics` exposure.** Keep behind the internal-key middleware so it's not scraped externally. Document that the Phase 2 Prometheus scraper will need the key configured.
- **Swagger in production.** Off by default. The auto-doc still exists internally; just don't expose externally.
- **Load test environment.** Run against a real container (not in-process). Use the same Docker image you'd ship.
- **Soak duration.** 5 min for P1 is enough; Phase 2 will run a 30-min nightly soak.
- **Don't add new endpoints just because we have time.** Scope creep into Phase 2 territory is forbidden by `docs/09-development-phases.md` §9.1.
- **Warm-up call cost.** ~10–30 s at boot if `WARM_ON_STARTUP=true`. Document the trade-off in the runbook.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff | Confirm that the contract from Subphase 2/3 is unchanged. Lock metric names + labels (this subphase's biggest contract handoff). Discuss whether backend wants a warm-up call from its side at boot. |
| **Backend** | Day 2 | Demonstrate `FORCE_FALLBACK=true` end-to-end so backend can test their degraded handling. |
| **Backend** | Day 7 | Review `integration-with-monolith.md` together — backend confirms it matches their `ai-proxy` implementation. |
| **Backend** | Day 9 | Share load-test results; agree on whether SLO matches their breaker's 2s timeout. If p99 routinely > 2s, recommend distilbart or adjust breaker config. |
| **Backend** | Integration Day | Full demo: real run → trigger FORCE_FALLBACK → recover. |
| **Frontend** | — | No direct comm; FE consumes AI via backend. |

---

## 9. Deliverables

- [ ] Env toggles: `FORCE_FALLBACK`, `WARM_ON_STARTUP`, `READY_REQUIRES_MODEL`, `LRU_CAPACITY`, `LRU_TTL_SEC`.
- [ ] Final Prometheus metric set with locked names + labels.
- [ ] Swagger / ReDoc gated by `EXPOSE_DOCS`.
- [ ] `ai-service/docs/integration-with-monolith.md` — frozen integration contract.
- [ ] `ai-service/docs/loadtest-p1.md` — load test results.
- [ ] `ai-service/docs/runbook.md` — on-call basics.
- [ ] `scripts/loadtest.py` (Locust) committed.
- [ ] `tests/test_force_fallback.py` and `tests/test_metrics_labels.py` passing.
- [ ] README updated with all new env toggles and the meaning of each metric.

### Acceptance checklist
- `FORCE_FALLBACK=true` → every call returns `X-Degraded: true`, `model: fallback-truncate`. Backend can integration-test their degraded path.
- `WARM_ON_STARTUP=true` → `/v1/readyz` returns 503 until model loaded, then 200; verified via `docker compose up` log timing.
- `GET /v1/metrics` returns the locked metric names; `ai_requests_total{endpoint="summarize", status="200", degraded="false"}` increments on real calls.
- Swagger reachable at `/docs` in dev; 404 in prod-like env (`EXPOSE_DOCS=false`).
- Load-test doc shows p95 ≤ 2 s; RSS ceiling documented; cache hit ratio plotted.
- Runbook is ≥ 1 page with at least 4 scenarios.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Metric rename breaks backend alert rules | Lock names with backend in kickoff; treat as contract. Any rename = contract PR. |
| Load test reveals p95 > 2 s | Two paths: (a) ship as-is and increase backend timeout to 3 s (requires re-coordination); (b) switch to distilbart and re-run. Document the decision. |
| `WARM_ON_STARTUP` slows deploys (10–30 s) | Default off. Operators opt in if they want predictable first-request latency. |
| Swagger leaks internal info if accidentally exposed | Default `EXPOSE_DOCS=false` in production env file; PR-review checklist. |
| Locust adds Python deps that conflict | Install in a dev-only extras_require / requirements-dev.txt — not in runtime image. |
| Runbook drifts as implementation changes | Quarterly review reminder; tech lead adds calendar entry post-Phase 1. |
| `FORCE_FALLBACK` accidentally enabled in production | Add a boot-time log warning if set; alert rule could be added Phase 2. |
| Cache eviction metric noisy (every miss) | Counter not gauge — increments cheap; verify with load test. |
