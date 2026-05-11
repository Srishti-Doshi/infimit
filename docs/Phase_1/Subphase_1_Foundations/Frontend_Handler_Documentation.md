# Subphase 1 — Foundations · Frontend Handler

**Owner:** Srishti · **Duration:** Week 1–2 · **Tag at exit:** `v0.1.0`

> **Theme of this subphase:** Scaffold the React SPA shell. No business logic, no real API calls. The goal is a deployable, well-typed, well-styled empty house that the next 4 subphases will furnish.

---

## 1. Objectives

1. Stand up a production-grade Vite + React + TypeScript codebase with strict mode.
2. Establish the design system foundation (tokens, base components, theme).
3. Wire a routing skeleton covering every top-level route declared in the PRD.
4. Provide a typed API client + a mock-server adapter so all subsequent UI work is unblocked from backend availability.
5. Deliver `docker-compose`-runnable container that serves the SPA on `localhost:5173`.

---

## 2. Scope of Work

### In scope
- Vite + React 18 + TypeScript (strict) project bootstrap.
- TailwindCSS configured with design tokens (colors, spacing, typography per design references).
- React Router v6 layout with lazy-loaded route chunks. All routes can render a placeholder page.
- TanStack Query setup with a single `QueryClientProvider`.
- Zustand store boilerplate (one slice as example).
- React Hook Form + Zod resolver demo on a placeholder form.
- Typed `apiClient` (axios) with request/response interceptors.
- MSW (Mock Service Worker) running in dev with handlers stubbed for every endpoint in [`docs/05-api-documentation.md`](../../05-api-documentation.md). Stubs return `{ success: true, data: <fixture> }`.
- Layout shell: `<AppLayout>` with `Header`, `Footer`, `Navbar`, `Sidebar` (empty drawers).
- Theme provider (light only per `docs/09-development-phases.md` §9.1 — dark is Phase 2).
- Error boundary + global toast system.
- ESLint, Prettier, TS path aliases, husky pre-commit (typecheck + lint).

### Out of scope (later subphases)
- Any real auth, login screens, role-based guards → Subphase 2.
- Tiptap editor, media upload UI → Subphase 3.
- Public reader pages with real data → Subphase 5.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Tech stack rationale | [`02-system-architecture.md`](../../02-system-architecture.md) §2.3.1 |
| Folder structure | [`12-folder-structure.md`](../../12-folder-structure.md) §12.4 |
| Routes & RBAC matrix | [`05-api-documentation.md`](../../05-api-documentation.md) §5.16 |
| Feature inventory | [`13-feature-documentation.md`](../../13-feature-documentation.md) |
| Performance targets | [`01-PRD.md`](../../01-PRD.md) §1.5 (LCP < 2.5 s) |

---

## 4. Expected Implementation Direction

### Folder layout (target by end of subphase)

Per [`docs/12-folder-structure.md`](../../12-folder-structure.md) §12.4:

```
frontend/
├── public/
│   ├── favicon.svg
│   └── robots.txt
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx
│   ├── pages/
│   │   ├── public/        ← placeholder pages
│   │   ├── auth/          ← placeholder pages
│   │   ├── reader/
│   │   ├── author/
│   │   ├── editor/
│   │   └── admin/
│   ├── layouts/
│   │   ├── PublicLayout.tsx
│   │   └── DashboardLayout.tsx
│   ├── components/
│   │   ├── ui/            ← Button, Input, Card, Modal, Toast
│   │   └── nav/           ← Header, Footer, Navbar
│   ├── hooks/
│   ├── lib/
│   │   ├── api.ts         ← typed axios client
│   │   ├── queryClient.ts ← TanStack Query
│   │   └── env.ts         ← Vite env validation (Zod)
│   ├── store/             ← Zustand slices
│   ├── styles/
│   │   ├── tokens.css
│   │   └── tailwind.css
│   ├── mocks/             ← MSW handlers + fixtures
│   └── types/             ← shared TS types (mirror REST contracts)
├── index.html
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.ts
├── package.json
├── Dockerfile             ← multi-stage; nginx serves dist
└── README.md
```

### Routes to register (placeholders OK)

| Path | Layout | Role | Status this subphase |
|------|--------|------|----------------------|
| `/` | Public | 🌍 | Placeholder home |
| `/category/:slug` | Public | 🌍 | Placeholder |
| `/article/:slug` | Public | 🌍 | Placeholder |
| `/search` | Public | 🌍 | Placeholder |
| `/epaper` | Public | 🌍 | Placeholder |
| `/auth/login`, `/auth/register`, `/auth/forgot-password` | Public | 🌍 | Placeholder forms |
| `/dashboard/reader/*` | Dashboard | 👤 | Stub |
| `/dashboard/author/*` | Dashboard | ✍️ | Stub |
| `/dashboard/editor/*` | Dashboard | 📝 | Stub |
| `/dashboard/admin/*` | Dashboard | 👑 | Stub |
| `*` (404) | Public | 🌍 | NotFound page |

### Mock server convention

- `src/mocks/handlers.ts` registers one handler per endpoint table row in [`docs/05-api-documentation.md`](../../05-api-documentation.md).
- Fixtures in `src/mocks/fixtures/` (one JSON per resource).
- Switch via `VITE_USE_MOCK=true`. Default to `true` for `npm run dev`.

### Type-safety strategy

- Mirror the response envelope from [`02-system-architecture.md`](../../02-system-architecture.md) §2.5:
  ```ts
  export type ApiResponse<T> = { success: true; data: T; meta?: PageMeta };
  export type ApiError = { success: false; error: { code: string; message: string; details?: unknown } };
  ```
