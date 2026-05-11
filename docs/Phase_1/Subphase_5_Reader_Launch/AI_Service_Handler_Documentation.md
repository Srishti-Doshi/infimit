# Subphase 5 — Reader Experience + Launch · AI Service Handler

**Owners:** Zaman, Saloni · **Duration:** Week 9–10 · **Tag at exit:** `v0.5.0` (≡ MVP)

> **Theme of this subphase:** Production-shape the service for staging. Final Docker image, observability dashboards, deploy automation, staging soak, on-call runbook. Lock the contract; freeze. Surface a Phase 2 readiness report.

---

## 1. Objectives

1. Finalize multi-stage Dockerfile (image size, security, non-root, healthcheck).
2. Deploy `ai-service` to staging via root CI; reachable from backend's staging deployment.
3. Configure model storage strategy in staging (volume mount + pre-warmed by deploy step).
4. Run a staging soak test (30 min, 50 concurrent users) and capture results.
5. Finalize Grafana dashboard spec and Sentry integration.
6. Update + freeze on-call runbook for staging.
7. Write Phase 2 readiness report (gap analysis, recommended sequence for `/keywords` → `/recommend` → `/moderate`).
8. Tag `v0.5.0`. MVP complete from AI side.

---

## 2. Scope of Work

### In scope
- **Final Dockerfile:**
  - Multi-stage, non-root user `app`.
  - Builder stage installs deps; runner has only runtime.
  - Healthcheck against `/v1/healthz`.
  - Image size target: ≤ 1.5 GB.
  - Pin CPU-only torch wheels.
  - `HF_HUB_OFFLINE=1` if model is bundled into the image (decide based on staging hosting); otherwise rely on volume.
- **Staging deploy automation:**
  - GitHub Actions workflow `.github/workflows/ai-service-deploy.yml`:
    - On push to `main`: build → push GHCR → deploy to Render/Railway.
    - Post-deploy: poll `/v1/healthz` until 200; fail deploy on timeout.
  - Optionally trigger a one-time `/v1/summarize` warm-up call from CI as a post-deploy step.
- **Staging configuration:**
  - `WARM_ON_STARTUP=true` recommended (predictable first request).
  - `READY_REQUIRES_MODEL=true` so the load balancer doesn't send traffic until model loaded.
  - `EXPOSE_DOCS=false`.
  - `LRU_CAPACITY=2048`, `LRU_TTL_SEC=86400`.
  - Internal key rotated from dev value.
- **Observability:**
  - Sentry SDK integrated; capture exceptions with `request_id` tag.
  - Grafana dashboard spec in `ai-service/docs/grafana-dashboard.json` (importable). Panels:
    - p50/p95/p99 latency.
    - Request rate by status.
    - Cache hit ratio.
    - Model loaded gauge.
    - Degraded request rate.
- **Staging soak test:**
  - 30 minutes, 50 concurrent users mixed cache-hit + cache-miss.
  - Capture p50/p95/p99, RSS, cache hit ratio, Sentry errors.
  - Write to `ai-service/docs/staging-soak.md`.
- **Runbook updates:**
  - Add staging deploy steps.
  - Add Sentry triage flow.
  - Add common errors + resolutions.
- **Phase 2 readiness report:**
  - `ai-service/docs/phase2-plan.md` — for each upcoming endpoint (`/keywords`, `/recommend`, `/moderate`, `/tts`, `/semantic-search`), capture: target SLO, model choice candidate, RAM ceiling estimate, integration impact on backend, time estimate. This is the input for Phase 2 planning.

### Out of scope
- New endpoints. Repeat: any of `/keywords`, `/recommend`, `/moderate`, `/tts`, `/semantic-search` is **Phase 2 or 3** per `docs/09-development-phases.md`. Only document; do not implement.
- Migration to hosted LLMs (Claude/GPT-4o) → Phase 3.
- GPU inference → Phase 2/3.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Dockerfile guidance | [`11-devops.md`](../../11-devops.md) §11.4 |
| CI/CD | [`11-devops.md`](../../11-devops.md) §11.5 |
| Hosting architecture | [`11-devops.md`](../../11-devops.md) §11.6 |
| Observability | [`11-devops.md`](../../11-devops.md) §11.7 |
| AI service spec (all sections) | [`06-ai-service.md`](../../06-ai-service.md) |
| Future endpoints | [`06-ai-service.md`](../../06-ai-service.md) §6.6 |
| Phase 1 exit criteria | [`09-development-phases.md`](../../09-development-phases.md) §9.1 |
| Phase 2 scope | [`09-development-phases.md`](../../09-development-phases.md) §9.2 |

