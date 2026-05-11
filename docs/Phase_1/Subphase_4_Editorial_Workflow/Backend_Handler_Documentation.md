# Subphase 4 — Editorial Workflow + AI Integration · Backend Handler

**Owner:** You · **Duration:** Week 7–8 · **Tag at exit:** `v0.4.0`

> **Theme of this subphase:** The platform earns its name. Editors approve and publish. Comments live. Notifications fan out. The AI pipeline fires on approve and writes the summary back. Redis caches accelerate the article + feed reads. E-paper uploads work end-to-end.

---

## 1. Objectives

1. Complete the `articles` state machine: approve, reject, publish, unpublish, placement (per [`docs/07-workflows.md`](../../07-workflows.md) §7.1).
2. Implement `ai-proxy` module: opossum circuit breaker + 2s timeout + retry + fallback (per [`docs/06-ai-service.md`](../../06-ai-service.md) §6.4).
3. Implement the AI pipeline on approve: parallel `summarize` + reading-time compute, write back to `article.ai.*`, graceful degradation (per [`docs/07-workflows.md`](../../07-workflows.md) §7.7).
4. Implement `comments` module per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.5 (manual moderation; AI moderation deferred to Phase 2).
5. Implement `notifications` module (in-app only) per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.8.
6. Implement `epaper` module per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.10.
7. Stand up Redis caches for article/slug and home feed with the invalidation rules in [`docs/04-database-design.md`](../../04-database-design.md) §4.5.
8. Implement basic search (Mongo text index) per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.12.

---

## 2. Scope of Work

### In scope
- **`articles` (complete the state machine):**
  - `POST /v1/articles/:id/approve` (📝👑) — `submitted → approved`; **fires AI pipeline**.
  - `POST /v1/articles/:id/reject` (📝👑) — `submitted → rejected`; notify author.
  - `POST /v1/articles/:id/publish` (📝👑) — `approved → published`; cache invalidate; index in search; notify subscribers.
  - `POST /v1/articles/:id/unpublish` (👑) — `published → unpublished`; cache + search cleanup; notify author.
  - `PATCH /v1/articles/:id/placement` — featured/trending/trail/priority.
  - `POST /v1/articles/:id/ai/summary` (📝✍️) — force-regenerate summary (`force=true` body).
  - `GET /v1/articles/:slug` — public; returns published articles with full AI fields.
- **`ai-proxy` module:**
  - `aiProxy.summarize(text, opts) → { summary, confidence, model, degraded }`.
  - axios client with `X-Internal-Key` header, base URL from env.
  - **opossum** circuit breaker: 2 s timeout, 5 consecutive failures → open, 30 s reset.
  - 1 retry with 200 ms jitter on retriable errors (timeout, 5xx).
  - Bubble `X-Degraded` header from AI into a boolean on the return value.
  - Fallback on circuit open: return `{ degraded: true, model: "circuit-open", summary: "" }` and let caller skip writing.
- **AI pipeline orchestration** in `articles.service.approve`:
  - Parallel: `aiProxy.summarize(plainText)`, compute `readingTimeMin = ceil(wordCount/200)`.
  - Write to `article.ai.summary`, `article.ai.readingTimeMin`, `article.ai.degraded` (boolean).
  - If degraded, do **not** block approval. Article moves to `approved` anyway.
  - Emit `article.approved` event.
- **`comments` module:**
  - `POST /v1/articles/:articleId/comments` (👤) — defaults to `status=pending`.
  - `GET /v1/articles/:articleId/comments` (🌍) — returns approved only.
  - `GET /v1/comments/pending` (📝👑) — moderation queue.
  - `POST /v1/comments/:id/approve|reject|hide` (📝👑).
  - `DELETE /v1/comments/:id` (owner/📝👑).
  - Rate limit: 10/min per user.
- **`notifications` module (in-app only):**
  - Mongo collection per [`docs/04-database-design.md`](../../04-database-design.md) §4.2.8.
  - Event listeners:
    - `article.approved` → notify author (`article_approved`).
    - `article.rejected` → notify author (`article_rejected`).
    - `article.published` → notify subscribers (P1 = author + any reader who bookmarked the author; expand in P2).
    - `comment.approved` → notify article author (`new_comment`).
  - `GET /v1/notifications`, `POST /v1/notifications/:id/read`, `POST /v1/notifications/read-all`.
