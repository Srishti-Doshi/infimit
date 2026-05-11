# Subphase 3 — Content Engine · Backend Handler

**Owner:** You · **Duration:** Week 5–6 · **Tag at exit:** `v0.3.0`

> **Theme of this subphase:** Build the heart of the platform — the `articles` module up to the `draft → submitted` transition, and the `media` module supporting real S3 presigned uploads. By the end, authors can create drafts, attach media, and submit.

---

## 1. Objectives

1. Implement `articles` module up to and including `submitForReview` per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.4.
2. Implement `media` module fully per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.6 — presigned upload, registration, deletion, get.
3. Land Mongoose `articles` schema with **all** indexes from [`docs/04-database-design.md`](../../04-database-design.md) §4.2.3.
4. Wire the article state machine for `draft → submitted` with validation rules from [`docs/07-workflows.md`](../../07-workflows.md) §7.1.
5. Implement optimistic concurrency via the `version` field.
6. Set up the S3 bucket integration with correct CORS for FE uploads.

---

## 2. Scope of Work

### In scope
- **`articles` module** (partial — through draft + submit):
  - `POST /v1/articles` — create draft (✍️📝)
  - `PATCH /v1/articles/:id` — update draft (✍️📝, optimistic concurrency)
  - `GET /v1/articles?status=draft&authorId=me` — list mine (✍️📝)
  - `GET /v1/articles/:id` — get by id (owner / editor / admin) for editing
  - `POST /v1/articles/:id/submit` — submit for review (✍️)
  - `DELETE /v1/articles/:id` — soft delete by owner / editor / admin
- **`media` module** full:
  - `POST /v1/media/upload-url` — issue presigned S3 URL
  - `POST /v1/media/register` — confirm upload, save media doc
  - `GET /v1/media/:id` — get metadata
  - `DELETE /v1/media/:id` — delete (owner / editor / admin, decrement refCount)
- Mongoose `articles` schema **including all indexes** from [`docs/04-database-design.md`](../../04-database-design.md) §4.2.3.
- Mongoose `media` schema from §4.2.5.
- `comments` model skeleton only (collection + indexes ready; logic in Subphase 4).
- Article state-machine transition validation enforcing the rules of [`docs/07-workflows.md`](../../07-workflows.md) §7.1 (`draft → submitted`).
- `EventEmitter` events: `article.created`, `article.submitted`.
- Notification stub: `article.submitted` event fires notifying editors of the section (in-memory log; real `notifications` module in Subphase 4).
- HTML body sanitization on the server (e.g., `sanitize-html`) using a strict allowlist matching what Tiptap can produce.
- `plainText` field auto-derived on save (strip HTML); used for character-count validation and future AI/text search.
- S3 setup:
  - `config/s3.ts` — AWS SDK v3 client.
  - Presigned URL TTL: 300 s.
  - Bucket CORS allows PUT from FE origins.
  - Server-side validation of `mimeType` + `size` against per-purpose limits.

### Out of scope
- `approve`, `reject`, `publish`, `unpublish`, `placement` → Subphase 4.
- AI proxy / pipeline → Subphase 4.
- Comments business logic → Subphase 4.
- Reader feeds, PDF generation, analytics → Subphase 5.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Articles module surface | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.4 |
| Media module surface | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.6 |
| Articles schema + indexes | [`04-database-design.md`](../../04-database-design.md) §4.2.3 |
| Media schema | [`04-database-design.md`](../../04-database-design.md) §4.2.5 |
| Articles API contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.5 |
| Media API contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.7 |
| Article lifecycle + validation | [`07-workflows.md`](../../07-workflows.md) §7.1 |
| Concurrency control via `version` | [`07-workflows.md`](../../07-workflows.md) §7.1 (Concurrency) |
| Submission validation rules | [`07-workflows.md`](../../07-workflows.md) §7.1 (Validation per transition) |
| Standard error codes | [`05-api-documentation.md`](../../05-api-documentation.md) §5.1 |
| Threat model (XSS in rich text) | [`10-security.md`](../../10-security.md) §10.1 |

---

## 4. Expected Implementation Direction

### Articles state-machine validator (server enforces)