---

## 4. Expected Implementation Direction

### Final Dockerfile sketch

```Dockerfile
# Builder
FROM python:3.11-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY pyproject.toml requirements.txt ./
RUN pip wheel --wheel-dir /wheels --no-deps --extra-index-url https://download.pytorch.org/whl/cpu -r requirements.txt

# Runner
FROM python:3.11-slim
RUN useradd --create-home --uid 1001 app && mkdir -p /models && chown -R app /models
WORKDIR /app
COPY --from=builder /wheels /wheels
RUN pip install --no-cache-dir /wheels/*.whl && rm -rf /wheels
COPY app/ app/
USER app
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=60s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/v1/healthz', timeout=3)" || exit 1
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Sentry integration

```python
# main.py
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
if settings.sentry_dsn:
    sentry_sdk.init(dsn=settings.sentry_dsn, traces_sample_rate=0.0, send_default_pii=False, environment=settings.env)
```

- `traces_sample_rate=0.0` in P1 — Phase 2 adds OpenTelemetry traces per `docs/11-devops.md` §11.7.

### Staging deploy CI sketch

```yaml
# .github/workflows/ai-service-deploy.yml
name: AI service deploy
on:
  push:
    branches: [main]
    paths: [ai-service/**]
jobs:
  build-deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build & push image
        run: |
          docker build -t ghcr.io/<org>/ai-service:${{ github.sha }} ai-service/
          docker push ghcr.io/<org>/ai-service:${{ github.sha }}
      - name: Deploy to staging
        run: curl -X POST $RENDER_DEPLOY_HOOK
      - name: Smoke
        run: ./scripts/wait-for-healthz.sh https://staging-ai.infimit.com 120
      - name: Warm-up
        run: curl -X POST -H "X-Internal-Key: $KEY" https://staging-ai.infimit.com/v1/summarize -d '{"text":"warm-up text","maxWords":20,"style":"neutral"}'
```

### Phase 2 readiness report — required content per endpoint

For each of: `/keywords`, `/recommend`, `/moderate`, `/tts`, `/semantic-search`:
- Target SLO (p50/p95).
- Candidate model + size + RAM.
- CPU vs GPU trade-off.
- Integration impact on monolith (new ai-proxy method).
- Data dependencies (e.g., recommend needs candidate pool from monolith).
- Estimated effort: model integration + tests + observability.

---

## 5. Dependencies

### Blocking
- Subphase 4: final metrics + cache + degradation behaviors.

### Soft
- Backend's staging deployment timing — both should hit staging at the same integration day.

### Provides for downstream
- Staging-deployed `ai-service` reachable from backend's staging deployment → MVP closed-beta ready.
- Phase 2 readiness report — direct input to Phase 2 planning.

---

## 6. Suggested Development Order

1. **Day 1** — Finalize Dockerfile; build, check image size. Iterate.
2. **Day 2** — Wire Sentry SDK. Verify exception capture.
3. **Day 3** — Author staging deploy workflow (`.github/workflows/ai-service-deploy.yml`); test with a draft PR.
4. **Day 4** — Deploy to staging the first time; verify reachability. Apply env vars: `WARM_ON_STARTUP=true`, `READY_REQUIRES_MODEL=true`, etc.
5. **Day 5** — Mount staging models volume; verify `/v1/readyz` flips green only after model loaded.
6. **Day 6** — Author `ai-service/docs/grafana-dashboard.json` with all panels. Verify the Prometheus scrape contract still matches.
7. **Day 7** — Staging soak test 30 min @ 50 concurrent. Record numbers.
8. **Day 8** — Tune anything off-target. Re-run if necessary.
9. **Day 9** — Update runbook with Sentry triage, deploy procedure, common errors.
10. **Day 10** — Write `phase2-plan.md`. Estimate hours per endpoint.
11. **Day 11** — Final docs sweep: README, integration spec, all `ai-service/docs/*.md`.
12. **Day 12** — Pair with backend handler on the final staging smoke: backend → AI on staging URL, real summary returns, degradation toggled, recovered.
13. **Day 13 — Integration Day** — Full MVP demo with frontend on staging.
14. **Day 14** — Exit review, tag `v0.5.0`.

---

## 7. Important Considerations

- **Image size budget vs cold start.** Smaller image (no baked model) means faster pulls but slower cold start (model loads from volume). Larger image (model baked) means slower pulls but faster cold start. P1 recommendation: **volume-mount on staging** (matches dev), bake into image only if Phase 2 ops requires it.
- **Sentry rate.** Default `send_default_pii=False`. Strip `Authorization`, `X-Internal-Key`, and request bodies before sending.
- **Frozen contract.** Treat `/v1/summarize` request/response, headers, error envelope, and metric names as **frozen** after this subphase. Any change requires a contract PR.
- **Warm-up call post-deploy.** Helps. Adds 10–30 s to deploy time. Acceptable trade-off in staging.
- **Healthz vs readyz on the orchestrator.** Use `/v1/readyz` as the orchestrator's readiness probe. Use `/v1/healthz` as the liveness probe. Per `docs/11-devops.md` §11.7 wording (uptime probes hit healthz).
- **Cache durability.** LRU is in-memory; restarting the container loses the cache. Acceptable for P1; Phase 2 may evaluate Redis-backed cache.
- **Logging volume.** A 30-min soak at 50 RPS could produce ~90K log lines. Make sure stdout is OK for the staging host's log retention. If high cost, lower `LOG_LEVEL` to `warning` and rely on metrics.
- **No new endpoints.** This bears repeating. Scope creep is the #1 risk in the last subphase.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff | Confirm staging URL convention (e.g., `staging-ai.infimit.com`). Confirm internal key rotation. Confirm backend's circuit breaker settings still match observed p95 in staging. |
| **Backend** | Day 7 | Compare staging soak results with backend's load-test of the full system. Agree on whether MVP exit gate is met for AI latency. |
| **Backend** | Integration Day | Joint staging demo. Walk through degradation toggling. Final sign-off. |
| **Frontend** | — | No direct comm; FE reads AI summaries through backend. |
| **Tech lead** | Day 10 | Submit `phase2-plan.md`; align on which endpoint ships first in Phase 2 (likely `/keywords` since it's cheap and complements summarize). |

---

## 9. Deliverables

- [ ] Final multi-stage Dockerfile; image ≤ 1.5 GB.
- [ ] Sentry integrated; exceptions captured.
- [ ] Staging deploy CI workflow.
- [ ] Successful staging deployment reachable from backend.
- [ ] Grafana dashboard JSON committed.
- [ ] Staging soak test results in `ai-service/docs/staging-soak.md`.
- [ ] Runbook updated for staging operations.
- [ ] `ai-service/docs/phase2-plan.md` — endpoint-by-endpoint readiness.
- [ ] README final updates.
- [ ] Tagged `v0.5.0`.

### Acceptance checklist
- `docker images ai-service` → ≤ 1.5 GB.
- Staging URL → `/v1/healthz` returns 200; `/v1/readyz` returns 200 after warm-up.
- Backend in staging calls `/v1/summarize` successfully end-to-end.
- 30-min soak: p95 ≤ 2 s; no Sentry errors; cache hit ratio > 60% under realistic load.
- Grafana dashboard imports cleanly; panels populated.
- Runbook scenarios cover at least: degraded service, restart, internal key mismatch, cold start, OOM.
- Phase 2 readiness report covers all five future endpoints with concrete numbers.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Staging hosting (Render/Railway) doesn't expose persistent volumes large enough for model | Bake model into the image for staging only; revisit for Phase 2 prod hosting. Document the deviation. |
| Cold start makes the first staging request slow → backend circuit opens | `WARM_ON_STARTUP=true` + `READY_REQUIRES_MODEL=true` → load balancer doesn't route until ready. |
| Soak test reveals memory leak | Profile with `tracemalloc`; check for unbounded caches or accumulating logs. If detected, document fix + ship; if blocker, escalate. |
| Free-tier staging gets killed for idleness | Configure a small uptime ping (UptimeRobot) every 5 min to keep it warm. |
| Phase 2 readiness report becomes a Phase 2 plan | Stay scoped: 1 page per endpoint, no architecture redesign. |
| Image size hits 1.5 GB ceiling because of torch + transformers | Use CPU-only torch (`+cpu` wheels); strip unused languages from tokenizers; remove tests from runtime image. |
| Sentry budget exceeded | Cap with `before_send` filter and rate-limit ingestion in Sentry's project settings. |
| Integration day reveals a stale env var | Maintain a single source of truth for env vars in `ai-service/docs/env-vars.md`; verify staging matches. |
| Frozen contract dispute mid-subphase | Reject without contract PR; defer to Phase 2. |
| Last-week burn-out | Day 14 is for review only — keep Day 13 as the last working day. Scope intentionally lighter. |
