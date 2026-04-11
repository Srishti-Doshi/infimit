# 🚀 9. Phase-wise Development Plan

A pragmatic rollout designed to ship **something readable and publishable** within 8–10 weeks, then layer on intelligence and scale.

---

## 9.1 Phase 1 — MVP (Weeks 0–10)

**Goal:** A fully functional newspaper with end-to-end editorial workflow and a basic AI summary. Ready for a closed beta.

### Backend (monolith)
- [x] Project scaffold (TypeScript, Express, Mongoose, Zod, Pino)
- [x] Config & env validation, error handler, request logger
- [x] `auth` module: register, login, JWT, refresh, email verification, password reset
- [x] `users` module: profiles, editor CRUD (admin only)
- [x] `organisations` module: create, update, list
- [x] `articles` module: full state machine (draft → published), RBAC, placement
- [x] `comments` module: post + manual moderation
- [x] `media` module: pre-signed S3 uploads
- [x] `analytics` module: raw event writer + basic article view counts
- [x] `notifications` module: in-app only (email stubs OK)
- [x] `epaper` module: upload + list + download
- [x] `ai-proxy` module (summarize only)
- [x] MongoDB indexes as per [DB Design](04-database-design.md)
- [x] Seed script: admin user, 2 editors, 5 categories

### AI service
- [x] FastAPI scaffold, Docker image
- [x] `/v1/summarize` endpoint (BART)
- [x] `/v1/healthz`, `/v1/readyz`
- [x] Internal key auth

### Frontend
- [x] Routing + layout + theme (light only in MVP)
- [x] Public pages: home, category, article, e-paper archive, search
- [x] Reader auth flows
- [x] Author portal: draft editor (Tiptap), submission dashboard
- [x] Editor portal: approval queue, moderation, placement controls
- [x] Admin portal: editor mgmt, organisation mgmt, e-paper upload, approval queue
- [x] Responsive design (mobile/tablet/desktop)
- [x] Article PDF download (server-generated)

### DevOps
- [x] docker-compose for local (Mongo + Redis + monolith + AI)
- [x] GitHub Actions: lint, test, build
- [x] Staging deployment on Render/Railway
- [x] Basic Sentry + Pino → stdout

### Exit criteria
- Authors can submit, editors can approve, admins can upload e-papers
- Readers can read, comment, bookmark
- AI summary appears on every published article
- Lighthouse score > 85 on article page

---

## 9.2 Phase 2 — Core Scaling (Weeks 10–20)

**Goal:** Ready for public launch and organic growth. Reliability, performance, and richer editorial tools.

### Backend
- [ ] Full analytics pipeline: daily roll-ups, trending cron, author/editor dashboards
- [ ] BullMQ queue for background jobs (PDF, email, AI backfill)
- [ ] Email worker (SES) — newsletters, notifications, password reset
- [ ] Newsletter subscribe/unsubscribe + topic selection
- [ ] Events (calendar) module
- [ ] Ads module (full lifecycle, impressions, clicks, stats)
- [ ] Search upgrade: MongoDB Atlas Search or Qdrant for full-text
- [ ] Audit log collection
- [ ] Rate limit by role (stricter for anonymous)
- [ ] API versioning (`/v1`)

### AI service
- [ ] `/v1/keywords` — keyword extraction
- [ ] `/v1/recommend` — personalized recommendations
- [ ] `/v1/moderate` — comment toxicity
- [ ] Metrics endpoint + Prometheus scrape
- [ ] Model lazy-loading, graceful degradation

### Frontend
- [ ] Dark mode
- [ ] Smart recommendations on article page
- [ ] Bookmark folder & read-later
- [ ] Notification bell + in-app list
- [ ] Author / Editor / Admin dashboards with charts
- [ ] Newsletter signup modal
- [ ] PWA (offline shell, installable)

### DevOps
- [ ] Production deploy on AWS ECS or Render Pro
- [ ] Managed MongoDB Atlas
- [ ] Managed Redis (ElastiCache / Upstash)
- [ ] Blue/green deployment
- [ ] CloudFront + custom domain + TLS
- [ ] Grafana + Prometheus
- [ ] Daily DB backups

### Exit criteria
- 10K+ readers supported comfortably (load-tested)
- 99.5% uptime SLO
- p95 API latency < 300 ms
- Editors can self-serve everything; no SSH required for operations

---

## 9.3 Phase 3 — Advanced Features (Weeks 20+)

**Goal:** Differentiation via AI, multilingual reach, and community.

### Backend
- [ ] Multilingual articles (per-language slugs, translation pipeline)
- [ ] Threaded comments + reactions
- [ ] Author followers + personalized feed
- [ ] Organisation catalog (public directory)
- [ ] Paywall / subscriptions (optional)
- [ ] Webhooks for partner integrations

### AI service
- [ ] `/v1/tts` — text-to-speech audio generation
- [ ] `/v1/semantic-search` with Qdrant index
- [ ] `/v1/translate` — multilingual support
- [ ] `/v1/title-suggest`, `/v1/seo-optimize`
- [ ] `/v1/image-caption` for accessibility
- [ ] Move from local models to hosted LLMs (Claude, GPT-4o) where ROI is positive

### Frontend
- [ ] Play/pause TTS on article pages
- [ ] Language switcher
- [ ] Personalized "For You" feed
- [ ] Author profile pages with follow button
- [ ] Rich calendar view for events
- [ ] Native-app shell (Capacitor / React Native) — optional

### DevOps
- [ ] Multi-region read replicas
- [ ] Canary deployments
- [ ] On-call runbooks + SLOs
- [ ] Chaos engineering day

---

## 9.4 Cross-cutting Tracks (Always On)

| Track | Ongoing Work |
|-------|--------------|
| **Quality** | Unit test coverage > 70%, integration tests for every state transition |
| **Security** | Quarterly pen-test, dep-audit on every PR, rotate secrets every 90 days |
| **Docs** | This folder stays in sync with code — any PR adding a new endpoint updates `05-api-documentation.md` |
| **Design system** | Tokens, components, Storybook |
| **Observability** | Dashboards + alerts for every SLO |

---

## 9.5 Team Shape (Recommended)

| Role | Count (MVP) | Count (Phase 2) |
|------|-------------|------------------|
| Backend engineer (Node/TS) | 2 | 3 |
| Frontend engineer (React/TS) | 2 | 3 |
| ML/AI engineer (Python) | 1 | 1–2 |
| Product designer | 1 | 1 |
| Product manager | 0.5 | 1 |
| DevOps / SRE | 0.5 | 1 |
| QA | 0 | 1 |
