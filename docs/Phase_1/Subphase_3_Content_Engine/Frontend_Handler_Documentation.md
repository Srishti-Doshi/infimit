# Subphase 3 — Content Engine · Frontend Handler

**Owner:** Srishti · **Duration:** Week 5–6 · **Tag at exit:** `v0.3.0`

> **Theme of this subphase:** Authors can write. Build the Tiptap editor, the draft list, the submission dashboard, and the media-upload flow (real S3 presigned URLs). By the end, a logged-in author can create a draft, attach a cover image, and submit it for review.

---

## 1. Objectives

1. Ship the Tiptap rich-text editor with the formatting set required by the PRD (headings, bold/italic, lists, blockquote, link, image, code).
2. Build the author portal: draft list, draft editor, submission dashboard.
3. Implement the media-upload flow end-to-end against real S3 presigned URLs: request → upload → register.
4. Wire cover image picker, category select, tags input.
5. Enforce client-side validation matching the submission rules in [`docs/07-workflows.md`](../../07-workflows.md) §7.1.
6. Provide a draft auto-save mechanism (debounced PATCH).

---

## 2. Scope of Work

### In scope
- Pages:
  - `/dashboard/author/drafts` — list of drafts with status badges.
  - `/dashboard/author/drafts/new` — new draft editor.
  - `/dashboard/author/drafts/:id` — edit existing draft.
  - `/dashboard/author/submissions` — submitted articles (read-only, status tracking).
  - `/dashboard/author/profile` — author profile (already from Subphase 2; ensure linked).
- Components:
  - `<TiptapEditor>` with toolbar.
  - `<CoverImagePicker>` — opens media uploader, sets `coverImageMediaId`.
  - `<MediaUploader>` — handles presigned URL request → PUT to S3 → register call.
  - `<CategorySelect>` — controlled by enum from backend (5 core categories).
  - `<TagsInput>` — chip-style, max 10.
  - `<DraftValidationHints>` — sidebar showing submission readiness.
  - `<StatusBadge>` — draft / submitted / approved / published / rejected.
- Hooks:
  - `useDraft(id)` — TanStack Query wrapper for GET / PATCH.
  - `useAutoSave(draft, mutateFn)` — debounced 1.5s after last change.
  - `useMediaUpload()` — orchestrates the three-step S3 flow.
- API clients:
  - `articles.api.ts` — `createDraft`, `getDraft`, `updateDraft`, `submitForReview`, `listMine`.
  - `media.api.ts` — `requestUploadUrl`, `register`, `delete`.
- Validation (Zod, mirrors backend per `docs/07-workflows.md` §7.1):
  - `title` non-empty, ≤ 200 chars.
  - `body` plain-text ≥ 300 chars (compute from Tiptap getText()).
  - `category` from enum.
  - `coverImageMediaId` set.
  - `tags` length 1–10.
- "Submit for review" CTA disabled until validation passes; tooltip lists what's missing.

### Out of scope
- Editor approval/rejection UI → Subphase 4.
- Article rendering for readers (final styling, AI summary display) → Subphase 5 (skeleton in Subphase 4).
- AI summary on demand (force regenerate) → Subphase 4.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Article model | [`04-database-design.md`](../../04-database-design.md) §4.2.3 |
| Articles endpoints | [`05-api-documentation.md`](../../05-api-documentation.md) §5.5 |
| Media endpoints | [`05-api-documentation.md`](../../05-api-documentation.md) §5.7 |
| Article lifecycle | [`07-workflows.md`](../../07-workflows.md) §7.1 |
| Submission validation rules | [`07-workflows.md`](../../07-workflows.md) §7.1 |
| Author features | [`13-feature-documentation.md`](../../13-feature-documentation.md) (Org/Author section) |
| Editor tech (Tiptap) | [`02-system-architecture.md`](../../02-system-architecture.md) §2.3.1 |

---

## 4. Expected Implementation Direction

### Tiptap setup

```ts
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";

const editor = useEditor({
  extensions: [StarterKit, Link.configure({ openOnClick: false }), Image, Placeholder.configure({ placeholder: "Start writing..." })],
  content: draft.body ?? "",
  onUpdate: ({ editor }) => onChange({ body: editor.getHTML(), plainText: editor.getText() }),
});
```

