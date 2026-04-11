# 🧩 3. Module Breakdown Document

Each module inside the modular monolith owns a single business capability. Modules **never import each other's internals** — they talk through **service interfaces** exposed by each module's `index.ts`. This discipline makes future extraction into microservices mechanical, not architectural.

## 3.1 Module Anatomy

Every module has the same internal shape:

```
modules/<name>/
├── routes.ts         ← Express router, wires middleware
├── controller.ts     ← Thin request handlers
├── service.ts        ← Business logic, orchestration
├── repository.ts     ← Mongoose queries (pure data access)
├── validator.ts      ← Zod schemas for request bodies
├── model.ts          ← Mongoose schema + TypeScript types
├── events.ts         ← In-process event emitters (module ↔ module)
└── index.ts          ← Public surface (what other modules may import)
```

---

## 3.2 Modules

### 3.2.1 `auth`

**Responsibility:** User authentication, token issuance, password resets, email verification.

**Key operations:**
- `register(role, payload)` → creates user with hashed password
- `login(email, password)` → issues access + refresh JWT
- `refresh(token)` → rotates refresh token, issues new pair
- `logout(userId, tokenId)` → adds JWT `jti` to Redis blocklist
- `requestPasswordReset(email)` → emails signed reset link
- `resetPassword(token, newPassword)` → verifies & updates hash
- `verifyEmail(token)`

**Interacts with:**
- `users` (creates & reads users)
- `notifications` (sends verification/reset emails)
- Redis (token blocklist + rate limiting)

**Produces events:** `user.registered`, `user.logged_in`, `user.password_changed`

---

### 3.2.2 `users`

**Responsibility:** User profiles across all roles (Admin, Editor, Author, Reader).

**Key operations:**
- `getProfile(userId)`
- `updateProfile(userId, payload)`
- `listEditors()` / `listAuthors()` / `listReaders()` (admin only)
- `createEditor(payload)` (admin)
- `removeEditor(userId)` (admin, soft delete)
- `uploadAvatar(userId, file)`
- `getPublicAuthor(slug)` → public-facing author page

