# Infimit — Subphase 4 QA Catalog

Master test catalog for the comprehensive QA pass on Infimit before Subphase 5 development begins.

- **Owner:** Infimit team (Prince — backend, Srishti — frontend)
- **Scope:** Subphases 1–4 shipped surface (auth, identity, content engine, editorial workflow)
- **Goal:** Identify and document all bugs, edge cases, UI/UX inconsistencies, and functional gaps. Fix critical/high before Subphase 5; bundle medium into Subphase 5 sub-PRs; defer low/polish.
- **Created:** 2026-06-05
- **Baseline commit:** `b51255f` on `main`

---

## 1. Scope

### In scope
- All routes and workflows shipped through Subphase 4 (auth, author, editor, admin, public reader, notifications, e-paper, comments, AI summary).
- Cross-cutting: responsive sweep (mobile / tablet / desktop), perf sweep (Lighthouse perf + bundle sanity).
- Error envelopes, auth interceptor edge cases, optimistic concurrency, single-flight refresh.
- API contracts between FE and BE (real backend, not MSW).

### Out of scope (deferred)
- **Accessibility:** Deferred to Subphase 5's Lighthouse-≥-85 gate.
- **Playwright / automated E2E:** Manual only this pass; automation deferred to Phase 2.
- **Subphase 5 placeholder routes** (`/`, `/category/:slug`, `/search`, `/epaper`): only smoke-check that placeholder copy renders.
- **Backend load testing:** k6/artillery deferred to Phase 2 hardening.

---

## 2. How to use this doc

1. Pick a category section.
2. Walk the **Happy-path checklist** end-to-end. Tick each line.
3. Walk the **Edge cases** list. For any failure, file an issue (see §5).
4. Note any UI/UX or copy issue under **UI/UX & visual** (also fileable).
5. Log filed issues in the per-category **Findings** table (issue number + one-line summary).
6. Move to the next category.

Order recommended for Phase C:
1. **Core editorial loop** (Auth → Author → Editor approvals → AI summary → Public reader → Comments → Editor moderation). One human walks the loop end-to-end first.
2. **Admin surface** (editors, organisations, approval delegation, e-papers).
3. **Notifications** + bell.
4. **Cross-cutting sweeps** (responsive, perf, error states, auth interceptor).

---

## 3. Test environment setup

### Stack-under-test
- **Real backend** (not MSW). Mongo + Redis + MinIO via docker-compose. AI service (FastAPI) running.
- **Real frontend** dev server (`vite`) talking to real backend (`apiClient` base URL pointing at `http://localhost:4000/v1`).
- **MSW must be OFF.** Set `VITE_USE_MOCK=false` in `frontend/.env` before starting the FE dev server. Without this, MSW intercepts every request and you'll be silently testing against mocks, not the real backend. Verify in DevTools Console — `[MSW] Mocking enabled.` should **NOT** appear at boot. If it does, clear site data, set the env var, restart `vite`.
- **Email is stubbed.** The backend does not send real emails in dev (no mailcatcher in `docker-compose.dev.yml`). Verification + password-reset URLs are logged to the backend terminal as `email_verify_sent_stub` / `email_password_reset_sent_stub`. Grep the BE log when you need the link.

### Commands
| Workspace | Dev server | Pre-flight |
|---|---|---|
| `backend/` | `npm run dev` | `npm run typecheck && npm run lint && npm run test` |
| `frontend/` | `npm run dev` | `npm run typecheck && npm run lint && npm run test` |

### Roles needed
Seed (or register + manually promote) at least one of each:
- `reader` (default new account)
- `author`
- `editor`
- `admin`

Use separate browsers / private windows / containers per role so sessions don't collide.

### Data prerequisites
- ≥1 organisation (with logo if available)
- ≥3 categories
- ≥1 published article (for reader page, comments, AI summary verification)
- ≥1 draft + ≥1 submission pending review (for editor queue)
- ≥1 e-paper issue (PDF + cover) for archive page

---

## 4. Severity rubric

| Severity | Definition | Phase D treatment |
|---|---|---|
| **Critical** | Data loss, security hole, broken core editorial loop, auth/session corruption | Block Subphase 5; fix immediately in a chore PR |
| **High** | Feature broken for a primary role, no workaround, error envelope mismatch FE↔BE | Fix before Subphase 5 |
| **Medium** | Workaround exists, polish on an existing feature, minor UX friction | Bundle into Subphase 5 sub-PRs |
| **Low** | Visual nit, copy typo, console warning, dev-only annoyance | Defer (track in issue but not blocking) |