- **Persist `plainText` alongside `body`** so submission validation can count plain-text chars without re-parsing. Send both in PATCH.
- Image insert via toolbar opens `MediaUploader`, which on success returns `{ mediaId, url }` and inserts `<img>` into the editor.

### Auto-save flow

```
edits → debounce 1500ms → PATCH /v1/articles/:id with { body, plainText, title, ... }
       ↓
       optimistic local state; toast "Saved" on success; toast retry on failure
```

- Conflict on `version` (HTTP 409 from backend) → reload draft, show banner "This draft was edited elsewhere — your changes were not saved."

### Media upload — three-step S3 flow

```
1. POST /v1/media/upload-url
   body: { mimeType, size, purpose }
   ← { uploadUrl, key, expiresIn }

2. PUT <uploadUrl>   (directly to S3, no auth header from app)
   header: Content-Type: <mimeType>
   body: <file bytes>

3. POST /v1/media/register
   body: { key, dimensions?, alt? }
   ← { id, url }   ← mediaId to use in article fields
```

- Show progress bar (XHR `onprogress`).
- Enforce client-side size limits before requesting URL:
  - Image: 10 MB
  - Video: 200 MB
  - PDF: 50 MB
- MIME whitelist (mirror backend) before request.

### Draft validation panel

```ts
const hints = {
  title: title.length > 0 && title.length <= 200,
  body: plainText.length >= 300,
  category: !!category,
  cover: !!coverImageMediaId,
  tags: tags.length >= 1 && tags.length <= 10,
};
const canSubmit = Object.values(hints).every(Boolean);
```

Render a checklist sidebar with green/red dots.

### Optimistic concurrency

Every PATCH includes the `version` you last received. Backend rejects mismatch with 409. Re-fetch on conflict and surface a friendly banner.

---

## 5. Dependencies

### Blocking
- Backend Subphase 3 ships:
  - `POST /v1/articles` (create draft)
  - `PATCH /v1/articles/:id` (update)
  - `POST /v1/articles/:id/submit`
  - `GET /v1/articles?status=draft&authorId=me`
  - `POST /v1/media/upload-url`
  - `POST /v1/media/register`

### Soft
- Backend confirmation of MIME whitelist (so client and server reject the same things).
- Backend confirmation of categories enum constant values.

### Provides for downstream
- `<TiptapEditor>` component → reused in Editor portal Subphase 4 for edits/corrections.
- `<MediaUploader>` → reused for ad creative, avatar, e-paper upload.
- `articles.api.ts` and `media.api.ts` clients → consumed by editor + reader flows.

---

## 6. Suggested Development Order

1. **Day 1** — `articles.api.ts` and `media.api.ts` typed clients against the backend contract.
2. **Day 2** — `<TiptapEditor>` shell with StarterKit; toolbar with Bold/Italic/Lists/H1/H2.
3. **Day 3** — Link & Image extensions in editor; toolbar buttons.
4. **Day 4** — Draft list page: query my drafts, render table with title, updatedAt, status badge.
5. **Day 5** — New draft page: title input + Tiptap + category select + tags input + save button.
6. **Day 6** — `useAutoSave` hook (debounced PATCH) wired into the new draft page.
7. **Day 7** — `<MediaUploader>` — implement three-step S3 flow with progress bar. Test against real backend.
8. **Day 8** — `<CoverImagePicker>` consuming `<MediaUploader>`; preview + replace.
9. **Day 9** — Image insertion into editor via the same uploader; alt text input prompt.
10. **Day 10** — `<DraftValidationHints>` sidebar; submit button enabled state.
11. **Day 11** — Submit-for-review action: POST + toast + redirect to submissions list.
12. **Day 12** — Submissions tracking page: shows status, rejection reason if any.
13. **Day 13 — Integration Day** — End-to-end: author writes draft, attaches cover, submits. Backend confirms `status=submitted`.
14. **Day 14** — Exit review, tag `v0.3.0`.

---

## 7. Important Considerations

