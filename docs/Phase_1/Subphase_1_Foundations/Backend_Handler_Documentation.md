# Subphase 1 — Foundations · Backend Handler

**Owner:** You · **Duration:** Week 1–2 · **Tag at exit:** `v0.1.0`

> **Theme of this subphase:** Stand up the modular monolith skeleton. No business logic — but every cross-cutting concern (config, logging, errors, RBAC middleware shells, response envelope, healthz) is in place so that Subphase 2 onward can build features without re-doing infrastructure.

---

## 1. Objectives

1. Bootstrap the Node.js 20 + TypeScript + Express modular monolith per [`docs/02-system-architecture.md`](../../02-system-architecture.md) §2.3.2.
2. Lock in all cross-cutting middleware (logging, error handling, validation, rate limit shell, CORS, body parsing).
3. Establish module folder discipline per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.1 — every business module will follow the same shape later.
4. Wire MongoDB and Redis connections with healthchecks.
5. Provide a runnable container in `docker-compose.yml` alongside FE and AI.

---

## 2. Scope of Work

### In scope
- Express 4 + TypeScript (strict) scaffold.
- `config/env.ts` with Zod-validated environment schema.
- Mongoose connection (`config/db.ts`) + connection-state metrics.
- Redis client factory (`config/redis.ts`) using `ioredis`.
- Pino structured logger (`config/logger.ts`).
- Middleware:
  - `requestLogger.ts` — assigns `requestId`, logs method/url/duration.
  - `errorHandler.ts` — catches `ApiError`, maps to HTTP + JSON envelope.
  - `cors.ts` — allowed origins from env.
  - `bodyParser` — 1 MB default, 10 MB for media routes (later).
  - `rateLimit.ts` — Redis-backed sliding window **skeleton** (full rules in Subphase 2).
  - `authGuard.ts`, `roleGuard.ts` — **stubs returning 401/403** for now (real auth in Subphase 2).
  - `validate.ts` — Zod runner factory.
- Shared utilities:
  - `shared/apiError.ts` — typed `ApiError` class.
  - `shared/response.ts` — `respond.ok(data, meta)`, `respond.created(data)`.
  - `shared/pagination.ts`, `shared/slugify.ts` (stubs ready for use).
