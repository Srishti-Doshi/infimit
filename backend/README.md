# Infimit Backend

Node.js modular monolith — auth, content, comments, e-paper, analytics, and the AI proxy. TypeScript, Express, MongoDB, Redis.

This is the Subphase 1 scaffold. See [`docs/Phase_1/Subphase_1_Foundations/Backend_Handler_Documentation.md`](../docs/Phase_1/Subphase_1_Foundations/Backend_Handler_Documentation.md) for scope and exit criteria.

## Quick start (local)

```bash
# 1. Install deps
npm install

# 2. Copy env template and edit
cp .env.example .env

# 3. Start Mongo + Redis (root-level compose)
docker compose -f ../docker-compose.dev.yml up -d mongo redis

# 4. Run the backend in watch mode
npm run dev
```

The server listens on `http://localhost:4000`. Probe it:

```bash
curl http://localhost:4000/healthz   # → {"status":"ok"}
curl http://localhost:4000/readyz    # → checks mongo + redis
curl http://localhost:4000/version
```

## Running with Docker (full compose)

```bash
docker compose -f ../docker-compose.dev.yml up backend --build
```

This is the Subphase 1 acceptance check: `mongo + redis + backend` should all become healthy and `/healthz` returns 200.

## Scripts

| Command                 | Purpose                                              |
| ----------------------- | ---------------------------------------------------- |
| `npm run dev`           | Watch mode (tsx).                                    |
| `npm run build`         | Compile to `dist/`.                                  |
| `npm start`             | Run the compiled output.                             |
| `npm run typecheck`     | `tsc --noEmit`.                                      |
| `npm run lint`          | ESLint over `src/` and `tests/`.                     |
| `npm run lint:fix`      | Same + auto-fix.                                     |
| `npm run format`        | Prettier write.                                      |
| `npm test`              | Jest (smoke + unit). Integration tests run serially. |
| `npm run test:coverage` | Coverage report into `coverage/`.                    |

## Folder layout

Canonical layout per [`docs/12-folder-structure.md`](../docs/12-folder-structure.md) §12.2.

```
backend/
├── src/
│   ├── config/          # env (zod), logger (pino), db (mongo), redis
│   ├── middleware/      # requestId, requestLogger, errorHandler, validate, …
│   ├── modules/         # one folder per business module
│   │   ├── auth/        # routes, controller, service, repository, validator, index
│   │   ├── users/
│   │   ├── articles/
│   │   ├── …
│   │   └── ai-proxy/    # internal — typed surface for AI calls
│   ├── shared/          # errors, events bus, types, utils
│   ├── jobs/            # cron / queue consumers (Subphase 5+)
│   ├── routes.ts        # /v1 router composition
│   ├── app.ts           # Express app factory
│   └── server.ts        # http bootstrap + graceful shutdown
├── tests/               # unit + integration (supertest, mongodb-memory-server)
├── scripts/             # seed / migrate (stubs in Subphase 1)
├── Dockerfile
├── .env.example
└── README.md
```

## Architectural rules (enforced by ESLint)

- `shared/` must not import from `modules/` or `middleware/`.
- Cross-module imports must go through `modules/<name>/index.ts` (no deep paths).
- `controller.ts` never touches Mongoose directly — go through `repository.ts`.
- `repository.ts` never throws `ApiError` — mapping happens in `service.ts`.

## Error envelope

All 4xx / 5xx responses share this shape (docs/05-api-documentation.md §5.4):

```json
{
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": {} },
  "requestId": "8f6c8b4c-..."
}
```

Throw via `ApiError` static helpers in `src/shared/errors`. The global `errorHandler` middleware does the rest.

## Health probes

| Route      | Purpose                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `/healthz` | Liveness — always 200 if process is up. Used by orchestrator liveness. |
| `/readyz`  | Readiness — 200 only when Mongo + Redis are reachable.                 |
| `/version` | Build/runtime info (name, version, env, uptime).                       |

## What's next

Subphase 2 fills in auth + users + organisations. The handler doc is at [`docs/Phase_1/Subphase_2_Identity/Backend_Handler_Documentation.md`](../docs/Phase_1/Subphase_2_Identity/Backend_Handler_Documentation.md).