- **Don't sanitize HTML on the client** — backend will sanitize via DOMPurify-equivalent on the server, and the reader will sanitize on render (Subphase 5). FE just sends Tiptap HTML output unchanged.
- **Tiptap HTML size guard.** Body > 200 KB → toast warning ("This article is unusually large"). Hard cap at 500 KB enforced both client and server.
- **`plainText` field** — always derive from `editor.getText()`. Don't strip HTML manually; Tiptap's `getText` is reliable.
- **Token refresh during long uploads.** A 200 MB video upload can take longer than the 15-min access token. Use the `apiClient` refresh interceptor; presigned URL itself is S3-signed and doesn't need our auth.
- **CORS on S3.** Backend's S3 bucket needs CORS allowing PUT from FE origin. Document the required config; backend handler manages it.
- **EXIF stripping.** P1 doesn't strip EXIF; document this as a known limitation (Phase 3 will).
- **Browser support for Tiptap.** Requires modern browsers; safe for our target.
- **Mobile draft editor.** Tiptap on mobile has rough edges; ensure toolbar collapses to a kebab menu < 768 px.
- **Accessibility.** Tiptap content must remain keyboard-navigable; toolbar buttons need ARIA labels.
- **Don't leak presigned URLs in Sentry / logs.** Suppress in axios interceptors.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff | Lock `articles` POST/PATCH/submit shapes. Confirm `version` field for concurrency. Confirm MIME whitelist + size caps. Confirm S3 CORS config. |
| **Backend** | Day 7 | Pair on the real S3 upload flow — verify CORS headers, signature validity, register endpoint shape. |
| **Backend** | Integration Day | End-to-end submission test. |
| **AI** | — | No direct interaction. AI is consumed via backend in Subphase 4. |

---

## 9. Deliverables

- [ ] `<TiptapEditor>` with full toolbar (headings, bold/italic, lists, blockquote, link, image, code).
- [ ] Author draft list, new draft, edit draft pages.
- [ ] Submissions tracking page (read-only with status badges).
- [ ] `<MediaUploader>` working against real S3 presigned URLs with progress bar.
- [ ] `<CoverImagePicker>` + image insertion in editor.
- [ ] Auto-save (debounced PATCH) with conflict handling.
- [ ] Submit-for-review action wired with all validation gating.
- [ ] Zod validators matching `docs/07-workflows.md` §7.1 rules.
- [ ] Status badge component.
- [ ] Component tests for Tiptap wrapper, MediaUploader, useAutoSave.

### Acceptance checklist
- Author logs in, creates a draft, types > 300 chars, attaches cover, sets category + tags, clicks Submit. Backend returns `status=submitted`. UI redirects to submissions list with the article in it.
- Auto-save fires after typing pause; toast confirms save.
- Slow network: progress bar renders; cancel button works (uploads abortable).
- Editor-induced conflict (manually PATCH from another tab) returns 409 → friendly banner.
- Validation hints update live; submit button disabled until all green.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Tiptap HTML output not matching backend's sanitizer | Agree on a tag/attr allowlist with backend in kickoff. Test paste-from-Word scenario; Tiptap's `StarterKit` strips most disallowed content but quirks exist. |
| S3 CORS misconfig blocking uploads | Test on Day 7 with both `localhost:5173` and the staging FE origin. Document required config in `backend/README.md`. |
| Auto-save races causing version conflicts | Single in-flight mutation per draft; queue subsequent edits; bump version on each success. |
| Large image uploads on slow networks fail silently | Show progress bar; on timeout, allow retry without re-uploading bytes (use S3 multipart only if necessary in P1 — single PUT is fine for ≤ 10 MB images). |
| Tiptap bundle size adds ~200 KB | Lazy-load editor route; verify with bundle analyzer. |
| Drafts list pagination not yet built backend-side | Coordinate: backend ships `?page=1&limit=20`; FE assumes that contract from Subphase 1 mocks. |
| Insert-image flow uses two upload endpoints (cover + embed) — confusion | Use a single `<MediaUploader>` with `purpose` prop; UI labels distinguish "Cover image" vs "Insert image". |
| Field-level errors lost during partial PATCH | Backend should return per-field errors via `error.details`; FE surfaces them inline. |
