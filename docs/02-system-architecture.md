# 🏗️ 2. System Architecture Document

## 2.1 Architectural Style

Infimit uses a **Modular Monolith** for the main backend and a **separate FastAPI AI microservice** for all machine-learning workloads. This gives us the simplicity of a single deployable unit for business logic while isolating the heavy, Python-native AI stack.

**Why modular monolith:**
- One codebase, one deploy, one database connection pool → faster iteration in early stages.
- Clear module boundaries (each with its own `routes`, `services`, `models`, `validators`) allow extraction into microservices later without a rewrite.
- Transactional consistency for tightly-coupled operations (e.g., article + media + analytics event).

**Why a separate AI service:**
- Python has the best ML ecosystem (transformers, spaCy, sentence-transformers, TTS).
- Heavy CPU/GPU work must not block Node's event loop.
- The AI service can scale independently (e.g., 2× replicas during publishing hours).

---

## 2.2 High-Level Architecture Diagram (Textual)

```
                                   ┌─────────────────────────┐
                                   │      End Users          │
                                   │ (Readers/Editors/Admin) │
                                   └──────────┬──────────────┘
                                              │ HTTPS
                                              ▼
                                   ┌─────────────────────────┐
                                   │   CDN (CloudFront /     │
                                   │   Cloudflare)           │
                                   └──────────┬──────────────┘
                                              │
                                              ▼
                                   ┌─────────────────────────┐
                                   │ React + TS Frontend     │
                                   │  (Vite SPA, SSR-ready)  │
                                   └──────────┬──────────────┘
                                              │  REST / JSON
                                              ▼
                                   ┌─────────────────────────┐
                                   │   API Gateway / LB      │
                                   │   (Nginx / ALB)         │
                                   └──────────┬──────────────┘
                                              │
            ┌─────────────────────────────────┼───────────────────────────────────┐
            │                                 │                                   │
            ▼                                 ▼                                   ▼
 ┌─────────────────────┐         ┌────────────────────────┐         ┌────────────────────────┐
 │ Node.js Modular     │  REST   │  FastAPI AI Service    │         │  Static Asset Server    │
 │ Monolith (Express+  │◄───────►│  (Python 3.11)         │         │  (Images, PDFs, ePapers)│
 │  TypeScript)        │         │  summarization, reco,  │         │  → S3 / R2             │
 │                     │         │  TTS, semantic search  │         └────────────────────────┘
 │ Modules:            │         └──────────┬─────────────┘
 │ Auth · Users ·      │                    │
 │ Articles · Comments │                    ▼
 │ Media · Analytics · │         ┌────────────────────────┐
 │ Notifications ·     │         │ Vector Store (optional)│
 │ Ads · ePaper        │         │ FAISS / Qdrant         │
 └──────────┬──────────┘         └────────────────────────┘
            │
   ┌────────┼─────────┬──────────────┐
   ▼        ▼         ▼              ▼
┌──────┐ ┌──────┐ ┌────────┐  ┌────────────┐
│Mongo │ │Redis │ │S3/R2   │  │Email/SMS   │
│      │ │cache │ │storage │  │(SES/Twilio)│
└──────┘ └──────┘ └────────┘  └────────────┘
```

---

## 2.3 Component Breakdown

### 2.3.1 Frontend

- **Framework:** React 18 + TypeScript, built with Vite
- **Styling:** TailwindCSS + custom design tokens, dark mode via CSS variables
- **State:**
  - Server state: **React Query / TanStack Query**
  - UI state: **Zustand** (lightweight) or Redux Toolkit
- **Routing:** React Router v6 with lazy-loaded route chunks
- **Forms:** React Hook Form + Zod validation
- **Editor (Editor/Admin panel):** Tiptap or Slate.js rich-text editor
- **Auth:** Access token in memory, refresh token in httpOnly cookie
- **SEO:** SSR or pre-render per article route (Next.js optional upgrade path)
- **Responsibilities:**
  - Rendering all UI for all 4 roles
  - Handling auth flows and token refresh
  - Client-side caching via React Query
  - Uploading media via pre-signed URLs
  - Triggering AI endpoints on demand

### 2.3.2 Backend — Modular Monolith

- **Runtime:** Node.js 20 LTS
- **Framework:** Express 4 + TypeScript (strict mode)
- **ORM:** Mongoose for MongoDB
- **Validation:** Zod at every route boundary
- **Logger:** Pino (structured JSON logs)
- **Config:** dotenv + central `config/env.ts` with Zod schema
- **Modules** (see [Module Breakdown](03-module-breakdown.md)):
  - `auth`, `users`, `articles`, `comments`, `media`, `analytics`, `notifications`, `ads`, `epaper`, `organisations`, `events`, `search`, `ai-proxy`
- **Cross-cutting:**
  - Middleware: `authGuard`, `roleGuard`, `rateLimit`, `errorHandler`, `requestLogger`
  - Shared utils: `jwt`, `hash`, `pagination`, `slugify`, `apiError`
- **Responsibilities:**
  - All domain business logic
  - RBAC enforcement
  - Persisting to MongoDB, caching in Redis
  - Proxying AI requests to the FastAPI service
  - Generating PDFs (via Puppeteer worker or pdfkit)

### 2.3.3 AI Microservice

