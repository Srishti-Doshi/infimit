# 📚 13. Feature Documentation

Every user-visible feature described in a consistent format:

> **Description** · **User flow** · **Backend logic** · **Edge cases**

Use this document when implementing a specific feature end-to-end.

---

## A. Reader Features

### A1. Smart Navbar Filters (Date, Category, Location)

**Description:** Persistent filter bar that lets readers narrow the homepage feed by date range, category, and location.

**User flow:**
1. Reader opens the homepage.
2. Navbar renders three dropdowns: Date (Today / Week / Month / Custom), Category (enum + "All"), Location (static list of Indian cities + "All").
3. Changing any filter pushes state to URL query params and refetches `/articles?filters...`.
4. Cards below update; URL is shareable.

**Backend logic:**
- `GET /articles?category=...&location=...&dateFrom=...&dateTo=...&page=1&limit=20`
- Query filters `status=published` implicitly.
- Sort: `publishedAt desc`.
- Redis cache keyed by normalized query string (TTL 60 s).

**Edge cases:**
- No results → empty state with suggested categories.
- Invalid date range → 422 with friendly message.
- Combined filters producing 0 results — still returns empty array (not 404).

---

### A2. Category Pages

**Description:** Dedicated landing pages for each of the 5 core categories plus any subcategory.

**Categories:** Education Policy · Campus News · Research & Innovation · Student Achievements · Technology in Education

**User flow:**
1. User clicks category in navbar → `/category/:slug`
2. Sees category header (title, description), featured card, recent list.
3. Infinite scroll pulls more via `/articles?category=<slug>`.

**Backend logic:** Same listing endpoint. Featured card is the article with `placement.featured=true` newest in that category.

**Edge cases:** Empty category → fallback to generic "Coming soon" card. Subcategories query with `subcategory=...`.

---

### A3. Homepage Sections (TRAIL, Featured Banner, Latest Feed, Trending)

**Description:** Multi-block homepage tuned for editorial control.

