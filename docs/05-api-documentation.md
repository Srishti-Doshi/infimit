# 🔌 5. API Documentation

**Base URL:** `https://api.infimit.com/v1`
**Auth:** Bearer JWT in `Authorization` header (except public endpoints)
**Content-Type:** `application/json`
**Pagination:** `?page=1&limit=20` (default 20, max 100)
**Response envelope:** `{ success, data, meta }` — see [System Architecture §2.5](02-system-architecture.md#25-request-lifecycle-canonical)

---

## 5.1 Conventions

### Role abbreviations used in tables

| Code | Role |
|------|------|
| 🌍 | Public (no auth) |
| 👤 | Reader (any authenticated user) |
| ✍️ | Author / Organisation |
| 📝 | Editor |
| 👑 | Admin |

### Standard error codes

| HTTP | code | Description |
|------|------|-------------|
| 400 | `BAD_REQUEST` | Malformed request |
| 401 | `UNAUTHORIZED` | Missing/invalid token |
| 403 | `FORBIDDEN` | Role not permitted |
| 404 | `NOT_FOUND` | Resource missing |
| 409 | `CONFLICT` | Duplicate / state conflict |
| 422 | `VALIDATION_ERROR` | Zod validation failed |
| 429 | `RATE_LIMITED` | Too many requests |
| 500 | `INTERNAL_ERROR` | Unhandled server error |
| 503 | `AI_UNAVAILABLE` | AI service down / circuit open |

---

## 5.2 Auth Module — `/auth`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/auth/register` | 🌍 | Register a new reader or author |
| POST | `/auth/login` | 🌍 | Login, returns access + refresh |
| POST | `/auth/refresh` | 🌍 (cookie) | Rotate refresh token |
| POST | `/auth/logout` | 👤 | Revoke current session |
| POST | `/auth/verify-email` | 🌍 | Confirm email via signed token |
| POST | `/auth/password/forgot` | 🌍 | Send reset email |
| POST | `/auth/password/reset` | 🌍 | Reset with token |
| GET  | `/auth/me` | 👤 | Current user profile |

### `POST /auth/register`

**Request**
```json
{
  "role": "reader" | "author",
  "name": "Priya Sharma",
  "email": "priya@college.edu",
  "password": "••••••••",
  "organisationSlug": "optional, required if role=author"
}
```

**Response 201**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "role": "reader", "name": "...", "email": "..." },
    "accessToken": "jwt...",
    "expiresIn": 900
  }
}
```

**Errors:** `409 EMAIL_EXISTS`, `422 VALIDATION_ERROR`, `404 ORGANISATION_NOT_FOUND`

---

### `POST /auth/login`

**Request**
```json
{ "email": "priya@college.edu", "password": "••••••••" }
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "user": { "id": "...", "role": "author", "name": "..." },
    "accessToken": "jwt...",
    "expiresIn": 900
  }
}
```

Sets `refresh_token` httpOnly cookie. **Errors:** `401 INVALID_CREDENTIALS`, `403 ACCOUNT_DISABLED`

---

## 5.3 Users Module — `/users`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/users/me` | 👤 | My profile |
| PATCH  | `/users/me` | 👤 | Update my profile |
| POST   | `/users/me/avatar` | 👤 | Upload avatar |
| GET    | `/users/authors/:slug` | 🌍 | Public author page |
| GET    | `/users/editors` | 👑 | List all editors |
| POST   | `/users/editors` | 👑 | Create an editor |
| DELETE | `/users/editors/:id` | 👑 | Remove editor |
| GET    | `/users/authors` | 📝👑 | List all authors |

### `POST /users/editors`

**Request**
```json
{
  "name": "Rohan Desai",
  "email": "rohan@infimit.com",
  "password": "initial-pwd",
  "sectionsOwned": ["research_innovation"]
}
```

**Response 201** — editor created, email sent to set password.
**Errors:** `409 EMAIL_EXISTS`, `403 FORBIDDEN`

---

## 5.4 Organisations Module — `/organisations`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST   | `/organisations` | 👑 | Create organisation |
| GET    | `/organisations` | 🌍 | List organisations |
| GET    | `/organisations/:slug` | 🌍 | Public org page |
| PATCH  | `/organisations/:id` | 📝👑 / self | Update branding |
| DELETE | `/organisations/:id` | 👑 | Delete organisation |

---