---

## 5. Bug filing protocol

All findings go to **GitHub Issues** on `Srishti-Doshi/infimit` with label `qa/subphase-4`.

Label description: *"Bug or issue found during the Subphase 4 QA pass; resolve before Subphase 5"*.

### Issue template (paste into body)
```
**Severity:** Critical | High | Medium | Low
**Workspace:** backend | frontend | both | docs
**Category:** auth | author | editor | admin | ai | comments | notifications | epaper | reader | cross-cutting

**What happened**
<one-line summary>

**Steps to reproduce**
1.
2.
3.

**Expected**
<what should happen>

**Actual**
<what actually happens — paste network response / console error / screenshot>

**Environment**
- Branch / commit:
- Role used:
- Browser:
```

Add label `qa/subphase-4`. Add a severity label if helpful (e.g. `severity:critical`).

---

## 6. Known baseline issues (carry-over from Phase A)

| ID | Severity | Title | Workspace | Status |
|---|---|---|---|---|
| BUG-001 | Medium | format:check flags 44 frontend files on Windows (CRLF/LF drift) | frontend | Open — to be fixed in chore PR |
| OBS-001 | — | Backend test runtime regression: 59s vs prior ~27s | backend | Investigate (re-baseline first) |

---

## 7. Category checklists

> Each category lists the **surface** (routes + key components), a **happy-path checklist**, **edge cases**, **UI/UX & visual** checks, and a **Findings** table.

---

### 7.1 Auth

**Surface:** `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email`. Backend `auth` module + JWT refresh + email verification flow. Interceptor in `lib/api-client.ts`.