```ts
// service.ts (excerpt)
async function submitForReview(articleId: string, userId: string) {
  const a = await repo.findById(articleId);
  if (!a) throw new ApiError(404, "ARTICLE_NOT_FOUND");
  if (a.status !== "draft") throw new ApiError(409, "INVALID_STATE", "Only draft articles can be submitted");
  if (a.authorId.toString() !== userId) throw new ApiError(403, "FORBIDDEN");

  const user = await usersRepo.findById(userId);
  if (!user?.isEmailVerified) throw new ApiError(403, "EMAIL_NOT_VERIFIED");
  if (!user.isActive) throw new ApiError(403, "ACCOUNT_DISABLED");

  // Validation rules from docs/07-workflows.md §7.1
  if (!a.title || a.title.length > 200) throw new ApiError(422, "TITLE_INVALID");
  if (!a.plainText || a.plainText.length < 300) throw new ApiError(422, "BODY_TOO_SHORT");
  if (!ARTICLE_CATEGORIES.includes(a.category)) throw new ApiError(422, "CATEGORY_INVALID");
  if (!a.coverImageMediaId) throw new ApiError(422, "COVER_REQUIRED");
  if (!a.tags?.length || a.tags.length > 10) throw new ApiError(422, "TAGS_INVALID");

  const next = await repo.transition({ _id: articleId, fromStatus: "draft", toStatus: "submitted", version: a.version, submittedAt: new Date() });
  if (!next) throw new ApiError(409, "VERSION_CONFLICT");

  events.emit("article.submitted", { articleId, authorId: userId, category: a.category });
  return next;
}
```

### Optimistic concurrency

Every write that bumps state uses:

```ts
const updated = await Article.findOneAndUpdate(
  { _id, version, deletedAt: null },
  { $set: payload, $inc: { version: 1 }, updatedAt: new Date() },
  { new: true }
);
if (!updated) throw new ApiError(409, "VERSION_CONFLICT");
```

### HTML sanitization

Use `sanitize-html` with allowlist:

```ts
const sanitizeBody = (html: string) => sanitizeHtml(html, {
  allowedTags: ["p", "br", "strong", "em", "u", "h1", "h2", "h3", "ul", "ol", "li", "blockquote", "code", "pre", "a", "img"],
  allowedAttributes: { a: ["href", "rel", "target"], img: ["src", "alt", "width", "height"] },
  allowedSchemes: ["http", "https"],
  transformTags: { a: sanitizeHtml.simpleTransform("a", { rel: "nofollow noopener", target: "_blank" }) },
});
```

Also derive `plainText`:

```ts
const plainText = sanitizeHtml(html, { allowedTags: [], allowedAttributes: {} }).trim();
```

### S3 client & presign

```ts
// config/s3.ts
import { S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { PutObjectCommand } from "@aws-sdk/client-s3";

export const s3 = new S3Client({ region, credentials, forcePathStyle: !!process.env.S3_FORCE_PATH_STYLE });
export async function presignUpload(key: string, mimeType: string, ttlSec = 300) {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: mimeType }), { expiresIn: ttlSec });
}
```

### Media constraints

Per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.6:

| Purpose | Max size | Allowed MIME |
|---------|----------|--------------|
| `article_cover` | 10 MB | `image/jpeg`, `image/png`, `image/webp` |
| `article_embed` | 10 MB | `image/jpeg`, `image/png`, `image/webp` |
| `author_avatar` | 2 MB | `image/jpeg`, `image/png`, `image/webp` |
| `org_logo` | 2 MB | `image/jpeg`, `image/png`, `image/webp`, `image/svg+xml` |
| `epaper_pdf` | 50 MB | `application/pdf` |
| `epaper_cover` | 10 MB | `image/jpeg`, `image/png` |

Validate on both `/media/upload-url` (refuse to issue if violation) and `/media/register` (confirm post-upload metadata matches).

### Article create payload

Per [`docs/05-api-documentation.md`](../../05-api-documentation.md) §5.5 `POST /articles`:

