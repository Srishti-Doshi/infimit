# Subphase 3 — Content Engine · AI Service Handler

**Owners:** Zaman, Saloni · **Duration:** Week 5–6 · **Tag at exit:** `v0.3.0`

> **Theme of this subphase:** Replace the Subphase 2 stub with the **real BART-based summarizer**. Lazy-loaded model, deterministic LRU cache, full graceful-degradation behavior, and a Subphase-3 SLO of p95 ≤ 2 s on dev hardware (CPU). The endpoint is ready to be called for real by the backend in Subphase 4.

---

## 1. Objectives

1. Implement `/v1/summarize` with **`facebook/bart-large-cnn`** (or `sshleifer/distilbart-cnn-12-6` if benchmark from Subphase 2 mandated it) per [`docs/06-ai-service.md`](../../06-ai-service.md) §6.2.1 and §6.3.
2. Implement the lazy, memoized model loader.
3. Implement the in-memory LRU cache keyed on `hash(text + maxWords + style)`.
4. Implement graceful degradation: if model load fails, return cached/empty response with `X-Degraded: true`.
5. Enforce all input/output limits and confidence calculation.
6. Achieve and document a p95 latency target on dev hardware.
7. End-to-end smoke test from a mock-backend test harness.

---

## 2. Scope of Work

### In scope
- Real `SummarizerService` in `app/services/summarizer.py`:
  - Loads `facebook/bart-large-cnn` via Hugging Face `pipeline("summarization", model=...)`.
  - Style param influences `min_length` / `max_length` and post-processing prefix.
  - Returns true `confidence` derived from generation scores (mean of `output_scores` if available; fallback heuristic if not).
- Model loader (`app/models/loader.py`):
  - Lazy: model loads on first request.
  - Memoized: subsequent requests reuse the loaded model.
  - Thread-safe: a single `asyncio.Lock` around the load call.
  - Cache directory: `/models` (from env).
- In-memory LRU cache (`app/utils/cache.py`):
  - Capacity: 1024 entries (configurable via env).
  - Key: SHA-256 of `text + str(maxWords) + style`.
  - Value: full response dict.
  - Returns `cached: true` on hit.
  - Metric: `ai_cache_hits_total{endpoint="summarize"}` / `ai_cache_misses_total{...}`.
- Graceful degradation behavior:
  - If model not loaded **and** load fails → respond 200 with `model: "fallback-truncate"`, `summary: <first N words>`, `confidence: 0.0`, `cached: false`, and header `X-Degraded: true`. Log error.
  - If model loaded but inference exception → same fallback, with header `X-Degraded: true`.
- Hard payload limits (per [`docs/06-ai-service.md`](../../06-ai-service.md) §6.5):
  - `text` > 20,000 chars → 413 `PAYLOAD_TOO_LARGE`.
  - `summary` output cap: 500 chars (truncate if model exceeds).
- Telemetry fields in every request log: `endpoint`, `model`, `cached`, `degraded`, `tokens_in`, `tokens_out`, `duration_ms`.
- Tests:
  - `tests/test_summarize_real.py` — uses a tiny fake model fixture; verifies cache, fallback, style behavior.
  - `tests/test_loader.py` — verifies lazy load, single-flight, error handling.
  - Latency benchmark script `scripts/benchmark.py` writes results to `ai-service/docs/latency-p1.md`.

### Out of scope
- `/v1/keywords`, `/v1/recommend`, `/v1/moderate` → Phase 2.
- GPU inference path → Phase 2/3.
- Production observability (Grafana) → Subphase 5.
- Streaming responses → not in scope at all.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| `/v1/summarize` contract (authoritative) | [`06-ai-service.md`](../../06-ai-service.md) §6.2.1 |
| Models & runtime | [`06-ai-service.md`](../../06-ai-service.md) §6.3 |
| Design principles (lazy load, degradation) | [`06-ai-service.md`](../../06-ai-service.md) §6.1 |
| I/O limits | [`06-ai-service.md`](../../06-ai-service.md) §6.5 |
| Phase 1 exit criteria | [`09-development-phases.md`](../../09-development-phases.md) §9.1 |
| Subphase 2 benchmark | `ai-service/docs/bart-benchmark.md` |