- Each resource gets a type file (`types/article.ts`, `types/user.ts`, …) populated from `docs/04-database-design.md`.

---

## 5. Dependencies

### Blocking (must exist before you can start)
- None. This is the first subphase; you bootstrap from an empty `frontend/` directory.

### Soft (helpful but not blocking)
- Final design tokens / Figma reference — if not available, derive a minimal palette and document it in `frontend/docs/design-tokens.md`. The design can be refined in later subphases.

### Provides for downstream
- MSW handlers + fixture types → consumed by **all future frontend work**.
- `apiClient` wrapper → consumed by every page.
- The TypeScript contract types → reused as the foundation for live API typing in Subphase 2.

---

## 6. Suggested Development Order

1. **Day 1** — Vite + React + TS init, repo hygiene (ESLint, Prettier, husky, tsconfig strict, path aliases).
2. **Day 2** — Tailwind + design tokens + base UI components (Button, Input, Card, Modal, Toast).
3. **Day 3** — Layout shell (PublicLayout, DashboardLayout) + Header/Footer/Navbar placeholders.
4. **Day 4** — React Router setup with lazy-loaded placeholder pages for every route in the table above.
5. **Day 5** — `apiClient` axios wrapper, TanStack Query provider, env validation via Zod.
6. **Day 6** — MSW handlers + fixtures for every endpoint in [`docs/05-api-documentation.md`](../../05-api-documentation.md). Verify one demo page fetches mocked data successfully.
7. **Day 7** — Zustand boilerplate, error boundary, global toast, 404 page.
8. **Day 8–9** — Dockerfile (multi-stage with `nginx:alpine`), wire into root `docker-compose.yml`.
9. **Day 10** — Storybook setup for UI components (optional but recommended).
10. **Day 11–12** — Polish, tests for `apiClient` and one component, README.
11. **Day 13 — Integration Day** — Boot via `docker compose up`. SPA reachable on `:5173`. Healthz from BE pings successfully via the real client.
12. **Day 14** — Exit review, tag `v0.1.0`.

---

## 7. Important Considerations

- **Strict TypeScript.** `noImplicitAny`, `strictNullChecks`, `noUncheckedIndexedAccess`. Don't relax later — it gets harder.
- **No `dangerouslySetInnerHTML` anywhere yet.** When article body rendering arrives (Subphase 5), it must go through DOMPurify per [`docs/10-security.md`](../../10-security.md) §10.1.
- **No business logic in components.** Components render; hooks orchestrate; lib code talks to API. Keep this discipline from day 1.
- **Tailwind utility-first**, but build reusable primitives (`<Button variant="primary">`) — don't paste utility soups across pages.
- **Asset loading.** Use Vite's static asset pipeline; never reference raw paths. Public icons in `public/`.
- **CORS.** Local dev backend will run on `:4000`. Vite proxy config should forward `/api/*` to it once MSW is disabled.
- **Accessibility from day 1.** Semantic landmarks (`<header>`, `<main>`, `<nav>`, `<footer>`). Focus rings preserved. Color contrast ≥ AA.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff (Day 1) | Confirm response envelope structure (`{ success, data, meta }`) is final. Confirm dev port (4000). Confirm CORS allowed origin will include `http://localhost:5173`. |
| **Backend** | Day 6 | Share the MSW handler list — confirm every endpoint in the contract is covered; flag any discrepancy. |
| **Backend + AI** | Integration Day | Live `docker compose up`: verify CORS, healthz, and that the SPA shell loads. |
| **AI** | — | No direct communication needed this subphase. AI service is not yet called by FE. |

---

## 9. Deliverables

- [ ] Vite + React + TS app booting via `npm run dev` and `docker compose up`.
- [ ] All routes from §4 table registered with placeholder pages.
- [ ] Tailwind + design tokens applied; light theme working.
- [ ] `apiClient` wrapping axios with interceptors + typed response envelope.
- [ ] MSW handlers covering every endpoint in `docs/05-api-documentation.md`.
- [ ] Layout shell with Header/Footer/Navbar placeholders.
- [ ] Error boundary, toast system, 404 page.
- [ ] Dockerfile (multi-stage) wired into root `docker-compose.yml`.
- [ ] ESLint, Prettier, husky pre-commit running.
- [ ] `frontend/README.md` documenting how to run locally, env vars, mocking switch.
- [ ] Storybook (optional) booting via `npm run storybook` with at least 3 components catalogued.

### Acceptance checklist
- `npm run typecheck` → 0 errors.
- `npm run build` → `dist/` builds in < 30 s.
- `docker compose up` → SPA serves on `http://localhost:5173`.
- Visiting `/` renders the layout shell (Header + Footer visible).
- Visiting `/api-demo` (or any test route) fetches a fixture via MSW and renders.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Design tokens not finalized | Ship a minimal token set and document under `frontend/docs/design-tokens.md`. Iterate in later subphases. |
| MSW + Vite interaction quirks (SW registration, dev vs build) | Follow MSW + Vite official guide; commit a working POC on Day 1 before building handlers. |
| Tailwind PurgeCSS removing dynamic classes | Use `safelist` config + recipe pattern (no dynamic string interpolation in className). |
| Storybook adding bundle bloat | Keep Storybook as a separate dev-only entry; do not import into the main bundle. |
| Over-engineering the design system | Cap component count this subphase at: Button, Input, Card, Modal, Toast, Badge, Spinner. Anything else is YAGNI for now. |
