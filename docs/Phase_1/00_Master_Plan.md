# 🚀 Phase 1 — Master Execution Plan

**Project:** Infimit — AI-Powered Digital Newspaper Platform
**Phase Goal:** Ship a fully functional MVP (end-to-end editorial workflow + basic AI summary) ready for closed beta.
**Duration:** 8–10 weeks (5 sequential subphases, ~2 weeks each)
**Source of truth:** [`docs/01-PRD.md`](../01-PRD.md) → [`docs/13-feature-documentation.md`](../13-feature-documentation.md)

---

## 1. Team & Ownership

| Handler | Member(s) | Domain | Repo Subtree |
|---------|-----------|--------|---------------|
| Frontend Handler | **Srishti** | React + TS SPA (reader portal, all 4 role dashboards) | `frontend/` |
| Backend Handler | **You** (lead) | Node.js modular monolith — every business module | `backend/` |
| AI Service Handlers | **Zaman, Saloni** | FastAPI microservice — `/summarize` first, then more | `ai-service/` |

> **Single source of contracts:** [`docs/05-api-documentation.md`](../05-api-documentation.md) (REST) and [`docs/06-ai-service.md`](../06-ai-service.md) (AI internal). No handler renames or invents fields; changes flow via PR-on-the-contract-doc first.

---

## 2. Subphase Map

| # | Subphase | Weeks | Theme | Frontend Output | Backend Output | AI Output |
|---|----------|-------|-------|-----------------|----------------|-----------|
| 1 | **Foundations** | 1–2 | Scaffold all three services; no business logic yet. | App shell, design tokens, mock API layer | Express skeleton, env, logger, healthz, docker-compose | FastAPI scaffold, `/healthz`, `/readyz`, internal-key auth |
| 2 | **Identity & AI Contract Lock** | 3–4 | Users, roles, JWT. AI freezes `/v1/summarize` contract behind a stub. | Auth screens, role-aware routing, profile UI | `auth`, `users`, `organisations` modules, RBAC, seed | `/v1/summarize` Pydantic contract + deterministic stub, metrics middleware |
| 3 | **Content Engine** | 5–6 | Authors can draft, attach media, submit. AI ships real BART summary. | Tiptap editor, draft list, media upload, submission dashboard | `articles` (draft→submitted), `media` (presigned S3) | Real `/v1/summarize` with `facebook/bart-large-cnn`, LRU cache, 413 enforcement |
| 4 | **Editorial Workflow + AI Integration** | 7–8 | Editors approve/publish; comments live; AI pipeline fires on approve. | Editor + Admin portals, approval queues, placement controls | `articles` (approve/publish/reject/placement), `comments`, `notifications` (in-app), `epaper`, `ai-proxy` with opossum, Redis caches | `/v1/metrics`, hardened cache, Swagger, integration suite, latency SLO documented |
| 5 | **Reader Experience + Launch** | 9–10 | Public reader UX, PDF, basic analytics, staging deploy, Lighthouse ≥ 85. | Home/category/article/search/e-paper/bookmarks/notifications/PDF | Feeds, search (Mongo text), `bookmarks`, `analytics` (raw writer), PDF, CI/CD, staging | Multi-stage Docker, observability, runbook, load test, Phase 2 readiness |

Each subphase has its own folder with **three handler documents** (`Frontend_Handler_Documentation.md`, `Backend_Handler_Documentation.md`, `AI_Service_Handler_Documentation.md`).

---

## 3. Execution Flow

```
            ┌─────────────────────────── Phase 1 (Weeks 1–10) ────────────────────────────┐
            │                                                                              │
   ┌────────▼────────┐   ┌────────────────┐   ┌────────────────┐   ┌────────────────┐   ┌─▼──────────────┐
   │  Subphase 1     │──►│  Subphase 2    │──►│  Subphase 3    │──►│  Subphase 4    │──►│  Subphase 5    │
   │  Foundations    │   │  Identity      │   │  Content Engine│   │  Editorial+AI  │   │  Reader+Launch │
   └─────────────────┘   └────────────────┘   └────────────────┘   └────────────────┘   └────────────────┘
        scaffold              users               drafts                workflow            public UX
        no deps              JWT contract        media + AI            ai-proxy             PDF / staging
```

