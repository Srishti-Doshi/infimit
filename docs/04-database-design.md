# 🗄️ 4. Database Design Document

**Primary DB:** MongoDB 6+ (replica set in production)
**ODM:** Mongoose
**Cache:** Redis 7
**Conventions:**
- All IDs are `ObjectId`
- All timestamps stored in UTC (`createdAt`, `updatedAt` auto via Mongoose)
- Soft deletes via `deletedAt` (nullable)
- Field names in `camelCase`

---

## 4.1 Collections Overview

| Collection | Description | Approx. Cardinality (yr 1) |
|------------|-------------|----------------------------|
| `users` | All platform users | 100K |
| `organisations` | Partner organisations | 500 |
| `articles` | All articles (all states) | 50K |
| `comments` | Reader comments | 500K |
| `media` | Binary asset metadata | 300K |
| `analytics_events` | Raw event log | 50M (TTL 90 days) |
| `analytics_daily` | Daily roll-ups | 10K |
| `notifications` | In-app notifications | 5M (TTL 180 days) |
| `ads` | Ad creatives & slots | 1K |
| `ad_events` | Impressions/clicks | 5M (TTL 90 days) |
| `epapers` | E-paper issues | 1K |
| `events` | Calendar events | 5K |
| `newsletters` | Newsletter subscriptions | 50K |
| `bookmarks` | Reader bookmarks | 200K |
| `sessions` | Refresh token records | 100K |

---

## 4.2 Schemas

### 4.2.1 `users`

