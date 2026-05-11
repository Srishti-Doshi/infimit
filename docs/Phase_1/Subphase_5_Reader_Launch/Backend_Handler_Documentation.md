# Subphase 5 — Reader Experience + Launch · Backend Handler

**Owner:** You · **Duration:** Week 9–10 · **Tag at exit:** `v0.5.0` (≡ MVP)

> **Theme of this subphase:** Make the platform fast for readers, observable for operators, and deployable to staging. Ship feeds, search, bookmarks, analytics writer, basic trending, article PDF generation, and the CI/CD path to a public staging URL.

---

## 1. Objectives

1. Ship reader feed endpoints: home (TRAIL + Featured + Latest + Trending) and category.
2. Ship search (Mongo `$text`) per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.12.
3. Ship bookmarks module per [`docs/04-database-design.md`](../../04-database-design.md) §4.2.12.
4. Ship analytics writer: `/v1/analytics/track`, denormalized view counts, basic stats endpoints, TTL on raw events.
5. Compute basic trending: cron every 5 min populating `feed:trending` cache.
6. Article PDF generation (`/v1/articles/:id/pdf`) using Puppeteer or pdfkit.
7. Final indexing pass: confirm every Mongo index from [`docs/04-database-design.md`](../../04-database-design.md) §4.2 is present.
8. CI/CD: GitHub Actions deploys backend to staging on push to `main`.
9. Observability: Sentry, Pino → stdout, healthz probes hardened.

---

## 2. Scope of Work

### In scope
- **Feeds:**
  - `GET /v1/articles/feed/home` — returns `{ trail, featured, latest, trending }` from one aggregation; Redis cache TTL 60 s.
  - `GET /v1/articles/feed/trending` — top N trending IDs (read from `feed:trending` cache).
  - `GET /v1/articles?category=...&location=...&dateFrom=...&dateTo=...&page=&limit=` — paginated list, filters as in [`docs/05-api-documentation.md`](../../05-api-documentation.md) §5.5 + [`docs/13-feature-documentation.md`](../../13-feature-documentation.md) A1. Cache `feed:category:<cat>` for 2 min.
- **Search:** `GET /v1/search?q=...&type=article`.
- **Bookmarks module:**
  - `GET /v1/bookmarks` (my bookmarks paginated).
  - `POST /v1/bookmarks/:articleId` (idempotent).
  - `DELETE /v1/bookmarks/:articleId`.
- **Analytics module:**
  - `POST /v1/analytics/track` — fire-and-forget; rate limit lax for anon.
  - Event types: `view`, `read_complete`, `share`, `bookmark`, `comment`, `ad_impression`, `ad_click`.
  - Persist to `analytics_events` with TTL 90 days.
  - On `view`: `$inc article.stats.views`.
  - On `read_complete`: increment uniques if `userId` distinct.
  - `GET /v1/analytics/articles/:id` — owner / editor / admin.
  - `GET /v1/analytics/authors/:id` — owner / editor / admin.
  - `GET /v1/analytics/platform` — admin only.
- **Trending compute:**
  - Cron every 5 min computing rolling 24h view + bookmark count weighted; writes ordered IDs to `feed:trending` Redis key.
  - Stored as a sorted set (`ZADD`) or simple JSON.
- **Article PDF generation:**
  - `GET /v1/articles/:id/pdf` (🌍 if article published; otherwise 404).
  - Use Puppeteer-core + chromium (or pdfkit for simpler P1). Decision: **pdfkit** for P1 because Puppeteer image is huge; document trade-off (less typographic polish).
  - Stream the PDF with `Content-Disposition: attachment; filename="<slug>.pdf"`.
  - Cache the generated PDF in S3 (`articles/<id>/<version>.pdf`) and redirect to presigned URL on subsequent calls.
- **CI/CD:**
  - GitHub Actions: on push to `main` → build image → push GHCR → deploy backend to Render/Railway staging per [`docs/11-devops.md`](../../11-devops.md) §11.5.
  - Run `scripts/migrate.ts` post-deploy to ensure indexes exist.