---

## 4. Expected Implementation Direction

### Model loader (single-flight, lazy)

```python
import asyncio
from functools import lru_cache

class ModelLoader:
    def __init__(self, cache_dir: str):
        self.cache_dir = cache_dir
        self._models: dict[str, object] = {}
        self._lock = asyncio.Lock()

    async def get_summarizer(self):
        if "summarize" in self._models:
            return self._models["summarize"]
        async with self._lock:
            if "summarize" in self._models:  # double-checked
                return self._models["summarize"]
            from transformers import pipeline
            t0 = perf_counter()
            pipe = pipeline("summarization", model="facebook/bart-large-cnn", cache_dir=self.cache_dir)
            metrics.observe_model_load_seconds("bart-large-cnn", perf_counter() - t0)
            self._models["summarize"] = pipe
            return pipe
```

### Summarizer service

```python
class SummarizerService:
    def __init__(self, loader: ModelLoader, cache: LRUCache):
        self.loader = loader
        self.cache = cache

    async def summarize(self, text: str, max_words: int, style: str) -> dict:
        key = sha256(f"{text}|{max_words}|{style}".encode()).hexdigest()
        if (hit := self.cache.get(key)) is not None:
            metrics.cache_hit("summarize")
            return {**hit, "cached": True}
        metrics.cache_miss("summarize")

        try:
            pipe = await self.loader.get_summarizer()
            result = pipe(text, max_length=self._max_tokens(max_words), min_length=self._min_tokens(max_words), do_sample=False)
            summary = self._format(result[0]["summary_text"], style)[:500]
            confidence = self._confidence(result[0])
            payload = {"summary": summary, "confidence": confidence, "model": "facebook/bart-large-cnn",
                       "tokensIn": _word_count(text), "tokensOut": _word_count(summary), "cached": False}
            self.cache.set(key, payload)
            return payload
        except Exception as e:
            logger.warning("summarize_degraded", error=str(e))
            return self._fallback(text, max_words, style, degraded=True)
```

### Confidence heuristic (P1)

True BART probabilities require `output_scores=True` + token-by-token aggregation. As a P1 heuristic, use:

```python
def _confidence(out) -> float:
    # placeholder: combination of length ratio + naive estimate
    return round(min(1.0, len(out["summary_text"]) / 400), 2)
```

Document this in the README as "heuristic — to be replaced with token-prob mean in Phase 2."

### Style → generation parameters

| Style | min_length | max_length | Prefix |
|-------|------------|------------|--------|
| neutral | 30 tokens | 80 tokens | (none) |
| engaging | 40 tokens | 100 tokens | "In a striking development, " (post-process) |
| academic | 50 tokens | 120 tokens | "Abstract: " |