- **Framework:** FastAPI + Uvicorn (Python 3.11)
- **Responsibilities:**
  - `/summarize` — abstractive article summaries
  - `/recommend` — personalized article recommendations
  - `/tts` — text-to-speech audio generation
  - `/semantic-search` — embedding-based retrieval
  - `/moderate` — comment toxicity classification
  - `/keywords` — keyword & tag extraction for new articles
- **Models:** Hugging Face Transformers (BART, MiniLM, etc.), or hosted LLM APIs
- **Communication:** REST only. The Node monolith is the **only** client.
- **Data access:** No direct DB access. Receives all needed data in the request payload from the monolith.

### 2.3.4 Databases

- **MongoDB (primary):**
  - Stores all durable data: users, articles, comments, analytics events, ads, e-papers metadata
  - Replica set in production (3 nodes)
- **Redis (cache + ephemeral):**
  - Session blocklist (revoked JWT IDs)
  - Hot caches: homepage feed, trending list, article by slug
  - Rate limiting counters
  - Pub/sub for notification fan-out
- **Object storage (S3/R2):**
  - Article images, videos, author avatars, e-paper PDFs, TTS audio files
  - Pre-signed URLs issued by the `media` module

### 2.3.5 External Services

- **Email:** AWS SES / SendGrid (transactional + newsletters)
- **SMS / Push:** Twilio / Firebase Cloud Messaging (future)
- **CDN:** CloudFront / Cloudflare (static assets + edge caching)
- **Error tracking:** Sentry
- **Observability:** Prometheus + Grafana, OpenTelemetry traces

---

## 2.4 Data Flow Diagrams

### 2.4.1 Reader loads the homepage

```
Browser ──GET /──► CDN ─miss─► Frontend SPA ─GET /api/feed/home─► Express
                                                                    │
                                                         cache hit? │
                                                                    ├── yes ──► Redis ──► 200 JSON
                                                                    └── no ──► Mongo (aggregation)
                                                                                     │
                                                                                     ▼
                                                                              Warm Redis (TTL 60s)
                                                                                     │
                                                                                     ▼
                                                                                   200 JSON
```

### 2.4.2 Editor publishes an article

```
Editor ─POST /api/articles─► Express (authGuard+roleGuard)
                                   │
                                   ▼
                          Validate (Zod) → Mongo insert (status=draft)
                                   │
                                   ▼
                         Proxy to AI service POST /summarize + /keywords
                                   │
                                   ▼
                        Update article with summary, tags, AI metadata
                                   │
                                   ▼
                         Invalidate Redis caches (home, trending, author)
                                   │
                                   ▼
                          Return 201 { article }
```

### 2.4.3 Reader reads an article (with analytics + AI summary)

```
Browser ─GET /api/articles/:slug─► Express
                                      │
                                      ├─► Redis GET article:slug  (hit → return)
                                      │
                                      └─► Mongo findOne + populate author/org
                                             │
                                             ▼
                                      Write to Redis (TTL 5 min)
                                             │
                                             ▼
                                     Fire-and-forget: analytics.trackView()
                                             │
                                             ▼
                                          200 JSON
```

### 2.4.4 Admin approves a submitted article

```
Admin ─PATCH /api/articles/:id/approve─► Express
                                            │
                                            ▼
                                     roleGuard('admin')
                                            │
                                            ▼
                          Mongo update status: submitted → approved
                                            │
                                            ▼
                       Emit notification to author + publish websocket
                                            │
                                            ▼
                               Invalidate home/feed caches
                                            │
                                            ▼
                                        200 JSON
```

---

## 2.5 Request Lifecycle (Canonical)

Every incoming request to the monolith follows this pipeline:

1. **TLS termination** at load balancer → HTTP forwarded to Node.
2. **`requestLogger`** — assigns `requestId`, logs method/url.
3. **`rateLimiter`** — Redis-backed sliding window (per IP + per user).
4. **`corsMiddleware`** — allowed origins from config.
5. **`bodyParser`** — JSON with 1 MB limit (10 MB for media routes).
6. **Router** — routes to the correct module.
7. **`authGuard`** — validates JWT, attaches `req.user`.
8. **`roleGuard(['editor'])`** — checks role membership.
9. **Validator** — Zod schema parse; rejects with 422 on failure.
10. **Controller** — thin handler, delegates to service.
11. **Service** — business logic, DB + cache + AI proxy calls.
12. **Response serializer** — strips internal fields, returns consistent envelope.
13. **`errorHandler`** — catches thrown `ApiError`, maps to HTTP code + JSON body.

Standard response envelope:

```json
{
  "success": true,
  "data": { ... },
  "meta": { "page": 1, "limit": 20, "total": 342 }
}
```

Standard error envelope:

```json
{
  "success": false,
  "error": {
    "code": "ARTICLE_NOT_FOUND",
    "message": "Article not found",
    "details": null
  }
}
```

---

## 2.6 Scalability Notes

- The monolith is **stateless** — scale horizontally behind an ALB. Sessions live in JWT + Redis.
- MongoDB replica set handles read scaling via secondary reads for analytics queries.
- Redis can be upgraded to cluster mode when p99 latency demands it.
- AI service has independent autoscaling policy (queue depth + CPU).
- CDN absorbs 80%+ of static asset traffic.
- Heavy operations (PDF generation, email blasts) move to a Bull queue (Redis) with dedicated workers in phase 2.