- **`epaper` module:**
  - `POST /v1/epapers` (admin) — multipart-free (links to media docs).
  - `GET /v1/epapers`, `GET /v1/epapers/:id`, `GET /v1/epapers/:id/download`, `DELETE /v1/epapers/:id`.
- **Redis caches** (per [`docs/04-database-design.md`](../../04-database-design.md) §4.5):
  - `article:slug:<slug>` (TTL 5 min) — set on first GET; invalidate on publish/unpublish/update.
  - `feed:home` (TTL 60 s) — populated in Subphase 5 but invalidation hook wired now.
- **`search` module (basic):**
  - `indexArticle(article)` on publish (no-op for Mongo text index since it's automatic on insert, but call as a stub so the seam exists).
  - `removeArticle(articleId)` on unpublish.
  - `searchText(query, filters)` using `$text` operator.

### Out of scope
- AI moderation of comments → Phase 2.
- Real email delivery → Phase 2.
- Trending compute job → Subphase 5 (basic version).
- Analytics writer → Subphase 5.
- PDF generation, public reader feeds → Subphase 5.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Articles full state machine | [`07-workflows.md`](../../07-workflows.md) §7.1 |
| AI pipeline | [`07-workflows.md`](../../07-workflows.md) §7.7 |
| Articles API contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.5 |
| Comments contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.6 |
| Notifications contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.9 |
| E-paper contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.11 |
| ai-proxy module surface | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.13 |
| Integration flow (monolith ↔ AI) | [`06-ai-service.md`](../../06-ai-service.md) §6.4 |
| Failure policy (retry, breaker) | [`06-ai-service.md`](../../06-ai-service.md) §6.4 |
| Cache strategy + invalidation | [`04-database-design.md`](../../04-database-design.md) §4.5 |
| Comment moderation flow | [`07-workflows.md`](../../07-workflows.md) §7.2 |
| Notification fan-out flow | [`07-workflows.md`](../../07-workflows.md) §7.6 |

---

## 4. Expected Implementation Direction

### `ai-proxy` module shape

```ts
// modules/ai-proxy/service.ts
import CircuitBreaker from "opossum";
import axios, { AxiosInstance } from "axios";

const http: AxiosInstance = axios.create({
  baseURL: env.AI_SERVICE_URL,
  timeout: 2000,
  headers: { "X-Internal-Key": env.AI_INTERNAL_KEY },
});

const breaker = new CircuitBreaker(callSummarize, {
  timeout: 2000,
  errorThresholdPercentage: 0,        // we'd rather use volume threshold
  rollingCountTimeout: 30000,
  rollingCountBuckets: 10,
  volumeThreshold: 5,                 // approx 5 failures → open
  resetTimeout: 30000,
});

breaker.fallback(() => ({ summary: "", confidence: 0, model: "circuit-open", degraded: true, cached: false, tokensIn: 0, tokensOut: 0 }));

async function callSummarize(body: SummarizeRequest): Promise<SummarizeResponse & { degraded: boolean }> {
  try {
    const res = await http.post("/v1/summarize", body);
    return { ...res.data, degraded: res.headers["x-degraded"] === "true" };
  } catch (e: any) {
    // single retry with 200ms jitter on retriable errors
    if (isRetriable(e)) {
      await sleep(200 + Math.random() * 100);
      const res = await http.post("/v1/summarize", body);
      return { ...res.data, degraded: res.headers["x-degraded"] === "true" };
    }
    throw e;
  }
}

export const aiProxy = {
  summarize: (text: string, opts: { maxWords?: number; style?: "neutral"|"engaging"|"academic" } = {}) =>
    breaker.fire({ text, maxWords: opts.maxWords ?? 60, style: opts.style ?? "neutral" }),
};
```

### Approve service (key flow)

```ts
async function approveArticle(articleId: string, actor: User) {
  const a = await repo.findById(articleId);
  if (!a) throw new ApiError(404, "ARTICLE_NOT_FOUND");
  if (a.status !== "submitted") throw new ApiError(409, "INVALID_STATE");

  const updated = await repo.transition({ _id: articleId, fromStatus: "submitted", toStatus: "approved", version: a.version, approvedAt: new Date(), editorId: actor.id });
  if (!updated) throw new ApiError(409, "VERSION_CONFLICT");

  // Fire AI pipeline async — do not block the approval response on it
  setImmediate(() => runAiPipeline(updated).catch((e) => logger.warn({ err: e }, "ai_pipeline_failed")));

  events.emit("article.approved", { articleId, authorId: a.authorId });
  return updated;
}

async function runAiPipeline(article: Article) {
  const [summarizeResult, readingTimeMin] = await Promise.all([
    aiProxy.summarize(article.plainText, { maxWords: 60, style: "neutral" }),
    Promise.resolve(Math.ceil(wordCount(article.plainText) / 200)),
  ]);
  await repo.setAiFields(article._id, {
    summary: summarizeResult.summary || null,
    readingTimeMin,
    degraded: summarizeResult.degraded,
    model: summarizeResult.model,
  });
}
```

### Publish service

```ts
async function publishArticle(articleId: string, actor: User) {
  const a = await repo.findById(articleId);
  if (!a) throw new ApiError(404, "ARTICLE_NOT_FOUND");
  if (a.status !== "approved") throw new ApiError(409, "INVALID_STATE");

  const updated = await repo.transition({ _id: articleId, fromStatus: "approved", toStatus: "published", version: a.version, publishedAt: new Date() });
  if (!updated) throw new ApiError(409, "VERSION_CONFLICT");

  await cache.del(`article:slug:${a.slug}`, "feed:home", "feed:trending", `feed:category:${a.category}`);
  await search.indexArticle(updated);
  events.emit("article.published", { articleId, authorId: a.authorId, category: a.category });
  return updated;
}
```

### Cache wrapper

```ts
// shared/cache.ts
export const cache = {
  async getOrSet<T>(key: string, ttlSec: number, fn: () => Promise<T>): Promise<T> { ... },
  async del(...keys: string[]) { await redis.del(...keys); },
};
```

### `force=true` summary regenerate

```ts
// POST /v1/articles/:id/ai/summary { force?: boolean }
async function regenerateSummary(articleId: string, actor: User, force = true) {
  const a = await repo.findById(articleId);
  if (!a) throw new ApiError(404, "ARTICLE_NOT_FOUND");
  if (!["approved", "published"].includes(a.status)) throw new ApiError(409, "INVALID_STATE");
  if (actor.role === "author" && a.authorId.toString() !== actor.id) throw new ApiError(403, "FORBIDDEN");

  const r = await aiProxy.summarize(a.plainText, { maxWords: 60, style: "neutral" });
  await repo.setAiFields(a._id, { summary: r.summary, degraded: r.degraded, model: r.model });
  // Invalidate cached article view if published
  if (a.status === "published") await cache.del(`article:slug:${a.slug}`);
  return { ai: { summary: r.summary, degraded: r.degraded, model: r.model } };
}
```

### Comments module — moderation flow

Per [`docs/07-workflows.md`](../../07-workflows.md) §7.2.

### Notifications event listeners

```ts
events.on("article.approved", async ({ articleId, authorId }) => {
  await notif.send({ userId: authorId, type: "article_approved", channel: "in_app", link: `/article/${slug}` });
});
events.on("article.rejected", async (...) => {...});
events.on("article.published", async (...) => {...});
events.on("comment.approved", async (...) => {...});
```

### Health / readiness signals for AI

- Probe `/v1/healthz` on AI service at backend boot for an informational log; not a hard dependency (AI can still be down — circuit breaker handles).
- Expose a small admin endpoint or log line indicating circuit breaker state changes (`opened`, `halfOpen`, `closed`).

---

## 5. Dependencies

### Blocking
- Subphase 3: `articles` (draft/submit), `media`.
- Subphase 3 AI: real `/v1/summarize`.

### Soft
- Frontend's editor portal — but FE is unblocked through MSW for everything backend hasn't shipped.

### Provides for downstream
- Article publishing + cache invalidation pattern → reused by feeds in Subphase 5.
- Notifications infrastructure → expanded by Phase 2 email worker.
- ai-proxy → reused for every future AI endpoint (keywords, recommend, tts).

---

## 6. Suggested Development Order

1. **Day 1** — `ai-proxy` module: axios client, opossum breaker, retry helper. Unit tests with `nock` mocking AI.
2. **Day 2** — Integration test: backend ↔ real AI service via compose (read `latency-p1.md` to size timeouts realistically).
3. **Day 3** — `articles.service.approve` with AI pipeline orchestration. Verify graceful degradation by toggling `FORCE_FALLBACK=true` on AI.
4. **Day 4** — `articles.service.reject`, `publish`, `unpublish` with full validation per `docs/07-workflows.md` §7.1.
5. **Day 5** — Placement endpoint and its validator. Editor/admin RBAC.
6. **Day 6** — `regenerateSummary` endpoint. Cache invalidation on regenerate for published articles.
7. **Day 7** — Redis cache wrapper + `article:slug:<slug>` cache on GET. Tests for hit, miss, invalidate.
8. **Day 8** — `comments` module: model, repository, post, list-approved, moderation actions, delete.
9. **Day 9** — `notifications` module: model, send helper, list/markRead endpoints. Event listeners wire.
10. **Day 10** — `epaper` module: schema, upload (links media), list, get, download stream, delete.
11. **Day 11** — `search` module: text index search + indexArticle/remove stubs.
12. **Day 12** — Integration test suite expanded: approve happy + AI degraded + publish + cache invalidation + comment moderation + e-paper upload.
13. **Day 13 — Integration Day** — Full demo: author submits → editor approves → AI summary set → editor publishes → reader sees article + summary. Comments posted, moderated. Admin uploads e-paper.
14. **Day 14** — Exit review, tag `v0.4.0`.

---

## 7. Important Considerations

- **AI pipeline must not block approval.** Use `setImmediate` (or BullMQ later) so the response returns immediately and the AI call runs in the background. Per [`docs/07-workflows.md`](../../07-workflows.md) §7.7.
- **Idempotency on AI call.** `force=true` skips the cache check; default behavior should skip the call if `article.ai.summary` already exists. Set this via a service-level flag.
- **Bubble `X-Degraded`.** Backend's response on `POST /v1/articles/:id/ai/summary` should include a `degraded: boolean` field in the response body so the FE can show its badge without needing the header.
- **Circuit-breaker hygiene.** Log every state transition (open/halfOpen/closed) with the consecutive failure count. Phase 2 will route these to Prometheus.
- **opossum vs naive try/catch.** Use opossum because it gives us metrics + half-open state for free. Don't roll our own.
- **Cache key shape.** Standardize prefixes: `article:slug:`, `feed:home`, `feed:trending`, `feed:category:`. Document in `shared/cacheKeys.ts`.
- **Atomic publish.** State change to `published` + cache invalidate + search index must succeed in order — but cache and search are best-effort (log failures, don't roll back state). Document this in service comments.
- **Notification fan-out.** P1 just notifies the author and (for `published`) anyone who bookmarked them; capping to ~50 per publish. Phase 2 adds full subscriber fan-out via a queue.
- **Audit logging.** Every state change emits `{ audit: true, entity: "article", entityId, action, actor, at }`.
- **Comment moderation auto-mod is off in P1.** All comments default to `pending` and require manual approval. Decision per `docs/09-development-phases.md` §9.1 — auto-mod is in Phase 2.
- **Rate limits.** Apply 10/min on comment post; 20/min on the AI regenerate endpoint per `docs/05-api-documentation.md` §5.17.
- **E-paper download.** Stream from S3 via a redirect to a presigned GET URL (short TTL — e.g., 5 min). Don't proxy the bytes through Express.
- **Search index limits.** Mongo text index on `title + plainText + tags`. Phase 2 swaps to Atlas Search or Qdrant.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **AI** | Kickoff | Confirm: AI is live with real `/v1/summarize`. Confirm: `X-Degraded` header semantics. Confirm: latency p95 ≤ 2 s on dev (per Subphase 3 benchmark) so the 2 s timeout works in practice. Discuss cold-start handling: should we make a warm-up call at backend boot? |
| **AI** | Day 1 | Pair on the first end-to-end request through the breaker. Verify retry + fallback. |
| **AI** | Day 3 | Confirm `FORCE_FALLBACK=true` toggle behavior to test degradation path. |
| **AI** | Integration Day | Side-by-side review of latency and error metrics. |
| **Frontend** | Kickoff | Lock approve/reject/publish/placement/AI-regenerate payloads. Confirm the `degraded` field exposure pattern (body field, not pass-through header). Confirm rejection reason length. |
| **Frontend** | Day 6 | Pair on regenerate-AI UX. |
| **Frontend** | Integration Day | Demo run. |

---

## 9. Deliverables

- [ ] `ai-proxy` module with opossum + retry + 2s timeout + fallback.
- [ ] Article state machine complete: approve, reject, publish, unpublish, placement, regenerate-AI.
- [ ] AI pipeline orchestrated on approve, with graceful degradation.
- [ ] Comments module: post, list, moderate, delete; rate-limited.
- [ ] Notifications module (in-app): event listeners for approved/rejected/published/comment-approved; list/markRead.
- [ ] E-paper module: upload, list, get, download (presigned redirect), delete.
- [ ] Search module: text index, indexArticle/remove hooks on publish/unpublish.
- [ ] Redis cache wrapper + article-by-slug cache; invalidation on state change.
- [ ] Integration tests: full editorial happy path + degradation path + RBAC denials.
- [ ] Audit log lines for every state change.

### Acceptance checklist
- Editor approves submitted article → article.ai.summary populated within seconds (or `degraded: true` if AI down).
- Toggling `FORCE_FALLBACK=true` on AI → backend writes `ai.degraded: true`; circuit breaker stays closed (200 with degraded ≠ failure).
- Stopping AI container entirely → 5th attempt opens the circuit; subsequent calls return fallback immediately for 30 s.
- Publish invalidates article + home cache.
- Reader (anon) `GET /v1/articles/:slug` returns 200 with ai.summary; subsequent calls hit Redis (faster).
- Comment posted → status=pending; editor approves → reader sees on next GET.
- E-paper uploaded → list endpoint shows it; download returns S3 presigned URL via 302.
- Rate limit: 11th comment in 60 s → 429.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| AI service cold-start (10–30 s) trips the breaker on first call | Add an optional warm-up call at backend boot to `/v1/summarize` with a tiny text. Exclude the warm-up from the breaker's failure count (use a separate axios call outside opossum). |
| `setImmediate`-based pipeline lost on crash | P1 acceptable risk; AI backfill cron in Phase 2 picks up `ai.summary IS NULL AND status=approved`. Document. |
| Circuit breaker tripping due to slow but successful calls | Tune `timeout` slightly above AI's p99; opossum counts timeouts as failures. Phase 1: 2 s. Re-evaluate after staging soak. |
| Cache stampede on hot article publish | Use `cache.getOrSet` with single-flight (lock per key in Node memory or Redis SETNX). |
| Notification fan-out volume on `article.published` | Cap to 50 in P1; document; queue-based fan-out in P2. |
| Mongo text search ranking poor | Acceptable in P1; switch to Atlas Search in Phase 2. |
| Race between approve and edit-back-to-draft | Optimistic-concurrency `version` field handles this. |
| `X-Degraded` not surfaced to FE | Test explicitly with FORCE_FALLBACK; bubble as response body field. |
| opossum metrics ingestion in Phase 1 | Defer; just log state transitions to Pino in P1. |
| E-paper PDF malware | P1 trusts admin uploads; ClamAV scan is Phase 3 per `docs/03-module-breakdown.md` §3.2.6. |
| Rate-limit misconfig denies legitimate editors | Editors and admins are bypassed from comment rate limit; apply only to readers. |