```json
{
  "title": "...",
  "subtitle": "...",
  "body": "<p>...</p>",
  "category": "research_innovation",
  "subcategory": null,
  "location": "Mumbai",
  "tags": ["ai", "education"],
  "coverImageMediaId": "...",
  "mediaIds": ["..."]
}
```

- `status` defaults to `draft`; `version` starts at 0; `authorId = req.user.id`.

### Indexes (build via migration on startup)

Create indexes from [`docs/04-database-design.md`](../../04-database-design.md) §4.2.3 with `{ background: true }`. Add a migration script `scripts/migrate.ts` that ensures indexes — idempotent.

---

## 5. Dependencies

### Blocking
- Subphase 2: `auth`, `users`, `organisations`, real `authGuard`/`roleGuard`.

### Soft
- Frontend's MIME + size cap mirroring.
- AI handler's stub `/v1/summarize` is live (we don't call it yet, but we will in Subphase 4).

### Provides for downstream
- `articles` schema, repository, validators — base for approve/publish/placement in Subphase 4.
- `media` module — used by ad creatives, e-paper, avatars from Subphase 4 onward.
- Article state-machine helpers (`transition`, `assertCanX`) — reused for every subsequent state change.

---

## 6. Suggested Development Order

1. **Day 1** — Mongoose `articles` schema with every field from `docs/04-database-design.md` §4.2.3. Migration script ensures indexes.
2. **Day 2** — Mongoose `media` schema + index. `config/s3.ts` client + presign helper.
3. **Day 3** — `media` controller: `POST /media/upload-url`, `POST /media/register`, `GET /media/:id`, `DELETE /media/:id`. Validators enforce MIME + size caps.
4. **Day 4** — Articles repository: `create`, `update`, `findById`, `findMine`, `softDelete`, `transition`.
5. **Day 5** — Articles service: `createDraft`, `updateDraft`. Inject `plainText` from sanitized body. Optimistic concurrency on PATCH.
6. **Day 6** — Articles validators (Zod): create body, patch body. Surface inline errors with `details`.
7. **Day 7** — Articles controller + routes wiring. `POST /v1/articles`, `PATCH /v1/articles/:id`, `GET /v1/articles?status=draft&authorId=me`.
8. **Day 8** — `submitForReview` service implementing all rules from `docs/07-workflows.md` §7.1.
9. **Day 9** — Event emitter wiring: `article.created`, `article.submitted`. Stub editor-notification log on submit.
10. **Day 10** — Integration tests: create draft, update with conflict, submit happy + every validation-fail path, RBAC denial.
11. **Day 11** — `media` integration tests: presigned issuance, register, delete with refCount decrement.
12. **Day 12** — Configure S3 CORS on the dev bucket. Document required config in `backend/README.md`. Provide a script to apply CORS via AWS CLI.
13. **Day 13 — Integration Day** — Author writes draft, uploads cover, submits. Verify state, indexes, and Pino audit logs.
14. **Day 14** — Exit review, tag `v0.3.0`.

---

## 7. Important Considerations