#### Happy-path checklist
- [ ] Register a new account with valid name/email/password — success state shown, verify URL logged to BE terminal as `email_verify_sent_stub`. **User is auto-logged in immediately** (access + refresh tokens issued at register, BEFORE verification — the verify flow only flips `isEmailVerified`, not session state).
- [ ] Paste the verify URL into the browser → `/auth/verify-email?token=...` → "Email verified" success modal → BE logs `auth_email_verified` audit. User remains signed in (does NOT redirect to login).
- [ ] After a logout, log in again with the verified credentials → lands on `/dashboard/me` (or role-appropriate landing).
- [ ] Refresh the page **once** → still logged in (session persisted). Note: rapid repeated refresh exposes the rate-limit / 429-as-logout cluster (see issue #20).
- [ ] Click "Sign out" → BE logs `auth_logout`, session cleared, redirected to `/auth/login?next=...`.
- [ ] Forgot-password flow: request reset (BE logs `email_password_reset_sent_stub`) → paste reset URL → set new password (BE logs `auth_password_reset_completed` with `revokedSessions ≥ 1`) → log in with new password.

#### Edge cases
- [ ] Register with already-used email → friendly error (envelope `error.code` like `EMAIL_TAKEN`), not raw 500.
- [ ] Register with weak password (below policy) → field-level validation error.
- [ ] Log in before verifying email → blocked with clear copy + resend option.
- [ ] Log in with wrong password 5+ times → rate-limited (check backend rate limiter response).
- [ ] Reset-password token expired → friendly error.
- [ ] Reset-password token reused → blocked.
- [ ] Submit forgot-password for non-existent email → same generic success message (no email enumeration).
- [ ] Refresh token rotation: leave a tab open >access-token TTL, perform an action → single-flight 401 refresh fires, request retries silently, no flicker.
- [ ] 403 on a route the user lacks permission for → toast surfaces error, session is preserved (does NOT log out). Regression pinned by `auth-refresh.test.ts`.
- [ ] Two browser tabs logged in → logout in one → other tab next request returns 401 → refresh fails → session clears cleanly across tabs.
- [ ] Manually invalidate refresh-token cookie → next API call clears session and redirects to login.

#### UI/UX & visual
- [ ] All auth forms keyboard-navigable (Tab order sensible, Enter submits).
- [ ] Password input has show/hide toggle if implemented.
- [ ] Loading spinner on submit; submit button disabled while pending.
- [ ] Error messages render under their fields, not just as a toast.
- [ ] Form state preserved on validation error (don't clear typed email).

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.2 Author — drafts & composer

**Surface:** `/dashboard/author/drafts`, `/dashboard/author/drafts/new`, `/dashboard/author/drafts/:id`, `/dashboard/author/submissions`. Components: `TiptapEditor`, `ImageInsertDialog`, `CoverImagePicker`, `CategorySelect`, `TagsInput`, `MediaUploader`, `DraftValidationHints`, `ArticleStatusBadge`. Hook: `use-auto-save`, `use-media-upload`.

#### Happy-path checklist
- [ ] Create a new draft from `/dashboard/author/drafts/new` — empty composer opens, autosave fires after debounce, ID assigned on first save.
- [ ] Type title, subtitle, body (Tiptap) → autosave indicator shows "Saving…" then "Saved".
- [ ] Pick category, add tags, upload cover image (3-step S3: presign → PUT → register). Cover preview shows.
- [ ] Insert inline image via `ImageInsertDialog` — same 3-step flow, image renders in editor.
- [ ] Use Tiptap formatting: bold / italic / headings / link / list. All survive autosave round-trip.
- [ ] Refresh the draft page mid-edit → all content + cover + tags reload from server.
- [ ] Open `/dashboard/author/drafts` → new draft appears with status `draft`.
- [ ] Submit the draft → status moves to `pending_review`, redirected to `/dashboard/author/submissions`.
- [ ] Submission appears in the editor's approval queue (cross-check with editor account).

#### Edge cases
- [ ] Lose internet mid-edit → autosave fails gracefully, retry on reconnect, no silent data loss.
- [ ] Two tabs editing the same draft → optimistic concurrency: second save returns `VERSION_CONFLICT` (or equivalent code), FE prompts user.
- [ ] Submit without required fields (no title / no body / no category) → `DraftValidationHints` surfaces all blockers, submit disabled.
- [ ] Submit with title > max length → server-side rejection surfaces correctly.
- [ ] Upload cover image > size limit → friendly error from presign or register step.
- [ ] Upload unsupported file type as cover → rejected client-side before presign.
- [ ] Insert image then delete it from editor → media is still registered server-side (orphan handling is Phase 2; just note if orphans accumulate).
- [ ] Paste rich HTML from Word / Google Docs → Tiptap normalises; no script injection survives.
- [ ] Tag with > N chars / special chars → validation.
- [ ] Network flake during S3 PUT → upload retries or surfaces a clean error.

#### UI/UX & visual
- [ ] Autosave indicator is unambiguous; no "Saving…" that never resolves.
- [ ] Cover image area shows aspect-ratio hint or crop preview consistent with reader page render.
- [ ] Tiptap toolbar is sticky / accessible on long articles.
- [ ] Submission button copy is clear about irreversibility (or that editor can return).

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.3 Editor — approval workflow

**Surface:** `/dashboard/editor`, `/dashboard/editor/approvals`, `/dashboard/editor/approvals/:id`. Components: `ApprovalQueueRow`, `RejectModal`, `PlacementPanel`, `AISummaryBlock` (covered separately in §7.5).

#### Happy-path checklist
- [ ] Visit `/dashboard/editor` → redirects to `/dashboard/editor/approvals`.
- [ ] Queue shows all pending submissions with status pill, author, category, submitted-at.
- [ ] Open a submission → preview renders article body via `<SanitizedHtml>` (no `dangerouslySetInnerHTML` slipping through).
- [ ] Approve → article publishes, status moves to `published`, slug assigned, author notified.
- [ ] Open a different submission → reject via `RejectModal` with a reason → status moves to `rejected`, author notified, reason recorded.
- [ ] Publish action ALSO surfaces placement panel — set primary category placement, optional homepage flag, save.
- [ ] Unpublish a published article → status moves to `unpublished`, public slug returns 404 or appropriate state.
- [ ] Re-publish an unpublished article → returns to live.

#### Edge cases
- [ ] Approve a submission concurrently from two editor sessions → second one gets `VERSION_CONFLICT` and refreshes.
- [ ] Approve while author is still editing (shouldn't be possible if submitted, but verify state machine).
- [ ] Reject with empty reason → validation requires non-empty.
- [ ] Reject with very long reason → server-side length check.
- [ ] Placement panel: assign same article to two homepage slots → server prevents conflict or last-write wins (verify intended behaviour).
- [ ] Publish without setting placement → article publishes with default placement; verify reader page still works.
- [ ] Unpublish then visit public slug → 404 or "no longer available" copy, not a 500.
- [ ] Permissions: a `reader` or `author` visiting `/dashboard/editor/approvals` → blocked (RequireRole).

#### UI/UX & visual
- [ ] Queue row visual hierarchy: status pill, title, author, time — scannable.
- [ ] Long titles wrap or ellipsis without breaking layout.
- [ ] Reject modal is keyboard-dismissable (Esc) and submits on Enter where appropriate.
- [ ] Placement panel labels match domain language (no jargon left over from earlier iterations).
- [ ] Approve / Publish / Unpublish buttons have distinct affordances (color / icon), confirm dialog where destructive.

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.4 Editor — comment moderation

**Surface:** `/dashboard/editor/comments/pending`. Components: `CommentRow`, `CommentThread`.

#### Happy-path checklist
- [ ] Reader submits a comment on a public article (see §7.8).
- [ ] Editor visits `/dashboard/editor/comments/pending` → pending comment appears.
- [ ] Approve single → comment becomes visible on the public article.
- [ ] Reject single → comment is rejected; reader (if listed in their dashboard) sees rejected state.
- [ ] Bulk-select multiple pending comments → bulk approve / bulk reject works.
- [ ] Reply / threaded view renders correctly in `CommentThread`.

#### Edge cases
- [ ] Approve a comment whose parent comment was deleted → orphan handling (display "deleted parent" or hide).
- [ ] Reject a comment that was already approved (stale view) → server returns appropriate code, FE refreshes.
- [ ] Bulk-action with mix of valid + invalid IDs → partial-success envelope handled.
- [ ] Comment text contains HTML / scripts → rendered as plain text (NEVER `dangerouslySetInnerHTML`). Backend sanitisation is also expected; verify FE doesn't trust raw text.
- [ ] Very long comment (paragraphs) → wraps, doesn't break thread layout.
- [ ] Comment contains URL → not auto-linkified unless we intend it (verify desired behaviour).
- [ ] Spam burst (10+ comments submitted rapidly) → all appear in queue; rate-limit feedback on reader side.

#### UI/UX & visual
- [ ] Bulk-select checkbox semantics clear (select-all on page vs all matching filter).
- [ ] Status changes optimistic; revert on error.
- [ ] Empty state (no pending) renders `EmptyState` primitive cleanly.

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.5 AI summary

**Surface:** `AISummaryBlock` inside `/dashboard/editor/approvals/:id`. Backend `ai-proxy` HTTP client with opossum circuit breaker. External AI service (FastAPI).

#### Happy-path checklist
- [ ] Open a submission preview → AI summary renders alongside body.
- [ ] Summary shows generation timestamp / model info if surfaced.
- [ ] Click "Regenerate" → fresh summary replaces old one.
- [ ] If body changes after approval, summary is regenerated (or stale-marker visible).

#### Edge cases — degraded states
- [ ] **AI service down:** Stop the FastAPI service. Open a submission → `AISummaryBlock` shows degraded badge with friendly copy, not a stack trace.
- [ ] **AI service slow (timeout):** Add artificial delay > timeout → circuit breaker trips, degraded badge, retry option.
- [ ] **AI service returns malformed payload:** mock or stub → degraded handling, no FE crash.
- [ ] **Circuit-breaker half-open recovery:** After AI service comes back, next request succeeds and badge clears.
- [ ] **Force-regenerate on degraded state:** retries; succeeds when service recovers.
- [ ] Article body is empty / extremely short → summary still generates or returns a graceful "not enough content".
- [ ] Article body is extremely long → summary stays within length contract; no truncation surprises.

#### UI/UX & visual
- [ ] Degraded badge uses an unmistakable colour (warning, not error).
- [ ] Loading shimmer / skeleton during generation.
- [ ] Regenerate button disabled while pending.

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.6 Admin

**Surface:** `/dashboard/admin`, `/dashboard/admin/editors`, `/dashboard/admin/organisations`, `/dashboard/admin/approvals`, `/dashboard/admin/epapers`, `/dashboard/admin/epapers/new`.

#### Happy-path checklist
- [ ] Promote a reader to author → user's roles update; user sees author dashboard on next request.
- [ ] Promote an author to editor → same.
- [ ] Demote → role removed cleanly.
- [ ] Create an organisation → appears in list; can edit name / logo.
- [ ] Delete an organisation → confirm dialog; if it has linked authors, blocked or migrated per intended behaviour.
- [ ] Approval delegation: admin can approve any submission from `/dashboard/admin/approvals`.
- [ ] E-paper archive: list shows existing issues with cover + date + page count.
- [ ] Upload new e-paper (see §7.7).

#### Edge cases
- [ ] Promote self / demote self → blocked or warning.
- [ ] Last-admin-protection: demoting the only admin → blocked with clear copy.
- [ ] Delete an organisation with linked authors → expected behaviour (block / cascade / orphan) verified against backend module.
- [ ] Edit org name to duplicate of existing org → unique constraint error surfaces cleanly.
- [ ] Permissions: a non-admin visiting `/dashboard/admin` → blocked.

#### UI/UX & visual
- [ ] Role table shows current roles unambiguously (chips or badges).
- [ ] Destructive actions (delete, demote) require confirm.
- [ ] Logo upload mirrors the cover-image 3-step flow.

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.7 E-paper

**Surface:** `/dashboard/admin/epapers`, `/dashboard/admin/epapers/new`. Backend `epaper` module + media collection + presigned download.

#### Happy-path checklist
- [ ] Upload form: pick PDF (3-step flow → media doc) + cover image (3-step flow → media doc) + title + issue date + page count → submit.
- [ ] New issue appears in archive grid with cover.
- [ ] Click an issue → triggers download endpoint, backend resolves `pdfMediaId` → 302 redirect to presigned GET → browser downloads PDF.
- [ ] Stats: download count increments; view count increments on archive impression (if tracked).

#### Edge cases
- [ ] Upload PDF only, no cover → validation blocks submit OR allows with placeholder cover (verify intended behaviour).
- [ ] Upload very large PDF (>20MB) → S3 PUT succeeds; presigned URL works for large file.
- [ ] Upload non-PDF as PDF field → MIME check rejects.
- [ ] Issue date in the future → allowed or warned (verify intent — admins may back-date or pre-date).
- [ ] Duplicate issue date → allowed (issues can share a date).
- [ ] Presigned GET URL expired / replayed → backend regenerates on next request.
- [ ] Delete an e-paper (if supported) → grid updates; download link 404s gracefully.

#### UI/UX & visual
- [ ] Archive grid responsive: 2-col mobile, 3-col tablet, 4-col desktop (or whatever the design intends).
- [ ] Cover images load lazily; alt text present.
- [ ] Upload progress visible for both PDF and cover.
- [ ] Issue date formatted consistently (locale-friendly).

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.8 Public reader

**Surface:** `/article/:slug`. Components: `SanitizedHtml`, `BreakingNewsTicker`, comment thread, `Footer`, `Header`, `PrimaryNav`.

#### Happy-path checklist
- [ ] Visit a published article URL → article renders: title, author, category, hero image, body, published-at, AI summary (if exposed publicly).
- [ ] Body renders rich content (bold/italic/headings/links/images) via `<SanitizedHtml>`.
- [ ] Comments section: existing approved comments visible.
- [ ] Submit a new comment as a logged-in reader → enters pending state; not visible until editor approves.
- [ ] Submit as anonymous (if allowed) or get prompted to log in (verify intent).
- [ ] Click category in header / breadcrumb → navigates to category page (placeholder ok).
- [ ] Breaking-news ticker shows latest published articles, scrolls smoothly, pauses on hover (if implemented).

#### Edge cases
- [ ] Visit a non-existent slug → 404 page with link back home.
- [ ] Visit an unpublished article's slug directly → 404 (do NOT leak draft content).
- [ ] Submit a comment with `<script>alert(1)</script>` → rendered as plain text after approval; no execution.
- [ ] Submit a comment with markdown / HTML tags → escaped (FE renders plain text per docs/04 §4.2.4).
- [ ] Body contains `<iframe>` / `<script>` from a malicious-pasted source → DOMPurify strips them on FE; backend sanitize-html should have already stripped them on save. Both layers verified.
- [ ] Very long article body → reader page renders without layout breakage; images responsive.
- [ ] Image in body has missing `alt` → renders without error.
- [ ] Reader visits while logged out → can view article + read comments but can't submit (or prompted to log in).
- [ ] Slow network → loading skeletons appear; no layout shift on load (CLS).

#### UI/UX & visual
- [ ] Typography (Fraunces display + Inter body) renders correctly; no FOUT.
- [ ] Brand red (`#DC2626`) used only for brand accents per design tokens.
- [ ] Article body line-length comfortable on desktop (≈ 65–75 char measure).
- [ ] Breaking-news ticker mobile-friendly.
- [ ] Footer links work; social icons present (Lucide deprecation warning noted in memory — visual ok).

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.9 Notifications

**Surface:** `NotificationBell` (header), `/dashboard/notifications`. API: `notifications-api`. Backend dual fan-out (audit-log stubs + real subscribers).

#### Happy-path checklist
- [ ] As author: submit a draft → editor account's bell increments.
- [ ] As editor: approve / reject a submission → author account's bell increments.
- [ ] Click the bell → dropdown shows latest N notifications.
- [ ] Click a notification → routes to the relevant resource (draft / article / comment).
- [ ] Visit `/dashboard/notifications` → full list with mark-as-read.
- [ ] Mark single read → badge count drops by 1.
- [ ] Mark all read → badge clears.

#### Edge cases
- [ ] Burst: editor approves 20 submissions in a row → author sees 20 notifications, badge doesn't overflow visually.
- [ ] Notification for a deleted resource (article unpublished, comment rejected) → link gracefully handles missing target.
- [ ] Multiple tabs: mark-read in tab A → tab B's badge updates on next poll / refetch.
- [ ] Stale notification (older than display window) → archived view or scroll loads more.
- [ ] Comment-approved notification fires for the comment author, not just the article author (verify intended behaviour).

#### UI/UX & visual
- [ ] Bell badge readable on light + dark headers.
- [ ] Dropdown dismisses on outside click + Esc.
- [ ] Empty state for no notifications uses the `EmptyState` primitive.

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 7.10 Subphase 5 placeholders (smoke only)

These routes ship UI scaffolding only. Confirm they don't 500 and copy is in-line with the placeholder convention.

- [ ] `/` — placeholder copy renders, header / footer / ticker present.
- [ ] `/category/:slug` — placeholder, category name from slug (or "Coming soon").
- [ ] `/search` — placeholder.
- [ ] `/epaper` — placeholder (admin upload + archive is at `/dashboard/admin/epapers`, separate).
- [ ] `/dashboard/reader/*` — placeholder.

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

## 8. Cross-cutting sweeps

### 8.1 Responsive

**Breakpoints to test:** ~375px (mobile), ~768px (tablet), ~1280px (desktop), ~1920px (wide).

For each top-level page, verify:
- [ ] No horizontal scroll on mobile (375px).
- [ ] Header collapses to hamburger below `lg` (per design tokens / Tailwind convention).
- [ ] Sidebar in dashboard collapses or becomes a drawer on mobile.
- [ ] Modal (`Modal`, `RejectModal`, `ImageInsertDialog`) is full-screen or properly sized on mobile.
- [ ] Tiptap toolbar usable on tablet/mobile.
- [ ] Approval queue + comment moderation tables stack or horizontally scroll cleanly on mobile.
- [ ] E-paper archive grid responsive.
- [ ] Article body (`<SanitizedHtml>`) images don't overflow.
- [ ] Forms (`Input`, `Button`) full-width on mobile.

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 8.2 Performance

For each high-traffic page (public reader, dashboard landing, approval queue, e-paper archive):
- [ ] Lighthouse perf score (desktop + mobile). Record number per page; flag anything < 70 mobile / < 85 desktop.
- [ ] Largest Contentful Paint < 2.5s on simulated Fast 3G.
- [ ] Cumulative Layout Shift < 0.1.
- [ ] Total Blocking Time < 200ms.
- [ ] Bundle sanity: main bundle is 420 kB, tags-input chunk is 401 kB at baseline (from Phase A). Investigate any chunk > 500 kB.
- [ ] Lazy-loaded route chunks actually defer (Network tab shows chunk download only on route entry).
- [ ] Images in article body are lazy-loaded (`loading="lazy"`) where appropriate.
- [ ] No N+1 API calls on a single page render (DevTools Network → group by endpoint).

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 8.3 Error envelope + interceptor

- [ ] Trigger a 400 (validation) on any mutation → FE renders friendly copy from `error-messages.ts` mapped by `error.code`, NOT raw `error.message`.
- [ ] Trigger a 401 mid-session by manually expiring the access token → silent refresh + retry; no UI flicker; no logout.
- [ ] Trigger a 401 by invalidating the refresh token → session clears; user redirected to `/auth/login` with a friendly message.
- [ ] Trigger a 403 (e.g. author visiting editor route) → error surfaces; session preserved.
- [ ] Trigger a 404 on an API call → friendly empty state, not a crash.
- [ ] Trigger a 409 (`VERSION_CONFLICT`) on optimistic concurrency → user prompted to refresh.
- [ ] Trigger a 500 (kill backend mid-request) → error boundary catches; "something went wrong" with reload affordance.
- [ ] Trigger a network failure (offline) → toast + offline indicator; no infinite spinner.
- [ ] Verify `error.code` strings used on FE match what backend emits (grep `error-messages.ts` against backend `validators/*` + module error codes).

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 8.4 Loading / empty / error UI states

For each list/grid view (drafts, submissions, approvals, comments queue, e-paper archive, notifications):
- [ ] Loading: skeleton or spinner appears, no blank-screen-during-fetch.
- [ ] Empty: `EmptyState` primitive renders with helpful copy + CTA where appropriate.
- [ ] Error: friendly retry affordance, not a raw error trace.

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

### 8.5 Console hygiene

While walking Phase C, keep DevTools console open. Log any:
- [ ] Unhandled promise rejections.
- [ ] React key warnings.
- [ ] Hydration / mismatch warnings.
- [ ] 404s on assets (fonts, images, source maps).
- [ ] Deprecated API warnings (other than known Lucide / ESLint 8 deferrals).

#### Findings
| # | Severity | Issue | Status |
|---|---|---|---|
|   |          |       |        |

---

## 9. Phase D — Triage workflow

Once Phase C is complete:

1. **Group findings** by workspace (backend / frontend / both) and severity.
2. **Critical + High** → one chore PR per workspace, scope `chore(backend): qa subphase-4 hotfixes` / `chore(frontend): qa subphase-4 hotfixes`. Branch naming follows the project convention: `chore/subphase-4-<workspace>-qa-hotfixes`.
3. **Medium** → bundle into Subphase 5 sub-PRs at the natural boundary (e.g. UI polish into the FE sub-PRs, validator tweaks into BE sub-PRs).
4. **Low** → keep as open issues with `qa/subphase-4` label and `defer` or `polish` label; revisit post-Phase 1.

---

## 10. Phase E — Stability gate (exit criteria)

Subphase 5 development may begin when:
- [ ] All Critical and High findings are resolved (closed issues, merged PRs).
- [ ] Regression sweep (Phase A trio) is green on both workspaces, on `main`.
- [ ] No open `severity:critical` or `severity:high` issues labelled `qa/subphase-4`.
- [ ] Optional: snapshot tag `v0.4.1-subphase4-stabilized` published via GitHub Releases UI (per project tag conventions).

---

## Appendix A — Quick-reference: roles → routes

| Role | Allowed routes |
|---|---|
| Public (unauthenticated) | `/`, `/article/:slug`, `/auth/*`, `/category/:slug`, `/search`, `/epaper` |
| Reader (default) | All public + `/dashboard/me`, `/dashboard/notifications`, `/dashboard/reader/*` |
| Author | Reader's + `/dashboard/author/*` |
| Editor | Author's + `/dashboard/editor/*` |
| Admin | Editor's + `/dashboard/admin/*` |

---

## Appendix B — Reference docs

- `docs/04-database-design.md` §4.2.4 — comment rendering policy (plain text only)
- `docs/05-api-documentation.md` — envelope contract
- `docs/10-security.md` — auth, sanitisation, JWT refresh
- `docs/Phase_1/Subphase_4_Editorial_Workflow/` — Subphase 4 handler docs
- `frontend/docs/design-tokens.md` — locked design system
- Memory: `project_infimit_phase_1_state`, `project_infimit_frontend_state`
