# Subphase 5 — Reader Experience + Launch · Frontend Handler

**Owner:** Srishti · **Duration:** Week 9–10 · **Tag at exit:** `v0.5.0` (≡ MVP)

> **Theme of this subphase:** Make the platform delightful for readers. Polish the public surface (home, category, article, search, e-paper archive). Ship bookmarks, in-app notifications, article PDF download, responsive layout. Hit Lighthouse ≥ 85 on the article page. Production-shape the build for staging deploy.

---

## 1. Objectives

1. Ship the reader-facing public surface: home (TRAIL + Featured + Latest + Trending), category page, article page (final polish), search results, e-paper archive + viewer.
2. Implement bookmarks: bookmark button on articles, bookmarks list page.
3. Finalize in-app notifications page + bell badge.
4. Wire the article PDF download button to `GET /v1/articles/:id/pdf`.
5. Hit Lighthouse ≥ 85 on the article page (Performance, Accessibility, Best Practices, SEO).
6. Production build optimizations: code splitting, image lazy load, font preload, asset hashing, gzip + brotli, route-level pre-rendering for top routes (or robust SSR-ready meta tags).
7. Make the build deployable to staging via the root CI pipeline.

---

## 2. Scope of Work

### In scope
- **Public pages (polish + ship):**
  - `/` — Home: `<TrailStrip>` (horizontal scroll), `<FeaturedBanner>` (hero with one article), `<LatestFeed>` (infinite scroll), `<TrendingList>` (top 5 + link to more).
  - `/category/:slug` — category landing with header + featured + recent + infinite scroll.
  - `/article/:slug` — final layout: headline, subtitle, author + organisation, publish date, reading time, AI summary block, embedded media, social share, comments, related articles strip (if backend exposes; else placeholder), **Download PDF** button.
  - `/search?q=...` — search results from `/v1/search?q=...`.
  - `/epaper` — e-paper archive (list issues by date).
  - `/epaper/:id` — issue detail; "Download PDF" button hitting `/v1/epapers/:id/download`.
  - `/about`, `/contact`, `/privacy`, `/terms` — static pages.
- **Reader features:**
  - Bookmark button on `<article>` (toggle, optimistic).
  - `/dashboard/me/bookmarks` — paginated bookmark list.
  - Notification bell badge with unread count; click → `/dashboard/me/notifications`.
- **Smart navbar filters** (per [`docs/13-feature-documentation.md`](../../13-feature-documentation.md) A1):
  - Date / Category / Location dropdowns; URL-synced; refetch on change.
- **Performance:**
  - Lazy-loaded route chunks (already partly done).
  - Image `loading="lazy"` + `decoding="async"` on all `<img>`.
  - Preload hero font.
  - `srcset` on cover images (if backend serves multiple sizes; otherwise document for Phase 2).
  - Disable React strict mode double-renders in production build.
  - Bundle analyzer audit; trim heaviest dependencies if > target.
- **SEO:**
  - Per-route `<title>`, `<meta name="description">`, OpenGraph tags via `react-helmet-async`.
  - Canonical URLs.
  - Article page emits JSON-LD `Article` schema.
- **Accessibility audit pass:**
  - All interactive controls keyboard-reachable.
  - Color contrast AA.
  - Skip-to-content link.
  - ARIA labels on icon-only buttons.