- Module folder skeleton for every module declared in [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.2, each with empty `routes.ts`, `controller.ts`, `service.ts`, `repository.ts`, `validator.ts`, `model.ts`, `index.ts`.
- Routes:
  - `GET /healthz` — returns `{ status: "ok", mongo: "up"|"down", redis: "up"|"down" }`.
  - `GET /readyz` — 200 only when mongo & redis are reachable.
  - `GET /v1` — version stamp.
- Multi-stage `Dockerfile` and integration with root `docker-compose.yml` (mongo, redis, backend, ai-service).
- GitHub Actions: lint + typecheck + unit-test workflow.
- `backend/README.md` and `backend/.env.example`.

### Out of scope (later subphases)
- Any business logic for `auth`, `users`, `articles`, etc. — modules are skeleton-only.
- Real RBAC enforcement → Subphase 2.
- Mongoose schemas with full fields → Subphase 2 onward.
- AI proxy logic → Subphase 4.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Architecture overview | [`02-system-architecture.md`](../../02-system-architecture.md) |
| Request lifecycle pipeline | [`02-system-architecture.md`](../../02-system-architecture.md) §2.5 |
| Module anatomy | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.1 |
| Module list (skeleton folders) | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2 |
| Folder structure | [`12-folder-structure.md`](../../12-folder-structure.md) §12.2 |
| Response envelope spec | [`02-system-architecture.md`](../../02-system-architecture.md) §2.5 |
| Standard error codes | [`05-api-documentation.md`](../../05-api-documentation.md) §5.1 |
| Local dev compose | [`11-devops.md`](../../11-devops.md) §11.3 |
| Security threat model | [`10-security.md`](../../10-security.md) §10.1 |

---

## 4. Expected Implementation Direction

### Target folder structure (end of Subphase 1)

Per [`docs/12-folder-structure.md`](../../12-folder-structure.md) §12.2:

```
backend/
├── src/
│   ├── config/
│   │   ├── env.ts             ← Zod-validated env schema
│   │   ├── db.ts              ← Mongo connection
│   │   ├── redis.ts           ← Redis client factory
│   │   ├── logger.ts          ← Pino instance
│   │   └── trending.ts        ← (constants, placeholder)
│   ├── middleware/
│   │   ├── authGuard.ts       ← stub (401 always for now)
│   │   ├── roleGuard.ts       ← stub (403 always for now)
│   │   ├── rateLimit.ts       ← Redis sliding-window skeleton
│   │   ├── requestLogger.ts
│   │   ├── errorHandler.ts
│   │   ├── cors.ts
│   │   └── validate.ts        ← Zod runner
│   ├── modules/
│   │   ├── auth/              ← skeleton only
│   │   ├── users/             ← skeleton only
│   │   ├── organisations/
│   │   ├── articles/
│   │   ├── comments/
│   │   ├── media/
│   │   ├── analytics/
│   │   ├── notifications/
│   │   ├── ads/
│   │   ├── epaper/
│   │   ├── events/
│   │   ├── search/
│   │   └── ai-proxy/
│   ├── shared/
│   │   ├── apiError.ts
│   │   ├── response.ts
│   │   ├── pagination.ts
│   │   └── slugify.ts
│   ├── contracts/             ← shared TS types (will mirror REST contracts)
│   ├── routes.ts              ← root router (wires module routers + healthz)
│   ├── app.ts                 ← Express app factory
│   └── server.ts              ← entrypoint
├── tests/
│   ├── unit/
│   └── integration/
├── scripts/
│   └── seed.ts                ← stub (filled in Subphase 2)
├── Dockerfile                 ← multi-stage, non-root, image < 200 MB
├── .env.example
├── tsconfig.json
├── package.json
└── README.md
```

### Standard envelopes (lock these now)

Success — [`02-system-architecture.md`](../../02-system-architecture.md) §2.5:
```json
{ "success": true, "data": { /* … */ }, "meta": { "page": 1, "limit": 20, "total": 342 } }
```

Error — [`05-api-documentation.md`](../../05-api-documentation.md) §5.1:
```json
{ "success": false, "error": { "code": "ARTICLE_NOT_FOUND", "message": "...", "details": null } }
```

`ApiError` class signature:
```ts
class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}
```

### Request pipeline order (final, per `02-system-architecture.md` §2.5)

1. requestLogger → 2. rateLimit → 3. cors → 4. bodyParser → 5. router → 6. authGuard → 7. roleGuard → 8. validator → 9. controller → 10. service → 11. response serializer → 12. errorHandler.

### Healthz response

```json
{
  "status": "ok",
  "uptime": 12345,
  "mongo": "up",
  "redis": "up",
  "version": "0.1.0",
  "commit": "<sha>"
}
```

### Env schema (`config/env.ts`) — minimum fields

| Var | Required | Example |
|-----|----------|---------|
| `NODE_ENV` | yes | `development` |
| `PORT` | yes | `4000` |
| `MONGO_URI` | yes | `mongodb://mongo:27017/infimit` |
| `REDIS_URL` | yes | `redis://redis:6379` |
| `LOG_LEVEL` | yes | `info` |
| `CORS_ORIGINS` | yes | `http://localhost:5173` |
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | optional this subphase | — |
| `AI_SERVICE_URL` | optional | `http://ai-service:8000` |
| `AI_INTERNAL_KEY` | optional | — |
| `S3_*` | optional | — |

All validated via Zod; boot fails loudly on missing required vars.

---

## 5. Dependencies

### Blocking
- None.

### Soft
- Frontend's confirmation of the response envelope and dev origin (`http://localhost:5173`) for CORS.
- AI service's confirmation that the internal key header name will be `X-Internal-Key` (already in `docs/06-ai-service.md`).

### Provides for downstream
- `shared/apiError.ts`, `shared/response.ts`, validators, middleware — consumed by every backend module from Subphase 2 onward.
- `config/env.ts` — single source of env truth.
- Working `docker-compose.yml` — used by FE for integration days.

---

## 6. Suggested Development Order

1. **Day 1** — `npm init`, TypeScript strict, ESLint, Prettier, husky. `tsconfig.json` with `paths` for `@modules/*`, `@shared/*`, `@config/*`.
2. **Day 2** — `config/env.ts` (Zod), `config/logger.ts` (Pino), `app.ts`, `server.ts`. `GET /healthz` returns 200.
3. **Day 3** — `config/db.ts` (Mongoose connect with retry/backoff), `config/redis.ts`. Healthz now reports both.
4. **Day 4** — Middleware stack: requestLogger, errorHandler, cors, validate, rateLimit (skeleton), authGuard/roleGuard stubs.
5. **Day 5** — `shared/apiError.ts`, `shared/response.ts`, `shared/pagination.ts`, `shared/slugify.ts`. Unit tests.
6. **Day 6** — Module skeletons: create all 13 module folders with the canonical 7-file structure. `index.ts` for each exports `{ router, events }` only.
7. **Day 7** — Root `routes.ts` wires module routers under `/v1/...` (all return 501 NOT_IMPLEMENTED for now).
8. **Day 8** — Multi-stage `Dockerfile` (builder → `node:20-alpine` runner, non-root, healthcheck hitting `/healthz`).
9. **Day 9** — `docker-compose.yml` (root): mongo, redis, backend, ai-service, frontend services per [`docs/11-devops.md`](../../11-devops.md) §11.3. Backend `depends_on: [mongo, redis]`.
10. **Day 10** — GitHub Actions: `lint`, `typecheck`, `test`, `build-image` jobs per [`docs/11-devops.md`](../../11-devops.md) §11.5 (skip deploy for now).
11. **Day 11** — Unit tests (Jest) for `apiError`, `pagination`, `slugify`, `validate`. Integration test for `/healthz` and `/readyz` via supertest + mongodb-memory-server + redis-mock.
12. **Day 12** — `README.md`, `.env.example`, error code registry under `src/shared/errorCodes.ts`.
13. **Day 13 — Integration Day** — `docker compose up` boots cleanly. FE pings `/healthz` via real client. AI service's healthz also returns 200 (cross-handler smoke).
14. **Day 14** — Exit review, tag `v0.1.0`.

---

## 7. Important Considerations

- **No real auth this subphase.** `authGuard` and `roleGuard` exist as stubs so route declarations can use them; they should respond with explicit `NOT_IMPLEMENTED` until Subphase 2 fills them.
- **Connection retries.** Mongo and Redis should retry with exponential backoff at boot — never crash on a slow Docker startup. Cap retries (e.g., 10).
- **Logging:** Pino in JSON only. **Never log PII** — name, email, password, JWT, IP. Per [`docs/10-security.md`](../../10-security.md) §10.1.
- **No top-level `process.exit`** outside `server.ts`. Errors during boot should throw → logged → exit code 1 from one place.
- **Graceful shutdown.** Handle `SIGINT`/`SIGTERM`: drain in-flight requests, close Mongo & Redis. Required for blue/green deploys in P2 — wire it now.
- **Versioning.** Every route is mounted under `/v1`. No exceptions.
- **No process-level singletons leaking between tests.** Use factories (`createApp()`, `createMongoConnection()`) so integration tests can spin up isolated instances.
- **Body parser limits.** `1 MB` default. Media routes that will need higher limits should declare a route-scoped parser later — don't relax the default.
- **CORS preflight.** Must allow `Authorization`, `Content-Type`, `X-Requested-With`. Methods: `GET, POST, PATCH, PUT, DELETE, OPTIONS`.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Frontend** | Kickoff (Day 1) | Confirm response envelope (`success/data/meta` and `success:false/error.code/message`) is final. Confirm dev origin for CORS. |
| **Frontend** | Day 9 | Verify `docker-compose` networking lets FE container reach `backend:4000`. |
| **AI** | Kickoff (Day 1) | Confirm `X-Internal-Key` header name. Confirm AI service URL inside compose (`http://ai-service:8000`). |
| **AI** | Integration Day | Cross-ping both healthz endpoints from inside the compose network. |
| **All** | Daily standup | Surface any contract concerns early — every contract change is a separate PR. |

---

## 9. Deliverables

- [ ] Express app booting locally (`npm run dev`) and via `docker compose up`.
- [ ] `/healthz` and `/readyz` returning 200 with mongo + redis status.
- [ ] All 13 module folders scaffolded with empty 7-file structure.
- [ ] Cross-cutting middleware in place (logger, error handler, validate, rateLimit skeleton, cors, body parser).
- [ ] Auth/role guard stubs returning 401/403/501 deliberately.
- [ ] Shared utilities (`apiError`, `response`, `pagination`, `slugify`) with unit tests.
- [ ] Pino structured logging working; `requestId` injected.
- [ ] Mongo + Redis connecting with retry/backoff.
- [ ] Root `docker-compose.yml` boots mongo, redis, backend, ai-service, frontend.
- [ ] Dockerfile (multi-stage, non-root, healthcheck) building image < 200 MB.
- [ ] GitHub Actions: lint + typecheck + unit-test jobs green on PR.
- [ ] `README.md` covering local dev, env vars, how to run tests.
- [ ] `.env.example` complete and accurate.

### Acceptance checklist
- `docker compose up` boots cleanly in < 60 s.
- `curl http://localhost:4000/healthz` → 200 with `mongo: "up", redis: "up"`.
- `npm test` → passes.
- All 13 module routes return 501 with consistent error envelope.
- Pre-commit hook blocks failing typecheck.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Mongoose vs Mongo version mismatch | Pin `mongoose@8.x` and `mongo:6` in compose; document in README. |
| Pino logger noisy in tests | Inject a silent logger via factory pattern; tests use `pino({ level: "silent" })`. |
| ioredis reconnection loops in CI | Disable in tests via `redis-mock` for unit; only integration tests touch real Redis. |
| TypeScript path aliases break at build time | Configure `tsc-alias` or use `module-alias` runtime resolver; verify the built `dist/` works in the Docker image. |
| Module skeletons drift into divergent shapes | Provide a `scripts/generate-module.ts` template generator (optional) so all modules stay structurally identical. |
| Docker image size > 200 MB target | Multi-stage build; only copy `dist/` and `node_modules` (production deps) into runner; verify on Day 8. |
| Compose networking confusion (localhost vs service name) | Document that within compose, FE → BE uses `backend:4000` and BE → AI uses `ai-service:8000`. From host, all use `localhost:<port>`. |