```jsonc
{
  "_id": "ObjectId",
  "role": "admin" | "editor" | "author" | "reader",
  "email": "string, unique, lowercase",
  "passwordHash": "string",
  "name": "string",
  "slug": "string, unique (for author public pages)",
  "avatarUrl": "string | null",
  "bio": "string",
  "phone": "string | null",
  "location": "string",
  "isEmailVerified": "boolean",
  "isActive": "boolean",
  "organisationId": "ObjectId | null (for authors)",
  "preferences": {
    "darkMode": "boolean",
    "newsletter": "boolean",
    "categoriesFollowed": ["string"],
    "notificationChannels": ["email", "in_app"]
  },
  "meta": {
    "lastLoginAt": "Date",
    "loginCount": "number"
  },
  "createdBy": "ObjectId | null (admin who created editor)",
  "deletedAt": "Date | null",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Indexes:**
- `{ email: 1 }` unique
- `{ slug: 1 }` unique
- `{ role: 1, isActive: 1 }`
- `{ organisationId: 1 }`

---

### 4.2.2 `organisations`

```jsonc
{
  "_id": "ObjectId",
  "name": "string",
  "slug": "string, unique",
  "logoUrl": "string",
  "description": "string",
  "website": "string",
  "contactEmail": "string",
  "contactPhone": "string",
  "socials": {
    "twitter": "string",
    "linkedin": "string",
    "facebook": "string"
  },
  "category": "college" | "ngo" | "research_lab" | "other",
  "verified": "boolean",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Indexes:** `{ slug: 1 }` unique, `{ name: "text" }`

---

### 4.2.3 `articles`

```jsonc
{
  "_id": "ObjectId",
  "title": "string",
  "slug": "string, unique",
  "subtitle": "string",
  "body": "string (rich HTML or ProseMirror JSON)",
  "plainText": "string (extracted for search & AI)",
  "coverImageUrl": "string",
  "media": ["ObjectId (→ media)"],

  "category": "education_policy" | "campus_news" | "research_innovation" | "student_achievements" | "tech_in_education",
  "subcategory": "string | null",
  "tags": ["string"],
  "location": "string",

  "authorId": "ObjectId (→ users)",
  "organisationId": "ObjectId | null",
  "editorId": "ObjectId | null (approver)",

  "status": "draft" | "submitted" | "approved" | "published" | "rejected" | "unpublished",
  "rejectionReason": "string | null",

  "placement": {
    "featured": "boolean",
    "trending": "boolean",
    "trail": "boolean",
    "priority": "number (0-100)"
  },

  "ai": {
    "summary": "string",
    "keywords": ["string"],
    "readingTimeMin": "number",
    "ttsAudioUrl": "string | null",
    "embedding": "number[] | null (optional, if stored in Mongo)"
  },

  "stats": {
    "views": "number",
    "uniqueReaders": "number",
    "shares": "number",
    "bookmarks": "number",
    "commentsCount": "number",
    "trendingScore": "number"
  },

  "publishedAt": "Date | null",
  "submittedAt": "Date | null",
  "approvedAt": "Date | null",
  "deletedAt": "Date | null",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Indexes:**
- `{ slug: 1 }` unique
- `{ status: 1, publishedAt: -1 }`
- `{ category: 1, publishedAt: -1 }`
- `{ location: 1, publishedAt: -1 }`
- `{ authorId: 1, createdAt: -1 }`
- `{ "placement.featured": 1, publishedAt: -1 }`
- `{ "placement.trending": 1, "stats.trendingScore": -1 }`
- `{ tags: 1 }`
- `{ title: "text", plainText: "text", tags: "text" }` (MongoDB text index)

---

### 4.2.4 `comments`

```jsonc
{
  "_id": "ObjectId",
  "articleId": "ObjectId",
  "userId": "ObjectId",
  "parentId": "ObjectId | null (for threaded replies)",
  "body": "string (max 2000 chars)",
  "status": "pending" | "approved" | "rejected" | "hidden",
  "moderatedBy": "ObjectId | null",
  "moderatedAt": "Date | null",
  "aiModeration": {
    "toxic": "boolean",
    "score": "number",
    "labels": ["string"]
  },
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Indexes:**
- `{ articleId: 1, status: 1, createdAt: -1 }`
- `{ userId: 1, createdAt: -1 }`
- `{ status: 1 }` (moderation queue)

---

### 4.2.5 `media`

```jsonc
{
  "_id": "ObjectId",
  "key": "string (S3 object key)",
  "url": "string (CDN URL)",
  "mimeType": "string",
  "size": "number (bytes)",
  "purpose": "article_cover" | "article_embed" | "author_avatar" | "org_logo" | "ad_creative" | "epaper_pdf" | "epaper_cover" | "tts_audio",
  "dimensions": { "width": "number", "height": "number" } ,
  "uploadedBy": "ObjectId",
  "refCount": "number",
  "createdAt": "Date"
}
```

**Indexes:** `{ uploadedBy: 1 }`, `{ purpose: 1 }`, `{ key: 1 }` unique

---

### 4.2.6 `analytics_events`

```jsonc
{
  "_id": "ObjectId",
  "type": "view" | "read_complete" | "share" | "bookmark" | "comment" | "ad_impression" | "ad_click",
  "articleId": "ObjectId | null",
  "adId": "ObjectId | null",
  "userId": "ObjectId | null (null for anonymous)",
  "sessionId": "string (anonymous visitor ID)",
  "referrer": "string",
  "userAgent": "string",
  "country": "string",
  "durationMs": "number | null",
  "createdAt": "Date"
}
```

**Indexes:**
- `{ articleId: 1, createdAt: -1 }`
- `{ type: 1, createdAt: -1 }`
- `{ createdAt: 1 }` with TTL (90 days)

---

### 4.2.7 `analytics_daily`

```jsonc
{
  "_id": "ObjectId",
  "date": "Date (midnight UTC)",
  "scope": "platform" | "article" | "author" | "category",
  "scopeId": "ObjectId | string | null",
  "metrics": {
    "views": "number",
    "uniqueVisitors": "number",
    "reads": "number",
    "shares": "number",
    "bookmarks": "number",
    "avgDurationMs": "number"
  }
}
```

**Indexes:** `{ date: 1, scope: 1, scopeId: 1 }` unique

---

### 4.2.8 `notifications`

```jsonc
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "type": "article_approved" | "article_rejected" | "new_comment" | "newsletter" | "system",
  "title": "string",
  "body": "string",
  "link": "string",
  "read": "boolean",
  "channel": "in_app" | "email",
  "createdAt": "Date"
}
```

**Indexes:** `{ userId: 1, read: 1, createdAt: -1 }`, TTL on `createdAt` (180 days)

---

### 4.2.9 `ads`

```jsonc
{
  "_id": "ObjectId",
  "title": "string",
  "slot": "home_banner" | "sidebar" | "article_top" | "article_inline" | "footer",
  "creativeUrl": "string",
  "targetUrl": "string",
  "advertiser": "string",
  "priority": "number (0-10)",
  "weight": "number (for round-robin)",
  "status": "draft" | "active" | "paused" | "expired",
  "startAt": "Date",
  "endAt": "Date",
  "stats": {
    "impressions": "number",
    "clicks": "number"
  },
  "createdBy": "ObjectId",
  "createdAt": "Date",
  "updatedAt": "Date"
}
```

**Indexes:** `{ slot: 1, status: 1, startAt: 1, endAt: 1 }`

---

### 4.2.10 `epapers`

```jsonc
{
  "_id": "ObjectId",
  "title": "string",
  "issueDate": "Date",
  "pdfMediaId": "ObjectId",
  "coverMediaId": "ObjectId",
  "pageCount": "number",
  "uploadedBy": "ObjectId",
  "stats": { "downloads": "number", "views": "number" },
  "createdAt": "Date"
}
```

**Indexes:** `{ issueDate: -1 }`

---

### 4.2.11 `events`

```jsonc
{
  "_id": "ObjectId",
  "title": "string",
  "description": "string",
  "organisationId": "ObjectId",
  "startAt": "Date",
  "endAt": "Date",
  "location": "string",
  "category": "string",
  "coverImageUrl": "string",
  "status": "pending" | "approved" | "rejected",
  "moderatedBy": "ObjectId | null",
  "createdAt": "Date"
}
```

**Indexes:** `{ status: 1, startAt: 1 }`, `{ organisationId: 1, startAt: 1 }`

---

### 4.2.12 `bookmarks`

```jsonc
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "articleId": "ObjectId",
  "createdAt": "Date"
}
```

**Indexes:** `{ userId: 1, articleId: 1 }` unique, `{ userId: 1, createdAt: -1 }`

---

### 4.2.13 `newsletters`

```jsonc
{
  "_id": "ObjectId",
  "email": "string",
  "userId": "ObjectId | null",
  "topics": ["string"],
  "unsubscribeToken": "string",
  "subscribedAt": "Date",
  "unsubscribedAt": "Date | null"
}
```

**Indexes:** `{ email: 1 }` unique

---

### 4.2.14 `sessions` (refresh tokens)

```jsonc
{
  "_id": "ObjectId",
  "userId": "ObjectId",
  "tokenId": "string (jti)",
  "userAgent": "string",
  "ip": "string",
  "expiresAt": "Date",
  "revokedAt": "Date | null"
}
```

**Indexes:** `{ tokenId: 1 }` unique, `{ userId: 1 }`, TTL on `expiresAt`

---

## 4.3 Relationships Summary

```
users 1 ──── N articles
users 1 ──── N comments
users 1 ──── N bookmarks
users 1 ──── N notifications
users N ──── 1 organisations      (authors)
organisations 1 ──── N articles    (publisher)
articles 1 ──── N comments
articles 1 ──── N analytics_events
articles N ──── N media            (via media[] array)
epapers  1 ──── 1 media (pdf)
epapers  1 ──── 1 media (cover)
```

All relationships are stored as `ObjectId` references (no embedded copies except for denormalized read-hot fields like `authorName` if needed for query speed).

---

## 4.4 Indexing Strategy

1. **Hot-path first.** Every query used on homepage, article page, or dashboard must be covered by a compound index.
2. **Compound order = filter → sort.** e.g., `{ category: 1, publishedAt: -1 }` for category feed.
3. **Text search** via Mongo text index on `articles.title + plainText + tags` for MVP. Upgrade to Atlas Search or Qdrant in phase 2.
4. **TTL indexes** on `analytics_events`, `notifications`, `sessions` to auto-prune.
5. **Sparse indexes** where fields are frequently null (e.g., `organisationId`).
6. **Background builds** only — never block production with foreground index creation.

---

## 4.5 Caching Strategy (Redis)

| Key pattern | Content | TTL |
|-------------|---------|-----|
| `article:slug:<slug>` | Serialized article JSON | 5 min |
| `feed:home` | Homepage feed JSON | 60 s |
| `feed:trending` | Top N trending article IDs | 5 min |
| `feed:category:<cat>` | Category feed | 2 min |
| `user:<id>:profile` | User profile | 10 min |
| `ads:slot:<slot>` | Active ads for slot | 60 s |
| `rate:<userId>:<route>` | Sliding window counter | 1 min |
| `blocklist:jti:<jti>` | Revoked JWT | matches JWT exp |

**Invalidation rules:**
- On `article.published/unpublished/updated` → delete `article:slug:*`, `feed:home`, `feed:trending`, `feed:category:<cat>`
- On `ad.created/updated` → delete `ads:slot:<slot>`
- On `user.updated` → delete `user:<id>:profile`

---

## 4.6 Data Retention & Backups

- **Daily** full mongodump backup to S3 (encrypted, 30-day retention)
- **Hourly** oplog snapshot (point-in-time recovery, 7-day retention)
- **Analytics events** TTL-pruned after 90 days (rolled up into `analytics_daily`)
- **GDPR deletion:** soft delete `users`, null out PII (`name`, `email`, `bio`, `avatarUrl`), keep anonymized activity