- **Observability:**
  - Sentry integration (DSN from env).
  - `requestLogger` includes `userAgent`, `country` (from `cf-ipcountry` header if behind Cloudflare; else null).
  - Healthz hardened: separate `/healthz` (basic) and `/readyz` (mongo+redis+ai reachable).
- **Seed (final):** demo organisation, 5 categories enum, 3 demo articles already published with AI summaries (use a script that calls real AI service in seed mode, or imports pre-generated summaries).
- **Final indexes pass.** Run-once verification script that asserts every index from [`docs/04-database-design.md`](../../04-database-design.md) §4.2 exists.

### Out of scope
- BullMQ background queue → Phase 2.
- Real email delivery (SES) → Phase 2.
- Atlas Search / Qdrant → Phase 2.
- Full analytics roll-ups & dashboards → Phase 2.
- Multi-language / i18n → Phase 3.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Articles listing + feeds API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.5 |
| Search API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.14 |
| Bookmarks API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.13 |
| Analytics API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.8 |
| Article schema (stats, placement) | [`04-database-design.md`](../../04-database-design.md) §4.2.3 |
| Analytics events schema | [`04-database-design.md`](../../04-database-design.md) §4.2.6 |
| Bookmarks schema | [`04-database-design.md`](../../04-database-design.md) §4.2.12 |
| Cache strategy | [`04-database-design.md`](../../04-database-design.md) §4.5 |
| Search module surface | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.12 |
| Analytics module surface | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.7 |
| Trending compute | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.7 |
| Article generatePdf | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.4 |
| CI/CD pipeline | [`11-devops.md`](../../11-devops.md) §11.5 |
| Hosting architecture | [`11-devops.md`](../../11-devops.md) §11.6 |
| Observability | [`11-devops.md`](../../11-devops.md) §11.7 |
| Exit criteria | [`09-development-phases.md`](../../09-development-phases.md) §9.1 |
| Homepage feature spec | [`13-feature-documentation.md`](../../13-feature-documentation.md) A3 |

---

## 4. Expected Implementation Direction

### Home feed aggregation

```ts
async function buildHomeFeed() {
  const [trail, featured, latest, trending] = await Promise.all([
    Article.find({ status: "published", "placement.trail": true }).sort({ publishedAt: -1 }).limit(8).lean(),
    Article.findOne({ status: "published", "placement.featured": true }).sort({ "placement.priority": -1, publishedAt: -1 }).lean(),
    Article.find({ status: "published" }).sort({ publishedAt: -1 }).limit(20).lean(),
    getTrending(),
  ]);
  return { trail: trail.map(toPublic), featured: toPublic(featured), latest: latest.map(toPublic), trending };
}
```

Wrap in `cache.getOrSet("feed:home", 60, buildHomeFeed)`.

### Trending compute (cron)

```ts
async function computeTrendingScore() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const pipeline = [
    { $match: { type: { $in: ["view", "bookmark", "share"] }, createdAt: { $gte: since }, articleId: { $ne: null } } },
    { $group: { _id: "$articleId", score: { $sum: { $cond: [{ $eq: ["$type", "view"] }, 1, 5] } } } },
    { $sort: { score: -1 } },
    { $limit: 30 },
  ];
  const top = await AnalyticsEvent.aggregate(pipeline);
  await redis.set("feed:trending", JSON.stringify(top.map(t => t._id)), "EX", 600);
  // Also persist to article.stats.trendingScore for editor visibility
  for (const t of top) await Article.updateOne({ _id: t._id }, { $set: { "stats.trendingScore": t.score } });
}
```

Cron via `node-cron` running every 5 min.

### Analytics writer (fire-and-forget)

```ts
async function trackEvent(input: TrackInput) {
  // Don't await Mongo; queue in a small in-memory buffer flushed every 1 s OR small await with a 50ms timeout
  AnalyticsEvent.insertOne({ ...input, createdAt: new Date() }).catch((e) => logger.warn({ err: e }, "track_failed"));
  if (input.type === "view" && input.articleId) {
    Article.updateOne({ _id: input.articleId }, { $inc: { "stats.views": 1 } }).catch(() => {});
  }
}
```

Backend ack with `204 No Content` immediately.

### PDF generation (pdfkit)