## 5.5 Articles Module — `/articles`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/articles` | 🌍 | List published (supports filters) |
| GET    | `/articles/:slug` | 🌍 | Get published article |
| GET    | `/articles/feed/home` | 🌍 | Homepage feed |
| GET    | `/articles/feed/trending` | 🌍 | Trending articles |
| GET    | `/articles/search` | 🌍 | Full-text search |
| POST   | `/articles` | ✍️📝 | Create draft |
| PATCH  | `/articles/:id` | ✍️📝 | Update draft/article |
| DELETE | `/articles/:id` | ✍️📝👑 | Delete (owner or higher) |
| POST   | `/articles/:id/submit` | ✍️📝👑 | Submit for review (service confirms ownership) |
| POST   | `/articles/:id/approve` | 📝👑 | Approve (cannot approve own submission — COI guard) |
| POST   | `/articles/:id/reject` | 📝👑 | Reject with reason |
| POST   | `/articles/:id/publish` | 📝👑 | Publish approved article |
| POST   | `/articles/:id/unpublish` | 👑 | Unpublish |
| PATCH  | `/articles/:id/placement` | 📝👑 | Set featured/trending/TRAIL |
| GET    | `/articles/:id/pdf` | 🌍 | Download as newspaper PDF |
| POST   | `/articles/:id/ai/summary` | 📝✍️ | Force-regenerate summary |
| POST   | `/articles/:id/ai/tts` | 📝✍️ | Generate TTS audio |

### `GET /articles`

**Query params**
```
?category=research_innovation
&location=Mumbai
&dateFrom=2026-01-01
&dateTo=2026-04-01
&authorId=...
&page=1&limit=20
&sort=publishedAt:desc
```

**Response 200**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "slug": "ai-in-classroom",
      "title": "AI in the Classroom",
      "subtitle": "...",
      "coverImageUrl": "...",
      "category": "research_innovation",
      "author": { "id": "...", "name": "Priya Sharma", "slug": "priya" },
      "publishedAt": "2026-04-10T08:30:00Z",
      "readingTimeMin": 6,
      "aiSummary": "...",
      "stats": { "views": 1234, "commentsCount": 12 }
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 342 }
}
```

### `POST /articles`

**Request**
```json
{
  "title": "AI in the Classroom",
  "subtitle": "How education is changing",
  "body": "<p>...</p>",
  "category": "research_innovation",
  "subcategory": null,
  "location": "Mumbai",
  "tags": ["ai", "education"],
  "coverImageMediaId": "...",
  "mediaIds": ["..."]
}
```

**Response 201** — status defaults to `draft`. **Errors:** `422`, `403`

### `POST /articles/:id/submit`

- Validates article has title, body ≥ 300 chars, cover image
- State: `draft → submitted`
- Notifies editors of section

### `POST /articles/:id/approve`

- Role: editor/admin
- State: `submitted → approved`
- AI pipeline runs (summary, keywords) if not already cached
- Notifies author

### `POST /articles/:id/publish`

- State: `approved → published`, sets `publishedAt`
- Invalidates caches, pushes to search index, broadcasts notifications

### `PATCH /articles/:id/placement`

```json
{ "featured": true, "trending": false, "trail": true, "priority": 80 }
```

---

## 5.6 Comments Module — `/comments`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/articles/:articleId/comments` | 🌍 | List approved |
| POST   | `/articles/:articleId/comments` | 👤 | Post comment |
| GET    | `/comments/pending` | 📝👑 | Moderation queue |
| POST   | `/comments/:id/approve` | 📝👑 | Approve |
| POST   | `/comments/:id/reject` | 📝👑 | Reject |
| POST   | `/comments/:id/hide` | 📝👑 | Hide |
| DELETE | `/comments/:id` | owner/📝👑 | Delete |

### `POST /articles/:articleId/comments`

```json
{ "body": "Great piece!", "parentId": null }
```

Returns `pending` if auto-moderation is disabled. Otherwise AI moderation decides status.

---

## 5.7 Media Module — `/media`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/media/upload-url` | 👤 | Request pre-signed upload URL |
| POST | `/media/register` | 👤 | Confirm upload completed |
| GET  | `/media/:id` | 🌍/👤 | Get media metadata |
| DELETE | `/media/:id` | owner/📝👑 | Delete |

### `POST /media/upload-url`

```json
{
  "mimeType": "image/jpeg",
  "size": 2500000,
  "purpose": "article_cover"
}
```

**Response 200**
```json
{
  "success": true,
  "data": {
    "uploadUrl": "https://s3.../signed",
    "key": "uploads/abc123.jpg",
    "expiresIn": 300
  }
}
```

---

## 5.8 Analytics Module — `/analytics`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| POST | `/analytics/track` | 🌍/👤 | Fire-and-forget event |
| GET  | `/analytics/articles/:id` | 📝👑/owner | Article stats |
| GET  | `/analytics/authors/:id` | 📝👑/owner | Author stats |
| GET  | `/analytics/platform` | 👑 | Platform-wide dashboard |
| GET  | `/analytics/sections/:category` | 📝👑 | Section stats |