(Prefixes apply post-generation to keep BART's tone clean.)

### Graceful degradation contract

When falling back, the service:
- Still returns 200 OK (the backend's `ai-proxy` treats 200+`X-Degraded` as "acceptable but flag in audit").
- Sets header `X-Degraded: true`.
- Sets response `model` to `"fallback-truncate"`.
- Sets `confidence` to `0.0`.

If load fails on the **first** request specifically (cold-start path), this is the most likely degradation event. After backend's circuit breaker logic engages (Subphase 4), it may stop calling for 30 s; that's fine.

### Latency tracking

- Histogram bucket: `[0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10]` seconds.
- Target: **p95 ≤ 2 s** on dev hardware (CPU, 4 cores, 16 GB RAM) for a 5 KB article.
- If benchmark shows > 2 s, consider:
  - Switch to `distilbart-cnn-12-6` (smaller, ~2x faster).
  - Truncate input at 1024 tokens (BART's positional limit).
  - Lower `max_length` defaults.

---

## 5. Dependencies

### Blocking
- Subphase 2 contract freeze.
- Subphase 2 benchmark — informs model choice.

### Soft
- Backend's Subphase 3 work doesn't depend on this; backend integrates in Subphase 4. But sharing the benchmark with backend helps them set the right circuit-breaker thresholds.

### Provides for downstream
- Real `/v1/summarize` ready for backend integration in Subphase 4.
- Latency SLO doc — referenced when backend tunes the 2-second timeout & retry policy.

---

## 6. Suggested Development Order

1. **Day 1** — Lazy loader with `asyncio.Lock`. Unit tests with mock `pipeline`.
2. **Day 2** — LRU cache implementation. Unit tests for capacity, eviction, hit/miss metrics.
3. **Day 3** — Integrate BART into `SummarizerService`. Verify happy path with a real article body locally.
4. **Day 4** — Style param routing → generation parameters. Validate output for all 3 styles.
5. **Day 5** — Output post-processing: 500-char truncate, prefix application, confidence heuristic.
6. **Day 6** — Fallback path: simulate load failure, simulate inference exception. Verify `X-Degraded: true` header and `model: "fallback-truncate"`.
7. **Day 7** — Wire cache reads + writes. Verify cache hit returns `cached: true` and consistent payload.
8. **Day 8** — Replace metrics placeholders with real values: `ai_request_duration_seconds`, `ai_cache_hits/misses_total`, `ai_model_load_duration_seconds`.
9. **Day 9** — Update tests: `test_summarize_real.py` with a tiny mock pipeline; `test_loader.py` for concurrent calls.
10. **Day 10** — Run `scripts/benchmark.py` on a corpus of 30 sample articles (use Reuters / news samples) — capture p50/p95/p99. Write `ai-service/docs/latency-p1.md`.
11. **Day 11** — Tune: if p95 > 2 s, swap to distilbart, re-run, update doc.
12. **Day 12** — Document the `/v1/readyz` semantics: 200 only after first model load **completes** if `READY_REQUIRES_MODEL=true` env is set. Otherwise 200 immediately (lazy ready). Default to lazy.
13. **Day 13 — Integration Day** — Backend (separately working on Subphase 3) can curl `/v1/summarize` from inside compose with a real article body and get a real BART summary. Smoke-test fallback by toggling `FORCE_FALLBACK=true` env.
14. **Day 14** — Exit review, tag `v0.3.0`.

---

## 7. Important Considerations

- **First request is slow.** Cold-load BART can take 10–30 s. Communicate this clearly to backend so they don't tighten timeouts unrealistically. Optional: trigger a warm-up call at startup (cheap heuristic: load synchronously during `lifespan`).
- **RAM ceiling.** BART-large-cnn ≈ 2 GB resident. Single Uvicorn worker per container. Document peak RSS in benchmark doc.
- **No PII / no source text in logs.** Log `len(text)` only.
- **Cache invalidation.** None for P1 — entries are immutable until eviction. If a different article happens to share a hash (collision), SHA-256 makes this astronomically unlikely.
- **Time budget vs accuracy.** P1 prioritizes shipping; do **not** chase advanced confidence calc. Heuristic + note in code.
- **Determinism.** Set `do_sample=False`, no temperature, no top_p. Cache becomes reliable.
- **Concurrent requests.** Single-process Uvicorn means the pipeline is shared but inference is GIL-bound. Acceptable for P1; concurrency scaling is Phase 2.
- **Output truncation policy.** If model output > 500 chars, truncate at the **last word boundary** before 500 chars, append `…`. Document this.
- **413 envelope.** Stays `{ "error": { "code": "PAYLOAD_TOO_LARGE", "message": "text exceeds 20000 chars" } }`.
- **Tokenizer truncation.** BART has 1024-token input limit. Use `truncation=True` in the pipeline call — silently truncates without raising. Document this trade-off (long articles get the leading content prioritized; acceptable for MVP).
- **Eviction policy.** OrderedDict-based LRU is sufficient; no need for external `cachetools`.
- **No async inference yet.** BART is sync; wrap with `asyncio.to_thread(...)` so it doesn't block the event loop.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff | Confirm contract still locked from Subphase 2. Confirm AI service URL inside compose. Share the cold-start latency expectation (10–30 s) so backend doesn't fail healthchecks during model load. |
| **Backend** | Day 10 | Share the latency-p1 doc; align on backend's circuit-breaker thresholds (default 2 s timeout / 5 failures / 30 s cooldown — confirm these still match). |
| **Backend** | Integration Day | Backend curl-tests from inside compose; together verify `X-Degraded` behavior by toggling `FORCE_FALLBACK`. |
| **Frontend** | — | None this subphase. |

---

## 9. Deliverables

- [ ] `SummarizerService` with real `facebook/bart-large-cnn` inference (or distilbart per benchmark decision).
- [ ] Lazy, memoized, thread-safe model loader.
- [ ] In-memory LRU cache with hit/miss metrics.
- [ ] Graceful degradation path setting `X-Degraded: true` header and `model: fallback-truncate`.
- [ ] All 422 / 413 / 401 envelopes correct.
- [ ] Style param routes through to generation parameters and post-processing prefixes.
- [ ] Output truncated at 500 chars at word boundary.
- [ ] Confidence heuristic in place (documented as P1 heuristic).
- [ ] Prometheus metrics emit real values: request count, latency histogram, model load time, cache hit/miss.
- [ ] `scripts/benchmark.py` runnable; `ai-service/docs/latency-p1.md` committed with p50/p95/p99 data.
- [ ] Tests: real-flow with mock pipeline, loader concurrency, cache, fallback.
- [ ] README updated with: how the cache works, fallback behavior, performance expectations, cold-start guidance.

### Acceptance checklist
- `POST /v1/summarize` with a 5 KB article → 200 with real summary in ≤ 2 s (after warm).
- Cold-start first request: returns within timeout *or* completes lazy load → backend should retry once.
- Second identical request → `cached: true`, returns in < 10 ms.
- 20,001-char body → 413.
- Empty body → 422.
- `FORCE_FALLBACK=true` → `X-Degraded: true`, `model: fallback-truncate`.
- `GET /v1/metrics` includes `ai_request_duration_seconds_bucket` histogram with non-zero counts.
- Benchmark doc shows p95 ≤ 2 s on dev hardware (or distilbart fallback decision recorded).

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Cold-load > 30 s on slow machines | Optional `WARM_ON_STARTUP=true` env triggers synchronous load in `lifespan`; readyz blocks until done. Document trade-off (slower deploys but no first-request degradation). |
| BART RAM peaks > 3 GB on long articles | Truncate input to 1024 tokens via `truncation=True`. Document. |
| p95 > 2 s on CPU consistently | Swap to `sshleifer/distilbart-cnn-12-6`. Re-benchmark. Decision recorded in `latency-p1.md`. |
| LRU collisions (different inputs, same key) | SHA-256 collision probability is negligible. No mitigation needed; mention in docs. |
| Confidence heuristic misleading | Mark clearly as P1 heuristic in code + README; Phase 2 ticket to replace with log-prob mean. |
| Async event loop blocked by sync inference | Wrap inference in `asyncio.to_thread(...)`. Verify under load test. |
| Multi-worker Uvicorn duplicates 2 GB model per worker | Single worker for P1; document. Phase 2 considers shared-memory or model server pattern. |
| Mock pipeline in tests drift from real interface | Use a fixture that mimics `transformers.pipeline("summarization")` return shape exactly. Real-pipeline smoke test in a slow CI job. |
| Hugging Face download blocked in CI | Pre-cache model in CI image; or skip the integration-with-real-model test in CI and only run locally / nightly. |