**Inside each subphase, the three handlers work in parallel** — coupling is minimized via:
1. **Frozen contracts** (REST endpoints, AI payloads, DB schemas) declared at the start of each subphase.
2. **Mock adapters** — FE mocks the API; BE mocks `ai-proxy`; AI runs against fake monolith integration tests.
3. **Integration windows** at the end of each subphase (last 2 days) when the three services wire up live.

---

## 4. Recommended Git Branching Strategy

**Style:** Trunk-based with short-lived feature branches (matches [`docs/11-devops.md`](../11-devops.md) §11.9).

```
main         ────●────●────●────●────  protected, auto-deploy → staging
                  ╲    ╲    ╲    ╲
develop  ────●────●────●────●────●──── integration branch (optional in P1; can be skipped if team < 6)
              ╲   ╲   ╲   ╲
feat/...     ●─●─●─●─●─●─●─●─●        per-handler feature branches (life < 5 days)
```

### Naming convention

| Prefix | Use | Example |
|--------|-----|---------|
| `feat/<handler>/<short>` | New feature | `feat/be/articles-state-machine` |
| `fix/<handler>/<short>` | Bug fix | `fix/fe/login-redirect-loop` |
| `chore/<handler>/<short>` | Tooling, config | `chore/ai/docker-multistage` |
| `docs/<short>` | Docs-only | `docs/subphase-3-update` |
| `contract/<area>` | Contract change (REST or AI) | `contract/articles-add-trail` |

### Rules

- Branch protection on `main`: PR required, 1 reviewer, all CI checks green.
- **Contract changes get a separate PR**, reviewed by **all three handlers** before any implementation PR depending on it can merge.
- Squash-merge to `main`; commit message must reference subphase and handler (e.g., `feat(be/sp3): article draft repository`).
- Rebase, never merge upstream into a feature branch.
- Tags: `v0.<subphase>.<patch>` per subphase exit (e.g., `v0.3.0` at end of Subphase 3).

---

## 5. Recommended Project-Level Folder Structure

Aligned with [`docs/12-folder-structure.md`](../12-folder-structure.md) §12.1 (monorepo).

```
infimit/
├── backend/                ← Node.js modular monolith (You)
├── ai-service/             ← FastAPI microservice (Zaman, Saloni)
├── frontend/               ← React + TS SPA (Srishti)
├── docs/
│   ├── 01-PRD.md … 13-feature-documentation.md
│   └── Phase_1/            ← This planning suite
│       ├── 00_Master_Plan.md
│       ├── Subphase_1_Foundations/
│       ├── Subphase_2_Identity/
│       ├── Subphase_3_Content_Engine/
│       ├── Subphase_4_Editorial_Workflow/
│       └── Subphase_5_Reader_Launch/
├── infra/                  ← Terraform / IaC (later in Phase 2)
├── .github/workflows/      ← CI per handler
├── docker-compose.yml      ← Local dev (mongo + redis + 3 services)
├── package.json            ← npm workspaces root
└── README.md
```

---

## 6. Documentation Organization Strategy

| Layer | What lives here | Owner |
|-------|------------------|-------|
| `docs/01-…-13-…` | **Authoritative specs** (PRD, architecture, contracts, DB, security). Frozen unless contract PR. | Tech lead |
| `docs/Phase_1/` | **Execution plan** — this folder. Subphase × handler. | Tech lead + handlers |
| `<service>/README.md` | How to run / test that service locally. | Handler of that service |
| `<service>/docs/` | Implementation-level notes (decision logs, runbooks). | Handler |
| `CHANGELOG.md` (root) | Subphase-completion summary, written at every tag. | Tech lead |

**Rule:** If a doc in `docs/01-…-13-…` is contradicted by reality, fix the doc first, then update code.

---

## 7. Communication Strategy

### Standing meetings

| Cadence | Meeting | Attendees | Purpose | Duration |
|---------|---------|-----------|---------|----------|
| Daily | Async standup (Slack/Discord thread) | All | What I did / what I'm doing / blockers | n/a |
| Weekly | Subphase sync | All | Demo progress, lock contracts, align on integration day | 45 min |
| End of subphase | Integration day | All | Live wire-up; exit-criteria review | half-day |
| Ad-hoc | Contract review | Affected handlers only | Approve REST/AI/DB contract changes | 30 min |

### Async channels (recommended)

