# 📁 12. Folder Structure

Canonical directory trees for the three deployable units. Stick to these — consistency makes the codebase navigable without a guide.

---

## 12.1 Repository Layout (monorepo option)

```
infimit/
├── backend/          ← Node.js modular monolith
├── ai-service/       ← FastAPI AI microservice
├── frontend/         ← React + TS SPA
├── docs/             ← This folder
├── infra/            ← Terraform / CDK / IaC
├── .github/
│   └── workflows/    ← CI/CD pipelines
├── docker-compose.yml
├── package.json      ← workspaces root
└── README.md
```

Alternative: three separate repos if teams want isolated release cycles. The rest of this doc assumes monorepo but everything applies either way.

---

## 12.2 Backend — Modular Monolith

```
backend/
├── src/
│   ├── config/
│   │   ├── env.ts             ← Zod-validated environment schema
│   │   ├── db.ts              ← Mongo connection
│   │   ├── redis.ts           ← Redis client factory
│   │   ├── logger.ts          ← Pino instance
│   │   ├── s3.ts              ← S3 client + presign helper
│   │   └── trending.ts        ← Trending algorithm constants
│   │
│   ├── middleware/
│   │   ├── authGuard.ts
│   │   ├── roleGuard.ts
│   │   ├── rateLimit.ts
│   │   ├── requestLogger.ts
│   │   ├── errorHandler.ts
│   │   ├── cors.ts
│   │   └── validate.ts        ← Zod runner
│   │
│   ├── modules/
│   │   ├── auth/
│   │   │   ├── routes.ts
│   │   │   ├── controller.ts
│   │   │   ├── service.ts
│   │   │   ├── repository.ts
│   │   │   ├── validator.ts
│   │   │   ├── events.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── users/
│   │   │   ├── routes.ts
│   │   │   ├── controller.ts
│   │   │   ├── service.ts
│   │   │   ├── repository.ts
│   │   │   ├── validator.ts
│   │   │   ├── model.ts
│   │   │   └── index.ts
│   │   │
│   │   ├── organisations/     (same shape)
│   │   ├── articles/          (same shape)
│   │   ├── comments/          (same shape)
│   │   ├── media/             (same shape)
│   │   ├── analytics/         (same shape)
│   │   ├── notifications/     (same shape)
│   │   ├── ads/               (same shape)
│   │   ├── epaper/            (same shape)
│   │   ├── events/            (same shape)
│   │   ├── search/            (same shape)
│   │   ├── bookmarks/         (same shape)
│   │   └── ai-proxy/
│   │       ├── client.ts      ← Axios instance + circuit breaker
│   │       ├── service.ts
│   │       └── index.ts
│   │
│   ├── shared/
│   │   ├── errors/
│   │   │   └── ApiError.ts
│   │   ├── utils/
│   │   │   ├── jwt.ts
│   │   │   ├── hash.ts
│   │   │   ├── slugify.ts
│   │   │   ├── pagination.ts
│   │   │   ├── sanitizeHtml.ts
│   │   │   └── pdfGenerator.ts
│   │   ├── types/             ← shared TS types / DTOs
│   │   └── events/
│   │       └── bus.ts         ← in-process event emitter
│   │
│   ├── jobs/                  ← cron / queue consumers
│   │   ├── trending.cron.ts
│   │   ├── daily-rollup.cron.ts
│   │   ├── ai-backfill.cron.ts
│   │   ├── email.worker.ts    ← (phase 2)
│   │   └── pdf.worker.ts      ← (phase 2)
│   │
│   ├── routes.ts              ← top-level router composing module routers
│   ├── app.ts                 ← express app factory
│   └── server.ts              ← http server bootstrap
│
├── tests/
│   ├── unit/
│   ├── integration/           ← supertest + mongo-memory-server
│   └── fixtures/
│
├── scripts/
│   ├── seed.ts                ← seed admin, categories, fixtures
│   ├── migrate.ts             ← schema migration runner
│   └── generate-keys.ts       ← JWT key pair
│
├── Dockerfile
├── .env.example
├── package.json
├── tsconfig.json
├── jest.config.ts
└── README.md
```

**Rules enforced by lint:**
- No file in `modules/x/` imports from `modules/y/` except via `modules/y/index.ts`
- `controller.ts` files never touch Mongoose directly
- `repository.ts` files never throw HTTP errors — they return nulls or throw generic errors
- `shared/` can be imported from anywhere; it cannot import from `modules/`

---

## 12.3 AI Service — FastAPI