### Out of scope
- Dark mode → Phase 2 per `docs/09-development-phases.md` §9.2.
- Smart recommendations on article page → Phase 2.
- Text-to-speech playback → Phase 3.
- Author profile public pages (already covered by Subphase 2's profile endpoints; polish if time).
- Newsletter signup modal → Phase 2.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Reader feature inventory | [`13-feature-documentation.md`](../../13-feature-documentation.md) A1–A9 |
| Homepage sections (TRAIL, featured, latest, trending) | [`13-feature-documentation.md`](../../13-feature-documentation.md) A3 |
| Articles feeds endpoints | [`05-api-documentation.md`](../../05-api-documentation.md) §5.5 |
| Bookmarks API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.13 |
| Notifications API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.9 |
| E-paper API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.11 |
| Search API | [`05-api-documentation.md`](../../05-api-documentation.md) §5.14 |
| Performance SLO | [`01-PRD.md`](../../01-PRD.md) §1.5 |
| Exit criteria (Lighthouse ≥ 85) | [`09-development-phases.md`](../../09-development-phases.md) §9.1 |

---

## 4. Expected Implementation Direction

### Home page composition

```tsx
function Home() {
  const { data: feed } = useQuery({ queryKey: ["feed", "home"], queryFn: () => api.feeds.home() });
  return (
    <PublicLayout>
      <TrailStrip items={feed.trail} />
      <FeaturedBanner article={feed.featured} />
      <SmartNavbarFilters />
      <LatestFeed initial={feed.latest} />
      <TrendingList items={feed.trending} />
    </PublicLayout>
  );
}
```

- Server returns one composite payload at `/v1/articles/feed/home` (TanStack Query caches 60 s, matching backend Redis TTL).

### Article page render

```tsx
function ArticlePage() {
  const { slug } = useParams();
  const { data: article } = useQuery({ queryKey: ["article", slug], queryFn: () => api.articles.bySlug(slug) });
  return (
    <PublicLayout>
      <ArticleHeader article={article} />
      <AISummaryBlock summary={article.ai.summary} degraded={article.ai.degraded} />
      <ArticleBody html={article.body} />
      <SocialShare slug={slug} title={article.title} />
      <DownloadPdfButton id={article.id} />
      <CommentsSection articleId={article.id} />
    </PublicLayout>
  );
}
```

### PDF download

```ts
function DownloadPdfButton({ id }: { id: string }) {
  const onClick = () => window.open(`/v1/articles/${id}/pdf`, "_blank");
  return <button onClick={onClick}>Download newspaper PDF</button>;
}
```

The endpoint streams a PDF — browser handles download via Content-Disposition.

### Bookmark button

```tsx
const { isBookmarked, toggle } = useBookmark(articleId);
<button onClick={toggle} aria-pressed={isBookmarked}>{isBookmarked ? "★ Saved" : "☆ Save"}</button>
```

Optimistic update; rollback toast on failure.

### Smart navbar filters

```ts
const [params, setParams] = useSearchParams();
const date = params.get("date") ?? "all";
const cat = params.get("category") ?? "all";
const loc = params.get("location") ?? "all";
// changes call setParams + refetch ["feed", "home", { date, cat, loc }]
```

### Lighthouse target plan

| Metric | Target | Tactic |
|--------|--------|--------|
| Performance | ≥ 85 | Code splitting, lazy images, preload font, gzip, image optimization |
| Accessibility | ≥ 95 | Semantic landmarks, ARIA, contrast |
| Best Practices | ≥ 95 | HTTPS in staging, no console.error, CSP-safe inline styles |
| SEO | ≥ 95 | Meta tags, canonical, structured data, robots-friendly |

### JSON-LD on article page

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "...",
  "datePublished": "...",
  "author": { "@type": "Person", "name": "..." },
  "publisher": { "@type": "Organization", "name": "Infimit" },
  "image": "...",
  "description": "<aiSummary>"
}
</script>
```

---

## 5. Dependencies

### Blocking
- Backend Subphase 5 ships: `feed/home`, `feed/trending`, search, bookmarks, analytics tracker (FE will emit events), PDF endpoint.

### Soft
- Backend cache hit on `feed/home` keeping home fast.

### Provides for downstream
- Deployable production build → staging.
- Lighthouse pass → MVP exit criteria.

---

## 6. Suggested Development Order

1. **Day 1** — Home page composition; `<TrailStrip>` and `<FeaturedBanner>`.
2. **Day 2** — `<LatestFeed>` with infinite scroll; `<TrendingList>`.
3. **Day 3** — Smart navbar filters (date/category/location) URL-synced.
4. **Day 4** — Category page reusing feed components with filter applied.
5. **Day 5** — Article page polish: typography, AI summary block, social share, related strip placeholder, comments section integration.
6. **Day 6** — PDF download button and JSON-LD; SEO meta tags via `react-helmet-async`.
7. **Day 7** — Bookmark button + bookmarks list page.
8. **Day 8** — Search results page.
9. **Day 9** — E-paper archive + issue detail; download via presigned URL.
10. **Day 10** — Notifications list page + bell badge polish.
11. **Day 11** — Performance audit: bundle analyzer, lazy image scan, font preload, run Lighthouse locally. Iterate.
12. **Day 12** — Accessibility audit; fix issues until ≥ 95.
13. **Day 13 — Integration Day** — Full staging deploy via root CI. Manual smoke against staging URL. Final Lighthouse run.
14. **Day 14** — Exit review, tag `v0.5.0`. MVP shipped.

---

## 7. Important Considerations

- **Backend feed payload shape.** Confirm in kickoff what `/v1/articles/feed/home` returns — `{ trail, featured, latest, trending }` vs separate endpoints. Either is fine; pick one with backend and stick.
- **Image dimensions.** Backend stores `dimensions: {width, height}` on media docs — pass to `<img>` to prevent CLS.
- **Comments section.** Already built Subphase 4; integrate into the final article page layout.
- **AI summary fallback.** If `article.ai.degraded` is true, render the summary but with subtle "Auto-summary unavailable" inline note (don't show the model name to readers).
- **PDF download trust.** Backend generates PDF; just open in new tab. Filename comes via `Content-Disposition`.
- **Analytics tracking.** Emit `view` event on article page mount (1 s debounce — don't fire if user navigates away immediately). Emit `read_complete` on 90% scroll or 2-min dwell per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.7.
- **Robots.txt + sitemap.** Sitemap is backend; FE serves `robots.txt` from `public/`.
- **Don't fetch `/auth/me` on public pages.** Conditional: only when an access token is in memory.
- **Cookies for refresh.** Public pages don't need refresh; only fire when user logs in.
- **CDN/headers in production.** That's nginx config in the Dockerfile (gzip + brotli + long cache headers per [`docs/11-devops.md`](../../11-devops.md) §11.4).

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff | Lock `feed/home` payload shape. Confirm PDF endpoint behavior + Content-Disposition. Confirm `/v1/analytics/track` accepts FE-emitted events. Confirm bookmark endpoint contract. |
| **Backend** | Day 11 | Coordinate Lighthouse run with staging build of backend — ensures we hit cached endpoints. |
| **Backend** | Integration Day | Joint Lighthouse run on staging. |
| **AI** | — | Indirect; AI is consumed via backend. |

---

## 9. Deliverables

- [ ] Home page with TRAIL + Featured + Latest + Trending.
- [ ] Category page with smart filters.
- [ ] Article page (final layout) with AI summary, social share, PDF download, comments.
- [ ] Search results page.
- [ ] E-paper archive + issue detail + download.
- [ ] Bookmarks button + list page.
- [ ] Notifications list page + bell badge.
- [ ] Static pages: About, Contact, Privacy, Terms.
- [ ] Per-route SEO meta tags + JSON-LD on articles.
- [ ] Analytics events emitted (`view`, `read_complete`, `bookmark`, `share`).
- [ ] Lighthouse ≥ 85 on article page (Performance) and ≥ 95 on Accessibility / Best Practices / SEO.
- [ ] Frontend Docker image building, deployed to staging via CI.

### Acceptance checklist
- Anonymous reader visits home → sees trail + featured + latest in < 2.5 s (LCP).
- Click an article → reads with AI summary visible, downloads PDF.
- Logs in as reader → bookmark button works, bookmarks list page shows it.
- Logs in as reader → notifications bell shows unread count; list page marks read.
- Search "education" returns published articles.
- Lighthouse Performance ≥ 85 on `/article/<slug>` in production build.
- Staging URL reachable; smoke script passes.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Lighthouse Performance < 85 due to large images | Document a fallback: backend serves a smaller cover via `?w=800` query if it can; else FE compresses on upload (Phase 2). For MVP, hand-curate sample images < 200 KB. |
| Bundle size > 250 KB initial | Bundle analyzer; lazy-load Tiptap (only used in author/editor paths); lazy-load DOMPurify; check icon library tree-shaking. |
| Mongo text search returns slow on staging | Backend caches popular queries; FE shows a skeleton spinner > 300 ms. |
| Bookmark optimistic UI rolls back too late | Pre-validate (require auth); intercept 401 → redirect to login with `?next=`. |
| Comments load delaying article paint | Defer comments query (after main paint) using `enabled` flag. |
| PDF download takes > 10 s for long articles | Backend's PDF gen target is < 5 s per article; if slow, show toast "Preparing your PDF…". Phase 2 may queue this. |
| JSON-LD breaks layout / wrong schema | Validate with Google's Rich Results test. |
| Staging deploy permissions issue | Coordinate with backend handler on the CI deploy step; tech lead approves. |