- `#infimit-eng` — general
- `#infimit-frontend`, `#infimit-backend`, `#infimit-ai` — handler-specific
- `#infimit-contracts` — every API/AI/DB schema change discussion
- `#infimit-alerts` — CI failures, Sentry, deploy notifications (read-only bots)

### Decision log

A single `docs/decisions.md` (lightweight ADR) — one entry per architectural decision with date, context, decision, consequences. Update during integration days.

---

## 8. Recommended Sprint Workflow

**Subphase = 1 sprint = 2 weeks.**

```
Day 1        Day 2-7              Day 8-12              Day 13-14
─────────    ─────────────────    ─────────────────    ─────────────────
Kickoff   →  Parallel build    →  Internal QA per   →  Integration day
+ contract   (each handler        handler             (wire live, demo,
freeze       behind own mock)     + cross-review        write subphase
                                  PRs                   exit report)
```

### Per-sprint deliverables

- **Day 1 (Monday)**: Subphase kickoff meeting. Review the 3 handler docs, freeze contracts, list deliverables, agree on the demo script for the integration day.
- **Days 2–7**: Parallel implementation. Each handler ships against their mock adapter, with daily async standups.
- **Days 8–12**: Cross-handler PR review window. Implementation continues but breaking changes require contract PR.
- **Day 13**: Integration day. Live wire-up. Smoke tests. Fix-forward only.
- **Day 14**: Exit-criteria review, tag release (`v0.<n>.0`), write 1-page retro into `docs/decisions.md`.

### Definition of Done (per subphase)

1. All deliverables in the handler doc shipped to `main`.
2. CI green (lint + typecheck + unit + integration tests).
3. Integration smoke test passes against the live stack from `docker-compose up`.
4. Subphase tag created (`v0.<n>.0`).
5. Retro written.

---

## 9. Integration Planning Approach

### Three independence-preserving techniques

**A) Mock adapters during the sprint.**
- Frontend uses [MSW](https://mswjs.io/) (Mock Service Worker) with handlers generated from `docs/05-api-documentation.md`.
- Backend's `ai-proxy` has a `MOCK_AI=true` env switch that short-circuits to deterministic responses.
- AI service has a `tests/test_contract.py` that pretends to be the monolith.

**B) Contract-first development.**
- Every subphase begins with the contract PR landing in `main`.
- TypeScript types for REST contracts live in `backend/src/contracts/` and are **published as a path alias** consumed by the frontend (or generated via `openapi-typescript` if we author an OpenAPI doc).
- AI request/response schemas mirror `docs/06-ai-service.md` exactly in both Pydantic (AI) and Zod (backend `ai-proxy`).

**C) Integration days.**
- Day 13 of each subphase: drop the mocks, run the full `docker-compose up`, execute the demo script. Issues found go to a "fix-forward" PR list, never blocking the tag.

### What goes live each integration day

| Subphase | Live integration goal |
|----------|-----------------------|
| 1 | Three containers boot together; healthz green from all. Frontend renders shell with API ping. |
| 2 | Frontend can log in via real backend; backend creates real users; AI returns deterministic stub summary on `/v1/summarize`. |
| 3 | Author writes a draft in Tiptap, uploads cover via presigned URL, submits. Backend transitions state to `submitted`. AI service serves real BART summary on demand. |
| 4 | Editor approves → backend `ai-proxy` calls AI `/summarize` → article shows summary. Comment posted, moderated, displayed. Admin uploads e-paper. |
| 5 | Reader visits homepage → article → reads summary → bookmarks → downloads PDF. Staging deploy live behind URL. Lighthouse ≥ 85. |

---

## 10. Risk Management

### Top risks for Phase 1

