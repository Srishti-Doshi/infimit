# 📊 8. Analytics & Tracking Plan

Analytics power three things: (1) **editorial decision-making** (what's working?), (2) **trending section** on the homepage, and (3) **author dashboards**. All of it sits on top of a simple event-based model.

---

## 8.1 What We Track

### Reader events

| Event | When fired | Payload |
|-------|-----------|---------|
| `view` | Article page loaded | `articleId`, `sessionId`, `referrer`, `userAgent`, `country` |
| `read_complete` | Reader scrolls ≥ 90% or dwells ≥ 2 min | `articleId`, `sessionId`, `durationMs` |
| `share` | Social share button clicked | `articleId`, `platform` (twitter/linkedin/whatsapp/...) |
| `bookmark` | Save-for-later triggered | `articleId`, `userId` |
| `comment_posted` | Comment successfully submitted | `articleId`, `userId`, `commentId` |
| `newsletter_signup` | Subscribed | `email`, `topics[]` |
| `search` | Query submitted | `query`, `resultsCount` |
| `epaper_download` | PDF downloaded | `issueId`, `sessionId` |
| `tts_play` | Text-to-speech played | `articleId` |

### Ad events

| Event | When | Payload |
|-------|------|---------|
| `ad_impression` | Ad rendered in viewport | `adId`, `slot`, `sessionId` |
| `ad_click` | Ad clicked through | `adId`, `slot`, `sessionId` |

### Author / editor events

| Event | When | Payload |
|-------|------|---------|
| `article_submitted` | Author submits | `articleId`, `authorId` |
| `article_approved` | Editor approves | `articleId`, `editorId` |
| `article_rejected` | Editor rejects | `articleId`, `editorId`, `reason` |
| `article_published` | Published | `articleId`, `editorId` |

### Passive metrics (not events, computed)

- Unique readers per article (count distinct `sessionId`)
- Avg. read duration
- Bounce rate (views without scroll)
- Section leaderboard
- Author leaderboard

---

## 8.2 Client-side tracking

The frontend sends events to `POST /analytics/track` via a tiny `track(event, payload)` helper. Rules:

1. **Non-blocking.** Fire-and-forget with `navigator.sendBeacon` (or `fetch` with `keepalive: true` fallback).
2. **Batched.** Batch up to 10 events or flush every 3 s, whichever first.
3. **Respect DNT.** Skip tracking if the user has Do Not Track enabled.
4. **Anonymous by default.** A `sessionId` is generated once per tab (UUID v4) and persisted in `sessionStorage`. Only attached to `userId` if logged in.
5. **No PII.** Only structured event type + ids. Never raw URLs with query strings that might contain secrets.

---

## 8.3 Server-side writer

```
POST /analytics/track ──► rate limiter ──► validator ──► analytics.service.trackEvent()
                                                             │
                                                             ▼
                                               Insert into analytics_events
                                                             │
                                                             ▼
                                               Increment Redis counters:
                                               - article:<id>:views (1h, 24h)
                                               - article:<id>:uniqueSessions (HyperLogLog)
                                                             │
                                                             ▼
                                                    204 No Content
```

**Writes are non-blocking.** The route returns `204` within ~5 ms; the insert happens in a background queue (`setImmediate` in MVP, BullMQ in phase 2).

---

## 8.4 Trending Algorithm

A cron runs every **5 minutes** and computes a trending score for every article published in the last 7 days:

```
score = (
    1.5 * views_last_1h +
    1.0 * views_last_24h +
    2.0 * shares_last_24h +
    1.5 * bookmarks_last_24h +
    0.8 * comments_last_24h
) / pow(ageInHours + 2, 1.6)
```

- `ageInHours` = hours since `publishedAt`
- Denominator is a **Reddit-style decay** so fresh content ranks higher
- All counts are pulled from Redis HLL/counters (which are updated by the event writer)

The top 20 article IDs are written to `feed:trending` in Redis (TTL 10 min) and to `articles.stats.trendingScore` for long-term queries. The `articles.placement.trending` boolean is flipped automatically for the top 10.

**Tunable knobs:** coefficients live in `config/trending.ts` so editors can adjust weighting without redeploys (phase 2: admin UI).

---

## 8.5 Daily Roll-ups

A nightly cron (03:00 UTC) aggregates `analytics_events` from the previous day into `analytics_daily`:

```js
{
  date: "2026-04-10",
  scope: "article",
  scopeId: "<articleId>",
  metrics: {
    views: 1523,
    uniqueVisitors: 1120,
    reads: 720,
    shares: 45,
    bookmarks: 78,
    avgDurationMs: 92000
  }
}
```

Also computed at `scope: "platform"`, `scope: "author"`, `scope: "category"`.

Benefits:
- Dashboard queries are fast (reads small `analytics_daily`, not 50M-row events)
- We can prune raw events after 90 days without losing historic trend charts

---

## 8.6 Dashboards

### Admin (`/admin/overview`)
- Total published articles
- DAU / WAU / MAU
- Top 10 articles this week
- Top 5 authors this week
- Approval queue length
- Ad revenue (phase 2)

### Editor (section dashboard)
- Articles in draft / submitted / approved / published
- Views & reads for their section
- Top 5 performing articles
- Pending comments count

### Author (organisation dashboard)
- My articles with per-article views, reads, shares, bookmarks
- Submission status timeline
- Avg. time-to-publish

---

## 8.7 Storage Strategy

| Data | Where | Retention | Purpose |
|------|-------|-----------|---------|
| Raw events | MongoDB `analytics_events` | **90 days** (TTL) | Trending, ad-hoc queries |
| Hot counters | Redis | **24 h** sliding window | Trending score compute |
| Daily roll-ups | MongoDB `analytics_daily` | **Forever** | Dashboards, historic charts |
| Session IDs | Redis (HLL) | **24 h** | Unique visitor approximation |

**HyperLogLog** is used for unique-visitor counts — O(1) memory, ~1% error. Exact counts are only computed for the daily roll-up.

---

## 8.8 Privacy & Compliance

- No cross-site tracking, no third-party cookies
- Sessions anonymous unless user is logged in
- GDPR: user delete request purges all events with matching `userId`
- Analytics endpoint honors `Do Not Track` header (returns 204 but skips insert)
- No IP addresses stored — we store only `country` derived at ingest via Cloudflare headers

---

## 8.9 Alerting

Phase 2 adds Prometheus alerts:
- Trending job failing 2 runs in a row → PagerDuty
- Analytics write latency p95 > 100 ms for 5 min → warn
- `analytics_events` insert failure rate > 1% → page