```ts
import PDFDocument from "pdfkit";
import { Readable } from "stream";

async function generateArticlePdf(article: Article): Promise<Readable> {
  const doc = new PDFDocument({ size: "A4", margin: 50 });
  doc.fontSize(24).text(article.title);
  doc.moveDown(0.5).fontSize(12).fillColor("gray").text(`${article.author.name} · ${formatDate(article.publishedAt)}`);
  doc.moveDown().fontSize(14).text(article.ai.summary || "");
  doc.moveDown().fontSize(12).fillColor("black").text(article.plainText);
  doc.end();
  return doc;
}
```

- Stream straight to the response.
- Cache to S3 with key `articles/<id>/v<version>.pdf`; redirect to presigned URL on subsequent calls (`302`).

### Search endpoint

```ts
GET /v1/search?q=<query>&type=article
→ Article.find({ $text: { $search: q }, status: "published" }, { score: { $meta: "textScore" } })
       .sort({ score: { $meta: "textScore" } })
       .limit(20).lean();
```

### CI/CD outline

`.github/workflows/backend-deploy.yml`:
- on push main: build + push image → ssh-deploy / API call to Render/Railway.
- post-deploy: run migration step (`yarn migrate` over SSH or via deploy hook).
- Smoke: hit `/healthz` until 200; fail deploy if not green in 60 s.

---

## 5. Dependencies

### Blocking
- Subphase 4: articles state machine complete, AI summaries written on approve, comments/notifications live, Redis caches in place.

### Soft
- Frontend's expected feed payload shape — align in kickoff.

### Provides for downstream
- Operational MVP — staging URL → can be shared with closed-beta testers.
- Analytics events stream — used by Phase 2 roll-ups.

---

## 6. Suggested Development Order

1. **Day 1** — Bookmarks module: schema, repository, controller, routes. Tests.
2. **Day 2** — Analytics module: schema, `track` endpoint, denorm `stats.views` increment. TTL index.
3. **Day 3** — Basic auth-and-role analytics read endpoints (articles, authors, platform).
4. **Day 4** — Trending cron via `node-cron`. Redis write. Tests with sample data.
5. **Day 5** — Home feed aggregation; cache; tests.
6. **Day 6** — Category feed endpoint (already partial from Subphase 3 `GET /articles`) — add cache.
7. **Day 7** — Search endpoint with `$text` index.
8. **Day 8** — Article PDF generation via pdfkit + S3 cache.
9. **Day 9** — Sentry integration; harden `requestLogger`; harden healthz / readyz; document.
10. **Day 10** — CI/CD workflow for backend deploy to staging; migration step; smoke check.
11. **Day 11** — Final indexes verification script (`scripts/verify-indexes.ts`).
12. **Day 12** — Update seed: 3 demo published articles with AI summaries (use a one-time call to AI service or pre-baked summaries).
13. **Day 13 — Integration Day** — Deploy backend to staging. Frontend points to staging URL. Full reader flow tested live.
14. **Day 14** — Exit review, tag `v0.5.0`. **MVP complete.**

---

## 7. Important Considerations