### `POST /analytics/track`

```json
{ "type": "view", "articleId": "...", "sessionId": "..." }
```

Responds 204. No response body.

---

## 5.9 Notifications Module — `/notifications`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/notifications` | 👤 | List mine |
| POST   | `/notifications/:id/read` | 👤 | Mark read |
| POST   | `/notifications/read-all` | 👤 | Mark all read |
| POST   | `/newsletter/subscribe` | 🌍 | Subscribe to newsletter |
| POST   | `/newsletter/unsubscribe` | 🌍 | Unsubscribe (token) |

---

## 5.10 Ads Module — `/ads`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/ads/slot/:slotName` | 🌍 | Get active ad for slot |
| POST   | `/ads/:id/impression` | 🌍 | Record impression |
| POST   | `/ads/:id/click` | 🌍 | Record click + redirect |
| GET    | `/ads` | 📝👑 | List all ads |
| POST   | `/ads` | 📝👑 | Create ad |
| PATCH  | `/ads/:id` | 📝👑 | Update ad |
| DELETE | `/ads/:id` | 📝👑 | Delete ad |
| GET    | `/ads/:id/stats` | 📝👑 | Ad stats |

---

## 5.11 E-paper Module — `/epapers`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/epapers` | 🌍 | List issues (archive) |
| GET    | `/epapers/:id` | 🌍 | Issue details |
| GET    | `/epapers/:id/download` | 🌍 | Stream PDF |
| POST   | `/epapers` | 👑 | Upload new issue |
| DELETE | `/epapers/:id` | 👑 | Archive issue |

### `POST /epapers`

Multipart form:
- `title`: string
- `issueDate`: date
- `pdfMediaId`: string
- `coverMediaId`: string

---

## 5.12 Events Module — `/events`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/events` | 🌍 | List approved events |
| GET    | `/events/:id` | 🌍 | Event details |
| POST   | `/events` | ✍️ | Submit event |
| POST   | `/events/:id/approve` | 📝👑 | Approve |
| POST   | `/events/:id/reject` | 📝👑 | Reject |

---

## 5.13 Bookmarks Module — `/bookmarks`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/bookmarks` | 👤 | My bookmarks |
| POST   | `/bookmarks/:articleId` | 👤 | Add bookmark |
| DELETE | `/bookmarks/:articleId` | 👤 | Remove bookmark |

---

## 5.14 Search Module — `/search`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/search?q=...&type=article` | 🌍 | Text search |
| GET    | `/search/semantic?q=...` | 🌍 | Semantic search (Phase 2) |

---

## 5.15 Admin Dashboard — `/admin`

| Method | Path | Access | Description |
|--------|------|--------|-------------|
| GET    | `/admin/overview` | 👑 | Dashboard summary |
| GET    | `/admin/approvals/articles` | 👑 | Submitted queue |
| GET    | `/admin/approvals/events` | 👑 | Event queue |
| GET    | `/admin/users` | 👑 | User management |

---

## 5.16 RBAC Matrix (summary)

| Endpoint group | Reader | Author | Editor | Admin |
|----------------|--------|--------|--------|-------|
| Auth | ✅ | ✅ | ✅ | ✅ |
| Read articles | ✅ | ✅ | ✅ | ✅ |
| Comment | ✅ | ✅ | ✅ | ✅ |
| Create article | ❌ | ✅ | ✅ | ✅ |
| Edit own article | ❌ | ✅ | ✅ | ✅ |
| Approve article | ❌ | ❌ | ✅ | ✅ |
| Publish article | ❌ | ❌ | ✅ | ✅ |
| Delete any article | ❌ | ❌ | ❌ | ✅ |
| Moderate comments | ❌ | ❌ | ✅ | ✅ |
| Manage editors | ❌ | ❌ | ❌ | ✅ |
| Manage organisations | ❌ | ❌ | ❌ | ✅ |
| Upload e-paper | ❌ | ❌ | ❌ | ✅ |
| Manage ads | ❌ | ❌ | ✅ | ✅ |
| Placement control | ❌ | ❌ | ✅ | ✅ |
| Platform analytics | ❌ | own | section | ✅ |

---

## 5.17 Rate Limiting

| Route group | Limit |
|-------------|-------|
| Auth (`/auth/*`) | 10 req/min per IP |
| Public reads | 120 req/min per IP |
| Authenticated writes | 60 req/min per user |
| Comment posting | 10 req/min per user |
| AI endpoints | 20 req/min per user |

Exceeding returns `429 RATE_LIMITED` with `Retry-After` header.