**Sections:**
- **TRAIL** — a horizontally scrolling top-headlines strip (articles with `placement.trail=true`)
- **Featured Banner** — hero image, one article with `placement.featured=true` highest priority
- **Latest Feed** — published articles ordered by `publishedAt desc`, paginated
- **Trending** — top 10 from `feed:trending` Redis key (computed every 5 min, see [Analytics](08-analytics.md#84-trending-algorithm))

**User flow:** All blocks rendered on `/`. Each links to full category or article.

**Backend logic:**
- `GET /articles/feed/home` returns: `{ trail: [], featured: {}, latest: [], trending: [] }`
- Whole response cached under `feed:home` (TTL 60 s)
- Cache bust on any publish/unpublish/placement change

**Edge cases:**
- If no article has `trail=true` → fallback to latest 5.
- If trending cache cold → compute synchronously, log warning.

---

### A4. Article Page

**Description:** Full reading experience.

**Elements:** Headline, subtitle, author name (linked), publish date, reading time, cover image, body, embedded media, AI summary, social share, comment section, TTS player (phase 3), "Download as newspaper PDF" button.

**User flow:**
1. `/article/:slug` opens.
2. Reading time + summary visible above the fold.
3. Scroll triggers analytics `view`, then `read_complete` at 90%.
4. Comment section loads approved comments lazily.

**Backend logic:**
- `GET /articles/:slug` returns denormalized article (includes author, org, media URLs).
- Increments `views` counter via fire-and-forget analytics call.
- AI summary is served from the stored `article.ai.summary` — no runtime AI call.
- PDF download hits `GET /articles/:id/pdf`, which uses Puppeteer (phase 1 inline, phase 2 queued worker) to render a print-style template to PDF.

**Edge cases:**
- Article unpublished → 410 Gone with "This article is no longer available".
- AI summary missing → show section but with "Summary not available".
- Comments disabled on article → hide section (phase 2 flag).

---

### A5. AI Summary

**Description:** A 2–3 sentence abstractive summary shown above the article body.

**User flow:** Reader sees the summary before committing to the full read.

**Backend logic:**
- Generated at **approval time** via `ai-proxy.summarize()`.
- Stored in `articles.ai.summary`.
- Regenerable on demand by editors via `POST /articles/:id/ai/summary` (rate-limited).

**Edge cases:**
- AI service down during approval → `summary=null`, background job `ai-backfill` retries every 15 min.
- Extremely long articles (> 20K chars) → truncate input, summary may lose context; flag for manual edit.

---

### A6. Download Article as Newspaper PDF

**Description:** Any published article can be downloaded as a standalone broadsheet-style PDF.

**User flow:** Click "Download PDF" on the article page → file downloads.

**Backend logic:**
- `GET /articles/:id/pdf` generates via Puppeteer + a React print template (`ArticlePdfTemplate.tsx`).
- Response is cached to S3 on first request; subsequent downloads stream from S3.
- Cache invalidated on article edit.

**Edge cases:**
- Generation timeout > 10s → return `202 Accepted` with poll URL (phase 2 queue).
- Articles with embedded video → video rendered as poster frame with QR link.

---

### A7. Search

**Description:** Full-text search over published articles.

**User flow:**
1. Reader types in navbar search.
2. Debounced 300 ms, hits `/search?q=...`
3. Results page lists matches with snippets.

**Backend logic:**
- MVP: MongoDB text index over `title + plainText + tags`
- Phase 2: semantic search via AI service
- Returns highlights (`$meta: "textScore"`), paginated

**Edge cases:**
- Empty query → recent articles
- Profanity in query → normalize, still search
- No results → show suggested categories

---

### A8. E-paper Viewer + Archive

**Description:** Daily/weekly PDF newspaper downloadable in full, plus archive browsing.

**User flow:**
1. `/epaper` shows the latest issue cover + "Download".
2. Archive page lists all past issues sorted by date with calendar filter.
3. Click → PDF opens in new tab or downloads.

**Backend logic:**
- `GET /epapers` with date range
- `GET /epapers/:id/download` returns pre-signed URL or streams from S3

**Edge cases:**
- Large PDFs → stream with `Content-Disposition: attachment`
- Expired pre-signed URL → frontend retries silently

---

### A9. Comments (with Moderation)

**Description:** Logged-in readers can comment on articles; content passes through moderation before being visible.

**User flow:**
1. Reader logs in and posts comment.
2. Comment shows "Pending review" to the poster; others don't see it.
3. Once approved, visible publicly.

**Backend logic:** See [Comments module](03-module-breakdown.md#325-comments) and [Workflow §7.2](07-workflows.md#72-comment-moderation-flow).

**Edge cases:**
- Parent comment deleted → reply shows placeholder
- Abuse (rate limit 10/min)
- AI auto-rejects if toxicity > 0.7 (phase 2)

---

### A10. Bookmarks

**Description:** Save articles for later reading.

**User flow:**
1. Click bookmark icon on article card or article page.
2. Toggles state instantly (optimistic UI).
3. `/bookmarks` page lists saved articles; supports removing.

**Backend logic:** `POST /bookmarks/:articleId`, `DELETE /bookmarks/:articleId`. Unique per (userId, articleId).

**Edge cases:**
- Bookmarked article unpublished → still listed with "Unavailable" badge
- Duplicate → idempotent (return 200)

---

### A11. Newsletter Subscription

**Description:** Readers opt into topic-based newsletter blasts.

**User flow:**
1. Signup modal or footer form → submit email + topics.
2. Confirmation email.
3. Periodic digest delivered (phase 2 scheduled job).

**Backend logic:**
- `POST /newsletter/subscribe` creates doc in `newsletters`, emits verification email
- `POST /newsletter/unsubscribe` with signed token

**Edge cases:**
- Already subscribed → resend confirmation, 200
- Hard bounce → mark email invalid, exclude from future sends

---

### A12. Notifications

**Description:** In-app notifications for activity relevant to the user.

**User flow:**
1. Bell icon shows unread count (polled or WebSocket).
2. Click → dropdown lists notifications.
3. Click individual → navigates to target, marks read.

**Backend logic:** `GET /notifications`, `POST /notifications/:id/read`. Fan-out service creates docs and optional emails.

**Edge cases:**
- Thousands of notifications → paginate + auto-archive after 180 days (TTL)

---

### A13. Dark Mode

**Description:** Toggleable dark theme (phase 2).

**User flow:** Toggle in navbar → stored in `localStorage` + user prefs. Respects `prefers-color-scheme` by default.

**Backend logic:** `PATCH /users/me` persists preference server-side for logged-in users.

**Edge cases:** Anonymous users → localStorage only.

---

### A14. Smart Recommendations

**Description:** "You might also like" on article pages (phase 2).

**User flow:** At bottom of article, a strip of 4–6 recommended articles.

**Backend logic:**
- `GET /articles/:id/recommendations` triggers `ai-proxy.recommend()` with candidate pool from the last 200 published articles.
- Result cached per article for 1 h.

**Edge cases:** AI service unavailable → fallback to same-category latest.

---

### A15. Text-to-Speech

**Description:** Play article aloud (phase 3).

**User flow:**
1. Play button near headline.
2. Audio streams from S3, controls show progress.

**Backend logic:**
- On first play, `POST /articles/:id/ai/tts` triggers AI generation if `ttsAudioUrl` is null.
- Audio stored in S3, URL saved on article.

**Edge cases:** Long article chunked internally; offline reader still sees button disabled.

---

### A16. User Profile

**Description:** Readers can edit name, avatar, bio, topics followed, notification preferences.

**Backend logic:** `GET /users/me`, `PATCH /users/me`, `POST /users/me/avatar`.

**Edge cases:** Avatar too large → reject at pre-sign step.

---

## B. Editor Features

### B1. Article Creation with AI Assistance

**Description:** Rich-text editor (Tiptap) with AI suggestions for title, summary, keywords, SEO meta.

**User flow:**
1. Editor clicks "New Article".
2. Writes body; sidebar shows "Suggest title", "Generate summary", "Extract keywords" buttons.
3. Clicking calls `ai-proxy` endpoints.
4. Saves draft (autosave every 10 s).

**Backend logic:** `POST /articles` for create, `PATCH /articles/:id` for update. AI calls proxied through monolith.

**Edge cases:**
- Autosave collision → optimistic lock via `version` field
- AI failure → UI shows "Try again" instead of blocking editor

---

### B2. Article Editing

Already covered by B1. Editors can edit any article in draft/submitted/approved states and their own published articles (creates a new version / correction flag). Admin can edit anything.

---

### B3. Comment Moderation

**Description:** Queue of pending comments for review.

**User flow:** Editor opens `/editor/comments`, sees list, approves/rejects/hides inline.

**Backend logic:** `GET /comments/pending`, `POST /comments/:id/approve`, etc.

**Edge cases:**
- Comment's parent article unpublished mid-moderation → still allow moderation, just hidden

---

### B4. Manage Authors & Organisations

**Description:** Editors (scoped to their section) and admins manage the author/org roster.

**User flow:** List view with filters, search, activate/deactivate toggles.

**Backend logic:** `GET /users/authors`, `PATCH /users/:id`.

---

### B5. Section Analytics Dashboard

**Description:** Views, reads, trending articles for the editor's assigned categories.

**Backend logic:** `GET /analytics/sections/:category`. Reads from `analytics_daily`.

---

### B6. Advertisement Management

**Description:** Create, schedule, pause ads across slots.

**User flow:** Dedicated `/editor/ads` page — table + create form.

**Backend logic:** `POST /ads`, `PATCH /ads/:id`, `GET /ads`. See [Ads module](03-module-breakdown.md#329-ads).

**Edge cases:** Overlapping ads in same slot → priority field decides winner; ties broken by weighted round-robin.

---

### B7. Article Placement Control

**Description:** Editors decide which articles are Featured / Trending / TRAIL.

**User flow:** Toggle switches in the article approval or published view.

**Backend logic:** `PATCH /articles/:id/placement`. Invalidates `feed:home` cache.

**Edge cases:**
- Multiple articles marked featured → priority field orders them
- `trending` auto-toggles via cron → editors can override with manual flag (phase 2)

---

## C. Admin Features

### C1. Editor Management

**Description:** Create, list, remove editors.

**User flow:** `/admin/editors` → table + "New Editor" form.

**Backend logic:** `POST /users/editors`, `DELETE /users/editors/:id`. Removal is soft — `deletedAt` set, `isActive=false`.

**Edge cases:**
- Cannot remove oneself
- Removed editor's published articles remain attributed

---

### C2. Organisation Management

**Description:** Create and manage partner organisations.

**User flow:** `/admin/organisations` — create, edit branding, verify.

**Backend logic:** `POST /organisations`, `PATCH /organisations/:id`.

---

### C3. Article Approval Backlog

**Description:** Global view of all submitted articles across sections.

**User flow:** `/admin/approvals` lists with filters; admin can approve/reject/override.

**Backend logic:** `GET /admin/approvals/articles?status=submitted&page=...`.

---

### C4. Remove Editors

Covered in C1.

---

### C5. Full Analytics Dashboard

**Description:** Platform-wide analytics — DAU, top articles, top authors, category performance, ad revenue.

**Backend logic:** `GET /analytics/platform`. Reads from `analytics_daily`.

---

### C6. E-paper Upload

**Description:** Admin uploads daily/weekly PDF issues.

**User flow:**
1. Admin opens `/admin/epaper/upload`
2. Picks PDF + cover image, sets issue date + title
3. Submit → stored, published, broadcast notification sent

**Backend logic:** `POST /epapers` (multipart-ish via pre-signed upload → register → create issue).

**Edge cases:**
- Duplicate issueDate → warn + allow override
- PDF > 50 MB → reject with friendly message

---

## D. Organization / Author Features

### D1. Article Submission Portal

**Description:** Simplified editor for non-staff authors.

**User flow:**
1. Author logs in, lands on `/author/dashboard`
2. Clicks "New Submission" → same rich editor (B1) but with "Submit for review" instead of "Publish"
3. Receives email/in-app notification when approved/rejected

**Backend logic:** `POST /articles` (draft) → `POST /articles/:id/submit` (submitted)

**Edge cases:**
- Author deactivated mid-draft → can view but not submit
- Organisation unverified → drafts still saveable but submission blocked with message

---

### D2. Profile Management

**Description:** Author/org branding — logo, bio, contact, social links.

**Backend logic:** `PATCH /users/me` (author) / `PATCH /organisations/:id` (org admin).

---

### D3. Submission Tracking Dashboard

**Description:** Visual tracker of each submission's status.

**User flow:** Table with columns: Title · Submitted At · Status (badge) · Editor Notes · Action.

**Backend logic:** `GET /articles?authorId=me&status=*`.

**Edge cases:** Rejected articles show reason + "Revise & resubmit" button.

---

### D4. Event Submission

**Description:** Organisations can add events (workshops, conferences) to the public calendar.

**User flow:**
1. `/author/events/new` form: title, description, start/end, location, cover image
2. Submit → pending moderation
3. Notification on approval/rejection

**Backend logic:** `POST /events`, then editor approval. See [Workflow §7.4](07-workflows.md#74-event-calendar-submission-flow).

**Edge cases:**
- Past-dated event → reject with 422
- Conflict with existing event → allowed; calendar view handles overlap

---

### D5. Organisation Catalog (future)

**Description:** Public directory of all verified organisations with logos and links. Phase 3.

---

## System Features

### S1. Visitor Tracking

Already fully documented in [Analytics Plan](08-analytics.md).

### S2. Advertisement Delivery

**Description:** Slot-based ad serving with impressions, clicks, reporting.

**User flow:** Reader visits any page; slots render via `<Ad slot="home_banner" />` component, which calls `GET /ads/slot/home_banner`.

**Backend logic:**
- Returns one ad chosen by priority + weighted round-robin from currently-active ads
- On render, client fires `POST /ads/:id/impression`
- On click, `POST /ads/:id/click` then redirects to `targetUrl`

**Edge cases:**
- No active ads → return null, component renders nothing (no empty box)
- Ad click from bot → bot filter (UA check) rejects impression counting

### S3. About Us & Contact Us Pages

**Description:** Static pages managed by admin. MVP: hardcoded content; Phase 2: CMS-like editor.

**User flow:** Footer links → static React pages.

**Backend logic:** MVP: none. Phase 2: `GET /pages/:slug` with admin-edited content stored in `pages` collection.

**Edge cases:** Contact form submits to `POST /contact` → stored + forwarded to `contact@infimit.com`.

---

## Global Edge Case Playbook

| Situation | Default Behavior |
|-----------|------------------|
| Service unreachable | Return graceful 503 with retry advice; frontend shows toast |
| DB timeout | Return 500; error tracked in Sentry |
| Rate limited | `429` with `Retry-After` header; frontend queues retry |
| AI service down | Feature-flag-style fallback: serve article without summary/recs |
| Cache stampede | Single-flight pattern via Redis `SETNX` lock |
| Clock drift | All timestamps stored UTC; frontend converts |
| Stale client cache | React Query refetch on window focus |