- **Fire-and-forget tracking must not throw.** Wrap every insert in `.catch(() => log)`. Backend must not 500 because analytics is down.
- **PDF caching key.** Use `articleId + version` so corrections (which bump version) regenerate. Document.
- **Puppeteer vs pdfkit decision.** pdfkit for P1. Phase 2 may switch to a Puppeteer-based newspaper-layout PDF when budget allows. Record decision in `docs/decisions.md`.
- **Cache eviction patterns.** When `article.published` event fires, invalidate: `article:slug:<slug>`, `feed:home`, `feed:trending` (loose — trending will recompute on next cron tick), `feed:category:<cat>`. Document the full list in `shared/cacheKeys.ts`.
- **Trending edge cases.** New articles with 0 events have score 0 → not in trending. Acceptable.
- **Authentication on tracking.** `POST /v1/analytics/track` accepts both anonymous (sessionId) and authenticated (userId). Don't trust client-supplied userId; always use `req.user.id` if present; ignore body's `userId`.
- **Index verification.** Script reads each model's schema and asserts the live collection has all indexes. Fails CI in staging deploy if mismatch.
- **Staging secrets.** All env vars set via Render/Railway dashboard. No secrets in repo. Document in `backend/README.md`.
- **Lighthouse impact.** Backend serves cache-control headers `public, max-age=60` on `/v1/articles/feed/home` if you implement an HTTP cache layer; otherwise the FE's TanStack Query suffices.
- **Healthz vs readyz semantics in production.** Render/Railway's healthcheck should hit `/healthz` (cheap). Don't put DB ping there or the orchestrator will flap on transient blips. Reserve `/readyz` for deeper checks (used by your operations dashboard).
- **TTL on analytics events.** 90 days per `docs/04-database-design.md` §4.2.6. Index `{ createdAt: 1, expireAfterSeconds: 7776000 }`.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Frontend** | Kickoff | Lock feed payload shape. Confirm tracking event types and shape. Confirm PDF endpoint behavior (302 to S3 vs direct stream). |
| **Frontend** | Day 5 | Pair on home feed against staging-equivalent data. |
| **Frontend** | Day 13 | Joint staging deploy + Lighthouse run. |
| **AI** | Kickoff | Confirm seed will call AI for 3 demo summaries; coordinate `WARM_ON_STARTUP=true` if it speeds first call. |
| **AI** | Day 13 | If staging AI service deploys separately, coordinate URL + internal key. |

---

## 9. Deliverables

- [ ] Feed endpoints: home, trending, category.
- [ ] Search endpoint (Mongo `$text`).
- [ ] Bookmarks module: list, add, remove.
- [ ] Analytics: track endpoint, denorm stats, owner/editor/admin read endpoints, TTL.
- [ ] Trending cron every 5 min.
- [ ] Article PDF endpoint via pdfkit; S3 caching.
- [ ] Sentry wired; structured logs include requestId, route, userId (no PII).
- [ ] Healthz / readyz split; both documented.
- [ ] CI/CD deploys backend to staging on push to `main`; post-deploy migrations; smoke check.
- [ ] Seed populated with 3 demo published articles + AI summaries.
- [ ] Index verification script + run in CI.
- [ ] `backend/README.md` updated: staging deploy steps, env vars, runbook.

### Acceptance checklist
- `GET /v1/articles/feed/home` returns in < 200 ms cached, < 600 ms cold; all four sections populated.
- `GET /v1/search?q=education` returns results; missing fields return empty array, not 404.
- Bookmark idempotent: 2 POSTs same article = single row.
- `POST /v1/analytics/track` returns 204 in < 30 ms.
- Trending cron fires every 5 min; `feed:trending` is set in Redis.
- `GET /v1/articles/:id/pdf` returns a PDF stream (first call) or 302 to S3 (cached call).
- Sentry receives a captured error in a deliberately broken endpoint test.
- Staging deploy URL responds 200 on `/healthz`; demo articles render.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| pdfkit output ugly | Acceptable for MVP per `docs/09-development-phases.md` §9.1; Phase 2 switches to Puppeteer. |
| Mongo `$text` scoring poor | Accept; Phase 2 swaps to Atlas Search. |
| Trending cron race in multi-instance deploys | P1 staging is single instance; if multiple, use Redis lock (`SET NX` with 4-min TTL). |
| Analytics write storm tanks Mongo | Buffer writes in-memory and bulk-insert every 1 s; tolerate small data-loss window on crash (P1 acceptable). |
| Staging deploy failures from Render/Railway quotas | Document free-tier limits; pin small instance sizes; CI smoke catches regressions. |
| Index migration on staging slow | Indexes are `background: true`; verify on demo data set first. |
| `Content-Disposition` filename special chars | Encode via `encodeURIComponent` or strip non-ASCII; document the rule. |
| Cache TTL too short for low-traffic staging | Verify with stress test; tune if needed. |
| MVP exit gate slips because Lighthouse score is < 85 | Backend has limited levers (cache, response shape); coordinate with FE — if needed, ship smaller cover images, cache-control headers, and remove unnecessary JSON fields from feed payload. |
| Sentry noisy | Set sample rate to 1.0 on errors; on traces, 0.0 in P1 (Phase 2 adds traces). |