```
ai-service/
├── app/
│   ├── main.py                ← FastAPI app + routers
│   ├── config.py              ← pydantic settings
│   ├── dependencies.py        ← DI for auth key, model loader
│   │
│   ├── routers/
│   │   ├── __init__.py
│   │   ├── summarize.py
│   │   ├── keywords.py
│   │   ├── recommend.py
│   │   ├── tts.py
│   │   ├── semantic_search.py
│   │   ├── moderate.py
│   │   └── health.py
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── summarizer.py      ← BART wrapper
│   │   ├── keywords.py        ← YAKE
│   │   ├── recommender.py     ← MiniLM ranker
│   │   ├── tts.py             ← Coqui XTTS
│   │   ├── semantic_search.py ← embedding index
│   │   └── moderator.py       ← toxic-bert
│   │
│   ├── models/
│   │   └── loader.py          ← lazy, memoized model loader
│   │
│   ├── schemas/               ← pydantic request/response models
│   │   ├── summarize.py
│   │   ├── keywords.py
│   │   ├── recommend.py
│   │   ├── tts.py
│   │   ├── semantic_search.py
│   │   └── moderate.py
│   │
│   ├── middleware/
│   │   ├── auth.py            ← X-Internal-Key check
│   │   ├── logging.py
│   │   └── metrics.py         ← prometheus_client
│   │
│   └── utils/
│       ├── text.py
│       └── cache.py
│
├── tests/
│   ├── test_summarize.py
│   ├── test_keywords.py
│   └── ...
│
├── models_cache/              ← gitignored, mounted volume in prod
├── Dockerfile
├── requirements.txt
├── pyproject.toml
├── .env.example
└── README.md
```

---

## 12.4 Frontend — React + TS (Vite)

```
frontend/
├── public/
│   ├── favicon.svg
│   └── robots.txt
│
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── router.tsx
│   │
│   ├── pages/
│   │   ├── public/
│   │   │   ├── Home.tsx
│   │   │   ├── Article.tsx
│   │   │   ├── Category.tsx
│   │   │   ├── Search.tsx
│   │   │   ├── EpaperArchive.tsx
│   │   │   ├── AuthorProfile.tsx
│   │   │   ├── OrgProfile.tsx
│   │   │   ├── About.tsx
│   │   │   └── Contact.tsx
│   │   ├── auth/
│   │   │   ├── Login.tsx
│   │   │   ├── Register.tsx
│   │   │   └── ForgotPassword.tsx
│   │   ├── reader/
│   │   │   ├── Profile.tsx
│   │   │   ├── Bookmarks.tsx
│   │   │   └── Notifications.tsx
│   │   ├── author/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── DraftEditor.tsx
│   │   │   ├── SubmissionTracker.tsx
│   │   │   └── EventSubmit.tsx
│   │   ├── editor/
│   │   │   ├── Dashboard.tsx
│   │   │   ├── ApprovalQueue.tsx
│   │   │   ├── CommentModeration.tsx
│   │   │   ├── PlacementControl.tsx
│   │   │   └── Ads.tsx
│   │   └── admin/
│   │       ├── Dashboard.tsx
│   │       ├── EditorManagement.tsx
│   │       ├── OrganisationManagement.tsx
│   │       ├── EpaperUpload.tsx
│   │       └── Analytics.tsx
│   │
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Navbar.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── SmartFilters.tsx
│   │   │   └── RoleGate.tsx
│   │   ├── article/
│   │   │   ├── ArticleCard.tsx
│   │   │   ├── HeroBanner.tsx
│   │   │   ├── TrailBar.tsx
│   │   │   ├── TrendingList.tsx
│   │   │   ├── AiSummary.tsx
│   │   │   ├── TtsPlayer.tsx
│   │   │   ├── ShareButtons.tsx
│   │   │   └── CommentThread.tsx
│   │   ├── editor/
│   │   │   └── RichTextEditor.tsx  ← Tiptap
│   │   ├── forms/
│   │   └── ui/                ← buttons, inputs, modals
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useDarkMode.ts
│   │   ├── useArticleQuery.ts
│   │   └── useTrackEvent.ts
│   │
│   ├── api/
│   │   ├── client.ts          ← axios + interceptors
│   │   ├── auth.ts
│   │   ├── articles.ts
│   │   ├── comments.ts
│   │   ├── media.ts
│   │   ├── analytics.ts
│   │   ├── ads.ts
│   │   ├── epaper.ts
│   │   └── notifications.ts
│   │
│   ├── store/                 ← Zustand stores
│   │   ├── authStore.ts
│   │   ├── themeStore.ts
│   │   └── notificationStore.ts
│   │
│   ├── styles/
│   │   └── tailwind.css
│   │
│   ├── types/                 ← shared TS types (mirrors backend DTOs)
│   │
│   └── utils/
│       ├── formatDate.ts
│       ├── readingTime.ts
│       └── slug.ts
│
├── tests/
├── Dockerfile
├── nginx.conf
├── index.html
├── vite.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## 12.5 Shared Conventions

- **File naming:** `kebab-case` for files, `PascalCase` for React components, `camelCase` for functions
- **Import aliases:** `@/modules/...`, `@/shared/...` (tsconfig `paths`)
- **Barrel files (`index.ts`)** only for public module surfaces — do not stuff them with re-exports
- **Tests** mirror source tree under `tests/`
- **No "utils" dumping ground** — create a named module if utils for a concept grow past 3 files