- **Sanitize on write, sanitize on render.** Backend strips disallowed tags on every PATCH and on create. The reader will additionally use DOMPurify in Subphase 5. Defense in depth — per [`docs/10-security.md`](../../10-security.md) §10.1 XSS row.
- **plainText is authoritative for char counts.** Don't count HTML.
- **Slug strategy.** Generate slug from title at create time using `slugify` + collision-suffix `-2`, `-3`. Only set slug on first save; **do not re-slug on title edits in MVP** (would break URLs once published — Phase 2 may add redirect history).
- **`mediaIds` array vs embed.** Article stores `coverImageMediaId` and a flat `media[]` array of all referenced media IDs. Incrementing `refCount` on register helps with future GC.
- **Soft delete.** `DELETE /v1/articles/:id` sets `deletedAt`. Repository's default `find` filters `deletedAt: null`.
- **Concurrency conflict UX** — return 409 with body `{ "error": { "code": "VERSION_CONFLICT", "message": "Article was modified elsewhere", "details": { "currentVersion": <n> } } }` so FE can show a useful banner.
- **HTML body size cap.** Hard reject body > 500 KB at validator. Soft warn FE > 200 KB (handled FE-side).
- **S3 bucket policy.** Block public access **except** through CloudFront in prod. Dev bucket may be open for upload prefix; reads via presigned GET or pre-signed CDN — choose one and document.
- **Audit logging.** Every transition emits an audit log line (`audit: true, entity: "article", action: "submit"`, etc.). Per [`docs/07-workflows.md`](../../07-workflows.md) §7.9.
- **No direct DB writes from controllers.** All state changes go through service layer. Strict rule.
- **Index build at startup.** Run migration only in `NODE_ENV !== "test"` to keep tests fast.
- **Email-verified gate.** Submission requires `isEmailVerified=true`. Tests must cover the denial path.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Frontend** | Kickoff | Lock the article + media payload shapes. Confirm sanitization tag allowlist matches Tiptap's output. Confirm error code names. Share TS types via `backend/src/contracts/`. |
| **Frontend** | Day 7 | Coordinate S3 CORS test from FE container against backend's dev bucket. |
| **Frontend** | Integration Day | End-to-end submission walkthrough. |
| **AI** | Kickoff | Confirm: the `plainText` field is what backend will send to AI in Subphase 4 (`/v1/summarize`). AI can pre-verify their tests against this field shape. |
| **AI** | End of subphase | Share a sample article JSON for AI's integration tests. |

---

## 9. Deliverables

- [ ] Mongoose `articles` schema with every field + index from `docs/04-database-design.md` §4.2.3.
- [ ] Mongoose `media` schema with indexes from §4.2.5.
- [ ] Migration script idempotently builds indexes.
- [ ] `articles` module endpoints: create, update, get, list-mine, submit, delete.
- [ ] `media` module endpoints: upload-url, register, get, delete.
- [ ] Optimistic concurrency on `version` for every article update.
- [ ] HTML sanitization on write; `plainText` derived.
- [ ] State machine enforces every validation rule for `draft → submitted`.
- [ ] S3 client integrated; CORS documented and configured on dev bucket.
- [ ] Event emitter publishes `article.created` and `article.submitted`.
- [ ] Stub notification log on submit (named editors get a Pino log line).
- [ ] Integration tests covering happy + every failure path.
- [ ] `backend/README.md` documents S3 setup, CORS, and how to run media tests against MinIO or LocalStack if no AWS creds.

### Acceptance checklist
- Author creates draft (text body 350 chars) → 201, status=draft, version=0.
- PATCH with stale version → 409 VERSION_CONFLICT.
- Submit without cover → 422 COVER_REQUIRED.
- Submit valid draft → 200, status=submitted, submittedAt set, event emitted.
- Editor logs in (from seed), GET `/v1/articles?status=submitted` returns the article.
- POST /media/upload-url with `image/svg+xml` purpose=article_cover → 422 (svg not allowed for cover).
- DELETE article → soft delete; subsequent GET returns 404.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Sanitize-html allowlist too tight, dropping Tiptap features | Align with Frontend in kickoff; test the round-trip (Tiptap → sanitize → Tiptap render) on sample content. |
| S3 CORS misconfig blocks FE | Day 12 script applies bucket CORS deterministically; integration day verifies. |
| Index builds slow at first boot (50 K target articles) | Indexes are built `{ background: true }`. For new clusters, indexes form fast on empty collections. Subphase 5 staging deploy should reverify on warm data. |
| `plainText` derivation expensive on large bodies | Cap body at 500 KB; sanitize-html is fast enough at that size. Profile if needed. |
| Slug collisions on identical titles by different authors | Use slug + `-<authorId-prefix>` or numeric suffix from a counter; idempotent on retry. |
| Soft-delete leaks via list endpoints | All `find` calls default to `deletedAt: null` filter; add a lint rule or repository-only query layer. |
| MinIO vs S3 path-style differences | Document `S3_FORCE_PATH_STYLE=true` in dev; tests use MinIO. |
| Refresh token expiry mid-upload of 200 MB video | Presigned URL is independent of our JWT (S3 signature is self-contained). Backend register endpoint still needs auth; if access expired, FE refreshes. |
| Tests slow when mongo-memory-server downloads on first run | Cache it in CI; document a `pretest` script that warms it. |