**Interacts with:**
- `media` (avatar upload)
- `articles` (fetch author's articles on profile)
- `analytics` (author analytics view)

---

### 3.2.3 `organisations`

**Responsibility:** Organisation/author accounts (branded submitters).

**Key operations:**
- `createOrganisation(payload)` (admin)
- `updateBranding(orgId, payload)`
- `getOrganisationBySlug(slug)`
- `listOrganisations(filters)`
- `linkAuthorToOrganisation(authorId, orgId)`

**Interacts with:** `users`, `media` (logo), `articles` (publisher relation)

---

### 3.2.4 `articles`

**Responsibility:** Core content engine — drafting, submission, approval, publishing, placement.

**Key operations:**
- `createDraft(authorId, payload)`
- `updateDraft(articleId, payload)`
- `submitForReview(articleId)` → status: draft → submitted
- `approveArticle(articleId, editorId)` → submitted → approved
- `publishArticle(articleId)` → approved → published (sets `publishedAt`)
- `rejectArticle(articleId, reason)` → submitted → rejected
- `unpublishArticle(articleId)` (admin only)
- `setPlacement(articleId, { featured, trending, trail })` (editor/admin)
- `getBySlug(slug)`
- `listByFilters({ category, location, dateRange, authorId })`
- `searchArticles(query)`
- `getTrending()` (reads from analytics-computed cache)
- `generatePdf(articleId)` → newspaper-style PDF

**Interacts with:**
- `media` (embedded assets)
- `ai-proxy` (summary, keywords, recommendations)
- `analytics` (view tracking, trending score)
- `comments` (count, latest)
- `notifications` (author on status change, readers on new publish)
- `search` (index on publish, de-index on unpublish)

**Produces events:** `article.created`, `article.submitted`, `article.approved`, `article.published`, `article.unpublished`, `article.rejected`

---

### 3.2.5 `comments`

**Responsibility:** Reader comments on articles, with moderation.

**Key operations:**
- `postComment(articleId, userId, body)`
- `listComments(articleId, pagination)` — only `approved` status returned publicly
- `moderate(commentId, action)` — editor/admin: approve / reject / hide
- `deleteComment(commentId)` — owner or editor/admin
- `autoModerate(body)` — calls AI `/moderate` for toxicity screen (Phase 2)

**States:** `pending` → `approved` | `rejected` | `hidden`

**Interacts with:** `articles`, `notifications` (notify author of new comment), `ai-proxy`

---

### 3.2.6 `media`

**Responsibility:** All binary assets — images, videos, PDFs, audio.

**Key operations:**
- `issueUploadUrl({ mimeType, size, purpose })` → returns pre-signed S3 URL
- `registerUpload({ key, metadata })` → saves media doc after client uploads
- `deleteMedia(mediaId)`
- `getMedia(mediaId)`
- `optimizeImage(mediaId)` (Phase 2 — background job)

**Interacts with:** S3/R2, `articles`, `users`, `epaper`

**Constraints:**
- Max image: 10 MB, video: 200 MB, PDF: 50 MB
- Allowed MIME types strictly whitelisted
- Virus scan stub (ClamAV integration in phase 3)

---

### 3.2.7 `analytics`

**Responsibility:** Visitor tracking, engagement metrics, trending computation.

**Key operations:**
- `trackEvent(eventType, payload)` — fire-and-forget writer
- `getArticleStats(articleId)`
- `getAuthorStats(authorId)`
- `getSectionStats(category)`
- `getPlatformStats()` (admin dashboard)
- `computeTrendingScore()` — cron every 5 min

**Events tracked:**
- `view` — article opened
- `read_complete` — reader hit 90% scroll / 2 min dwell
- `share` — social share clicked
- `bookmark` — saved by reader
- `comment_posted`
- `ad_impression`, `ad_click`

**Storage:** `analytics_events` collection (append-only) + derived roll-ups in `analytics_daily`.

**Interacts with:** `articles`, `users`, Redis (cached trending), `notifications` (digest emails in phase 2)

---

### 3.2.8 `notifications`

**Responsibility:** Multi-channel notifications — email, in-app, (future) push.

**Key operations:**
- `send({ userId, type, channel, payload })`
- `listForUser(userId)`
- `markRead(notificationId)`
- `subscribeToTopic(userId, topic)`
- `broadcastNewIssue(issueId)` — newsletter batch

**Channels:** `email` (SES), `in_app` (stored in Mongo, read via WebSocket or polling)

**Interacts with:** `users`, `articles`, `epaper`

---

### 3.2.9 `ads`

**Responsibility:** Advertisement slot management and delivery.

**Key operations:**
- `createAd(payload)` — editor/admin
- `updateAd(adId, payload)`
- `getAdsForSlot(slotName)` — returns active ads ordered by priority + weight
- `recordImpression(adId)`
- `recordClick(adId)`
- `getAdStats(adId)`

**Slots:** `home_banner`, `sidebar`, `article_top`, `article_inline`, `footer`

**States:** `draft` → `active` → `paused` → `expired`

**Interacts with:** `media` (ad creatives), `analytics`

---

### 3.2.10 `epaper`

**Responsibility:** Daily/weekly e-newspaper PDFs.

**Key operations:**
- `uploadIssue({ date, file, coverImage })` — admin
- `listIssues({ from, to })`
- `getIssue(issueId)`
- `downloadIssue(issueId)` — streams from S3
- `archiveIssue(issueId)`

**Interacts with:** `media` (PDF + cover), `notifications` (broadcast new issue), `analytics`

---

### 3.2.11 `events` (calendar)

**Responsibility:** Organisation-submitted events feeding the dynamic calendar.

**Key operations:**
- `submitEvent(orgId, payload)`
- `approveEvent(eventId)` (editor)
- `listEvents({ month, category })`
- `getEvent(eventId)`

**Interacts with:** `organisations`, `notifications`

---

### 3.2.12 `search`

**Responsibility:** Full-text and semantic search across articles.

**Key operations:**
- `indexArticle(article)` — on publish
- `removeArticle(articleId)` — on unpublish/delete
- `searchText(query, filters)` — MongoDB text index (MVP)
- `searchSemantic(query)` — proxies to AI `/semantic-search` (Phase 2)

**Interacts with:** `articles`, `ai-proxy`

---

### 3.2.13 `ai-proxy`

**Responsibility:** Single gateway through which the monolith calls the FastAPI AI service. Nothing else in the codebase makes HTTP calls to AI.

**Key operations:**
- `summarize(text)` → `{ summary, confidence }`
- `extractKeywords(text)` → `string[]`
- `recommend({ userId, seedArticleId, limit })` → `articleIds[]`
- `generateTTS(articleId, text)` → `{ audioUrl }`
- `semanticSearch(query)` → `articleIds[]`
- `moderateComment(body)` → `{ toxic, score, labels }`

**Cross-cutting:** Circuit breaker (opossum), 2s timeout, retries with jitter, falls back to cached/degraded response on failure.

---

## 3.3 Module Interaction Matrix

|              | auth | users | org | articles | comments | media | analytics | notif | ads | epaper | events | search | ai  |
|--------------|------|-------|-----|----------|----------|-------|-----------|-------|-----|--------|--------|--------|-----|
| **auth**     |  —   |  ✅   |     |          |          |       |           |  ✅   |     |        |        |        |     |
| **users**    |      |  —    | ✅  |    ✅    |          |  ✅   |    ✅     |       |     |        |        |        |     |
| **org**      |      |  ✅   |  —  |    ✅    |          |  ✅   |           |       |     |        |        |        |     |
| **articles** |      |  ✅   | ✅  |    —     |    ✅    |  ✅   |    ✅     |  ✅   |     |        |        |   ✅   | ✅  |
| **comments** |      |  ✅   |     |    ✅    |    —     |       |    ✅     |  ✅   |     |        |        |        | ✅  |
| **media**    |      |       |     |          |          |   —   |           |       | ✅  |   ✅   |        |        |     |
| **analytics**|      |       |     |    ✅    |    ✅    |       |     —     |  ✅   | ✅  |        |        |        |     |
| **notif**    |      |  ✅   |     |    ✅    |          |       |           |   —   |     |   ✅   |   ✅   |        |     |
| **ads**      |      |       |     |          |          |  ✅   |    ✅     |       |  —  |        |        |        |     |
| **epaper**   |      |       |     |          |          |  ✅   |    ✅     |  ✅   |     |    —   |        |        |     |
| **events**   |      |       | ✅  |          |          |       |           |  ✅   |     |        |   —    |        |     |
| **search**   |      |       |     |    ✅    |          |       |           |       |     |        |        |   —    | ✅  |
| **ai-proxy** |      |       |     |          |          |       |           |       |     |        |        |        |  —  |

**Rule:** Never import a module's `service.ts` directly from outside the module. Always import from `modules/<name>/index.ts` which re-exports only the public surface.
