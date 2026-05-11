# Subphase 4 — Editorial Workflow + AI Integration · Frontend Handler

**Owner:** Srishti · **Duration:** Week 7–8 · **Tag at exit:** `v0.4.0`

> **Theme of this subphase:** Editorial machinery. Editors triage submitted articles, approve / reject / publish, set placement, and moderate comments. Admins manage e-papers and the full backlog. The AI summary becomes visible in the editor's preview and on the article preview page.

---

## 1. Objectives

1. Build the Editor portal: approval queue, article preview, approve/reject actions, placement controls, comment moderation queue.
2. Build the Admin portal: e-paper upload, full approval backlog, override actions.
3. Build the (reader-facing) article preview page with AI summary, comments, basic reading layout — full reader styling lands in Subphase 5.
4. Wire the "force-regenerate summary" action that backend exposes for editors.
5. Surface AI degradation state (e.g., the `X-Degraded` indicator) in the editor UI so they know when a summary is fallback.

---

## 2. Scope of Work

### In scope
- **Editor portal:**
  - `/dashboard/editor/approvals` — submitted articles queue (filtered to editor's section).
  - `/dashboard/editor/approvals/:id` — article preview with approve / reject / publish controls.
  - Rejection modal with `reason` text area (required, ≤ 500 chars).
  - Placement controls panel: featured / trending / trail toggles + priority slider.
  - `/dashboard/editor/comments/pending` — comment moderation queue.
  - "Force regenerate AI summary" button (calls `POST /articles/:id/ai/summary`).
- **Admin portal:**
  - `/dashboard/admin/approvals` — platform-wide submitted backlog.
  - `/dashboard/admin/epapers` — list + new upload form.
  - `/dashboard/admin/epapers/new` — upload PDF + cover via existing `<MediaUploader>`.
  - Admin can unpublish any published article.
- **Article preview / read page (basic):**
  - `/article/:slug` — public route renders a read-only view for everyone, including the AI summary block, comments section, social share button (link copy).
  - This page will be **restyled and SEO-polished in Subphase 5**; this subphase delivers functional shell.
- **Components:**
  - `<ApprovalQueueRow>`, `<PlacementPanel>`, `<RejectModal>`, `<CommentRow>`, `<ModerationActions>`, `<AISummaryBlock>` (with degraded badge if applicable), `<CommentThread>`.
- **Notifications shell:**
  - In-app notification bell in dashboard header reading from `/v1/notifications` — list page can be a minimum viable list; full polish in Subphase 5.

### Out of scope
- Reader auth flows beyond what Subphase 2 shipped.
- Bookmarks page, public homepage, e-paper viewer for readers → Subphase 5.
- Full notification UX (filters, mark all read) → Subphase 5.
- PDF download button on article page → Subphase 5.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Articles endpoints (approve/reject/publish/placement/AI summary/AI TTS) | [`05-api-documentation.md`](../../05-api-documentation.md) §5.5 |
| Comments moderation API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.6 |
| E-paper upload API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.11 |
| Notifications API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.9 |
| Article lifecycle states | [`07-workflows.md`](../../07-workflows.md) §7.1 |
| Comment moderation flow | [`07-workflows.md`](../../07-workflows.md) §7.2 |
| AI pipeline (informational) | [`07-workflows.md`](../../07-workflows.md) §7.7 |
| Editor features | [`13-feature-documentation.md`](../../13-feature-documentation.md) (Editor section) |
| Article body XSS rule (DOMPurify) | [`10-security.md`](../../10-security.md) §10.1 |

---

## 4. Expected Implementation Direction

### Approval queue UX

- Table with: title, author, organisation, category, submittedAt, status.
- Row click → preview page.
- Tabs: All / My section / Other sections (admin sees all).
- Filters: category, dateRange.
- Empty state: "Inbox zero — no submissions waiting for review."

### Article preview page (editor view)

Renders the article almost identically to the reader view, plus:
- Toolbar at top: **Approve** / **Reject** / **Edit (back to draft)** / **Publish** (after approve).
- `<PlacementPanel>` (collapsed by default) shows featured / trending / trail / priority.
- AI summary block — if `article.ai.summary` exists, show it with a "regenerate" button. If summary was returned with `X-Degraded`, show a subtle badge "Fallback summary — regenerate to retry".
- "View comments" section reuses the read view's component.

### Approve / Reject behavior

```ts
POST /v1/articles/:id/approve   → 200 → toast → refresh
POST /v1/articles/:id/reject    → modal → POST { reason } → 200 → toast → list view
POST /v1/articles/:id/publish   → enabled only when status=approved → toast → refresh
PATCH /v1/articles/:id/placement → debounce 500ms after toggle → 200 → silent
```

- Optimistic UI on placement toggle; rollback + toast on error.

### Comment moderation

`<CommentRow>`:
- Renders body, author, articleLink.
- Actions: Approve, Reject, Hide.
- Bulk action: select multiple → batch approve/reject (call backend serially; show inline progress).

### Force-regenerate AI summary

```ts
POST /v1/articles/:id/ai/summary
body: { force: true }
```

- Spinner inline.
- On `X-Degraded: true`, show a non-blocking warning toast: "AI service degraded — retried with fallback summary."
- On `503 AI_UNAVAILABLE`, toast: "AI service is unavailable. Try again in a minute."
- Refresh article data after.

### Rendering article body safely

Use **DOMPurify** in the renderer:

```ts
import DOMPurify from "dompurify";
function ArticleBody({ html }: { html: string }) {
  const clean = useMemo(() => DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }), [html]);
  return <article className="prose" dangerouslySetInnerHTML={{ __html: clean }} />;
}
```

Per [`docs/10-security.md`](../../10-security.md) §10.1 — even though backend sanitizes, defense-in-depth on render.

---

## 5. Dependencies

### Blocking
- Backend Subphase 4 ships: `approve`, `reject`, `publish`, `unpublish`, `placement`, comments moderation endpoints, `notifications` (in-app list), e-paper upload, `ai-proxy` orchestration (so approved articles get AI summary).
- Backend's `POST /v1/articles/:id/ai/summary?force=true` returns synchronously or queues.

### Soft
- AI service has real `/v1/summarize` (Subphase 3 deliverable) so summary blocks show real content.

### Provides for downstream
- Article preview & layout components → restyled and tuned in Subphase 5.
- Notification bell → expanded in Subphase 5.

---

## 6. Suggested Development Order

1. **Day 1** — Approval queue list (editor + admin variants); filters; empty + loading states.
2. **Day 2** — Article preview page shell (reads from `GET /v1/articles/:id` allowing draft/submitted/approved/published for authorized roles).
3. **Day 3** — Approve / Reject actions wired with modals + toasts.
4. **Day 4** — Publish action; admin unpublish.
5. **Day 5** — `<PlacementPanel>` with optimistic toggles + priority slider; debounced PATCH.
6. **Day 6** — `<AISummaryBlock>` with degraded badge; force-regenerate button.
7. **Day 7** — Article public preview at `/article/:slug` (functional only — Subphase 5 polishes).
8. **Day 8** — Comment moderation queue: list, filter (pending), single-row actions, bulk actions.
9. **Day 9** — Comments section on article page (read-only render of approved comments + post comment form).
10. **Day 10** — E-paper upload form (admin) — uses `<MediaUploader>` twice (PDF + cover).
11. **Day 11** — Notification bell + minimal list page (reads `/v1/notifications`).
12. **Day 12** — Manual end-to-end test: author submits → editor approves → AI summary visible → editor publishes → reader visits `/article/:slug`. Polish issues found.
13. **Day 13 — Integration Day** — Full demo run; verify `X-Degraded` UX with backend toggle.
14. **Day 14** — Exit review, tag `v0.4.0`.

---

## 7. Important Considerations

- **Stale data after actions.** After approve/reject/publish, invalidate the relevant TanStack Query keys (`["articles", id]`, `["approvals"]`, `["feed", "home"]` — even if home isn't built yet).
- **Optimistic UI cautions.** Placement toggles are safe to be optimistic; state transitions (approve, publish) are not — wait for backend confirmation before showing the new state.
- **Concurrency.** If an editor opens an article and another editor approves it first, the GET `/articles/:id` will eventually return `status=approved`. Display a banner if state changes from under the user; offer to reload.
- **AI degraded UX.** Don't shout; a subtle inline badge is enough. Editors should know the fallback summary is not BART output.
- **Editor role scoping.** Per `docs/05-api-documentation.md` §5.16, editors see their section's submissions; admins see all. Don't trust the FE filter; backend authoritatively filters.
- **Rate-limit.** AI endpoints capped at 20/min per user per `docs/05-api-documentation.md` §5.17. Surface 429 with retry countdown.
- **Markdown vs HTML in comments.** Comments are plain text (per `docs/04-database-design.md` §4.2.4). Don't render as HTML.
- **Sanitize article body** with DOMPurify on render (defense in depth).
- **AI summary cache.** Backend caches on the article doc; first view after approve is fast. Force-regenerate sends `force=true` and bypasses.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff | Lock approve/reject/publish/placement payload shapes and the `force=true` AI regenerate semantics. Confirm rejection-reason length. Confirm the X-Degraded header propagation through the backend response (does backend bubble it, or replace with `article.ai.degraded: true` field?). |
| **Backend** | Day 6 | Pair-debug the AI summary regeneration end-to-end. |
| **Backend** | Day 8 | Confirm comments moderation endpoints + the "bulk approve" expectation (FE will serialize calls; backend doesn't need bulk endpoint). |
| **Backend** | Integration Day | Full demo run. |
| **AI** | — | Indirect via backend. Confirm in kickoff that `X-Degraded` is correctly surfaced through to FE. |

---

## 9. Deliverables

- [ ] Editor portal: approval queue, article preview, approve/reject/publish actions, placement panel.
- [ ] Admin portal: full approval backlog, unpublish action, e-paper upload form.
- [ ] Public `/article/:slug` page (functional baseline — Subphase 5 will polish).
- [ ] AI summary block with degraded badge and force-regenerate button.
- [ ] Comment moderation queue with single-row + bulk actions.
- [ ] Comments section on article page (read approved + post comment).
- [ ] Notification bell in dashboard header + minimal notifications list page.
- [ ] DOMPurify in place for article body rendering.
- [ ] Toast mappings for all new backend error codes (`AI_UNAVAILABLE`, `INVALID_STATE`, `VERSION_CONFLICT`, etc.).
- [ ] Component tests: PlacementPanel, ApprovalRow, RejectModal, AISummaryBlock degraded state.

### Acceptance checklist
- Editor sees only their section's submissions (backend-filtered; FE filter convenience layer).
- Editor approves a submitted article; preview now shows AI summary; publish button enabled.
- Reject modal forces non-empty reason; success toast shown; article disappears from queue.
- Placement toggles persist after refresh.
- Admin can unpublish a published article; reader page returns 404 / "Article not available".
- Comment posted by reader appears in moderation queue; editor approves; comment now visible on article.
- E-paper upload uploads PDF + cover, creates issue; appears in admin list.
- Force-regenerate summary on a degraded article either shows real BART output or the "still degraded" badge.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Editor portal scope balloons | Time-box: keep placement panel minimal (toggles + priority slider). Anything else (scheduling, multi-edit) is Phase 2. |
| `X-Degraded` header lost in backend's axios → FE chain | Confirm with backend: backend should bubble it as `article.ai.degraded: true` field. Test by toggling `FORCE_FALLBACK=true` on AI service. |
| Optimistic UI on placement diverges from server state | Always reconcile on response; toast rollback if 4xx. |
| Comments under unpublished articles still visible to readers | Backend handles via the `articles.status !== 'published'` filter; FE just needs to render 404. |
| Editor approves an article while author is mid-edit (race) | Server returns `409 VERSION_CONFLICT`; FE shows friendly banner and reloads. |
| Notification list polling load | Poll every 60 s only when tab is visible (Page Visibility API); no socket in P1. |
| DOMPurify CDN dependency adds ~50 KB | Use `dompurify` npm package; tree-shake. |
| Approvals queue not paginated → big lists slow | Backend paginates; FE infinite-scrolls. |