| Risk | Likelihood | Impact | Owner | Mitigation |
|------|-----------|--------|-------|------------|
| AI model RAM > host limit on dev machines | High | Mid | AI handlers | Lazy-load, document RAM ceiling; provide CPU-only flag; pin model versions; cache to volume |
| Contract drift between FE expectations & BE responses | High | High | Tech lead | Contract PRs reviewed by all 3 handlers; codegen TS types where feasible; MSW handlers regenerated each subphase |
| Editor portal bigger than estimated (UI complexity) | Mid | High | Frontend | Subphase 4 budgeted with no other parallel work for FE; defer non-essential controls to P2 |
| BART summarization latency > 2s SLO | Mid | Mid | AI handlers | Establish baseline in Subphase 3; tune `max_length`, use `device_map=auto`; consider distilled BART; cache aggressively |
| Mongo indexes wrong → slow homepage | Mid | High | Backend | Build indexes per [`docs/04-database-design.md`](../04-database-design.md) §4.2 in Subphase 1 via migration script; cover-query tests |
| S3 presigned URL CORS / signature errors | High | Mid | Backend + Frontend | Wire S3 in Subphase 3 with a smoke test on integration day; document required CORS rules in `backend/README.md` |
| Circuit breaker (opossum) wrongly tripping under cold starts | Mid | Mid | Backend | Warm-up call at boot; tolerate 1 cold-start failure outside circuit count; staging soak test |
| Scope creep beyond Phase 1 MVP exit criteria | High | High | Tech lead | Strict gate at end of each subphase; out-of-scope work goes to Phase 2 backlog only |
| Single-developer modules (backend lead is one person) | High | High | Tech lead | Heaviest module (`articles`) scheduled across two subphases (3 & 4); FE & AI handlers cross-review backend PRs |

### Escalation path
1. Blocker discovered → flag in handler-specific Slack within 1 hour.
2. Cross-handler blocker → escalate to `#infimit-contracts`.
3. Architectural unknown → emergency contract review (max 24h turnaround).

---

## 11. Tech Stack Summary (Phase 1)

| Layer | Technology | Source |
|-------|-----------|--------|
| Frontend | React 18, TypeScript (strict), Vite, TailwindCSS, React Router v6, TanStack Query, Zustand, React Hook Form + Zod, Tiptap | [`docs/02-system-architecture.md`](../02-system-architecture.md) §2.3.1 |
| Backend | Node.js 20 LTS, Express 4, TypeScript (strict), Mongoose, Zod, Pino, jsonwebtoken, argon2, opossum, axios, ioredis, AWS SDK v3 (S3) | [`docs/02-system-architecture.md`](../02-system-architecture.md) §2.3.2 |
| AI Service | Python 3.11, FastAPI, Uvicorn, Pydantic v2, `transformers`, `torch` (CPU build OK for P1), `prometheus-client`, `structlog` | [`docs/02-system-architecture.md`](../02-system-architecture.md) §2.3.3, [`docs/06-ai-service.md`](../06-ai-service.md) |
| Data | MongoDB 6 (Atlas in staging), Redis 7, S3 / Cloudflare R2 | [`docs/04-database-design.md`](../04-database-design.md) |
| DevOps | Docker, docker-compose, GitHub Actions, Render/Railway (staging) | [`docs/11-devops.md`](../11-devops.md) |
| Observability | Pino → stdout, Sentry, basic Prometheus on AI service | [`docs/11-devops.md`](../11-devops.md) §11.7 |

---

## 12. Phase 1 Exit Criteria (from `docs/09-development-phases.md` §9.1)

- ✅ Authors can submit, editors can approve, admins can upload e-papers.
- ✅ Readers can read, comment, bookmark.
- ✅ AI summary appears on every published article.
- ✅ Lighthouse score > 85 on article page.
- ✅ All three services run from a single `docker compose up`.
- ✅ Staging deployment reachable from a public URL.
- ✅ Seed script populates an admin, 2 editors, 5 categories, 1 organisation, 3 demo articles.

---

## 13. Quick Reference — Where to Look

| Topic | Doc |
|-------|-----|
| Why this architecture | [`02-system-architecture.md`](../02-system-architecture.md) |
| Backend module surfaces | [`03-module-breakdown.md`](../03-module-breakdown.md) |
| Mongo schemas & indexes | [`04-database-design.md`](../04-database-design.md) |
| REST contracts | [`05-api-documentation.md`](../05-api-documentation.md) |
| AI internal contracts | [`06-ai-service.md`](../06-ai-service.md) |
| State machines | [`07-workflows.md`](../07-workflows.md) |
| MVP scope | [`09-development-phases.md`](../09-development-phases.md) §9.1 |
| Security policy | [`10-security.md`](../10-security.md) |
| Deployment + CI | [`11-devops.md`](../11-devops.md) |
| Folder layout | [`12-folder-structure.md`](../12-folder-structure.md) |
| Feature-level UX/back-end logic | [`13-feature-documentation.md`](../13-feature-documentation.md) |
