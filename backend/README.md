# Infimit Backend

Node.js modular monolith — auth, content, comments, e-paper, analytics, and the AI proxy. TypeScript, Express, MongoDB, Redis, S3.

**Current state (through Subphase 3):** auth + users + organisations + articles (draft → submitted) + media (presigned uploads) + comments (schema only). Approve / publish / placement / public feeds land in Subphases 4 and 5. See `../docs/Phase_1/Subphase_<N>_*/Backend_Handler_Documentation.md` for each subphase's scope and exit criteria.

## Quick start (local)

```bash
# 1. Install deps
npm install

# 2. Mint dev JWT keypairs (Subphase 2+; gitignored under ./keys)
npm run keys:generate

# 3. Copy env template — defaults match docker-compose.dev.yml
cp .env.example .env

# 4. Start Mongo + Redis + MinIO (root-level compose)
docker compose -f ../docker-compose.dev.yml up -d mongo redis minio minio-init

# 5. Provision a dev admin + organisation + editors (idempotent)
npm run seed

# 6. Run the backend in watch mode
npm run dev
```

The server listens on `http://localhost:4000`. Probe it:

```bash
curl http://localhost:4000/healthz   # → {"status":"ok"}
curl http://localhost:4000/readyz    # → checks mongo + redis
curl http://localhost:4000/version
```

Dev admin (seeded): `admin@infimit.dev` / `Admin12345!` — **rotate before any shared environment.**

## Scripts

| Command                 | Purpose                                                |
| ----------------------- | ------------------------------------------------------ |
| `npm run dev`           | Watch mode (tsx).                                      |
| `npm run build`         | Compile to `dist/` (tsc + tsc-alias).                  |
| `npm start`             | Run the compiled output.                               |
| `npm run typecheck`     | `tsc --noEmit`.                                        |
| `npm run lint`          | ESLint over `src/` and `tests/`.                       |
| `npm run lint:fix`      | Same + auto-fix.                                       |
| `npm run format`        | Prettier write.                                        |
| `npm run format:check`  | Prettier verify (CI gate).                             |
| `npm test`              | Jest (smoke + unit + integration). `--forceExit`.      |
| `npm run test:coverage` | Coverage report into `coverage/`.                      |
| `npm run keys:generate` | Mint RS256 dev keypairs into `./keys/` (gitignored).   |
| `npm run keys:rotate`   | Force-regenerate keypairs (`--force`).                 |
| `npm run seed`          | Idempotent seed: 1 admin + 1 organisation + 2 editors. |
| `npm run migrate`       | Idempotent `syncIndexes()` for every Mongoose model.   |

## Folder layout

Canonical layout per [`../docs/12-folder-structure.md`](../docs/12-folder-structure.md) §12.2.

```
backend/
├── src/
│   ├── config/          # env (zod), logger (pino), db (mongo), redis, s3
│   ├── middleware/      # requestId, requestLogger, errorHandler, validate, authGuard, …
│   ├── modules/         # one folder per business module
│   │   ├── auth/        # routes, controller, service, repository, validator, model, index
│   │   ├── users/
│   │   ├── organisations/
│   │   ├── articles/
│   │   ├── media/
│   │   ├── comments/    # skeleton through Subphase 3
│   │   └── ai-proxy/    # internal — typed surface for AI calls (Subphase 4)
│   ├── shared/          # errors, events bus, audit, crypto, constants, types, utils
│   ├── jobs/            # cron / queue consumers (Subphase 5+)
│   ├── routes.ts        # /v1 router composition
│   ├── app.ts           # Express app factory
│   └── server.ts        # http bootstrap + graceful shutdown
├── tests/               # unit + integration (supertest, mongodb-memory-server)
├── scripts/             # generate-keys, seed, migrate
├── keys/                # RS256 PEMs (gitignored)
├── Dockerfile
├── .env.example
└── README.md
```

## Architectural rules (enforced by ESLint)

- `shared/` must not import from `modules/` or `middleware/`.
- Cross-module imports must go through `modules/<name>/index.ts` (no deep paths).
  - One documented exception: `users/validator.ts` imports `emailSchema` /
    `passwordSchema` directly from `auth/validator.ts` to avoid a CJS cycle
    that crashes `tsx watch`. To be resolved when the auth barrel is split
    (routes vs schemas).
- `controller.ts` never touches Mongoose directly — go through `repository.ts`.
- `repository.ts` never throws `ApiError` — mapping happens in `service.ts`.

## Response envelope

All responses follow a tagged-union shape:

```jsonc
// Success
{ "success": true, "data": { /* payload */ }, "meta": { /* optional */ } }

// Error (4xx / 5xx)
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { } },
  "requestId": "8f6c8b4c-..."
}
```

The FE branches on `error.code` (a machine-readable enum from
`src/shared/errors/errorCodes.ts`) — **never on `message`**. Adding new codes
is non-breaking; renaming an existing code is a contract change requiring a
coordinated FE update.

Throw via `ApiError` static helpers in `src/shared/errors`. The global
`errorHandler` middleware emits the envelope.

## Auth (since Subphase 2)

- **Access token:** RS256, 15 min, sent as `Authorization: Bearer <token>`. Never persisted on the FE outside memory.
- **Refresh token:** RS256, 30 days, `HttpOnly + Secure + SameSite=Strict` cookie scoped to `/v1/auth`. Rotated every use, replay-detected via Redis jti blocklist.
- **CSRF pair:** the FE sends `X-Requested-With: XMLHttpRequest` on every request; the CORS allowlist requires it.
- **Brute-force:** 10 failed logins for the same email within 1h → 15-min lockout (per-account, in Redis). `/v1/auth/*` is also IP-rate-limited at 10 req/min.

PEM key files live in `./keys/` (gitignored) for dev; production injects via a secrets manager at the same paths.

## Media uploads (Subphase 3) — S3 / MinIO

Media uploads use a presigned-PUT-then-register flow:

1. FE calls `POST /v1/media/upload-url` with `{ mimeType, size, purpose }`.
2. Backend caps-checks against `src/modules/media/caps.ts`, generates an opaque key under `uploads/<purpose>/<uuid>.<ext>`, returns a presigned S3 PUT URL.
3. FE `PUT`s the binary directly to S3 (no proxying through backend bandwidth).
4. FE calls `POST /v1/media/register` with the same key + final metadata. Backend re-validates caps, writes a media doc with `refCount=0`.

### Dev (MinIO via docker-compose)

The dev compose file starts MinIO on `localhost:9000` (S3 API) + `localhost:9001` (web console). A one-shot `minio-init` service creates the `infimit-dev` bucket on first boot.

```bash
docker compose -f ../docker-compose.dev.yml up -d minio minio-init
# Console:  http://localhost:9001     (login: minioadmin / minioadmin)
# S3 API:   http://localhost:9000
```

`.env.example` ships defaults pointing at this stack (`S3_FORCE_PATH_STYLE=true`, root creds). Tests use a module-level mock of `@/config/s3` (`tests/integration/_s3Mock.ts`) so they never hit a live S3 — neither MinIO nor AWS.

### Production (real AWS S3)

Swap the env vars at deploy time:

```env
S3_ENDPOINT=                # leave empty so the SDK uses the default AWS endpoint
S3_REGION=ap-south-1        # whichever region the bucket lives in
S3_BUCKET=infimit-prod-media
S3_FORCE_PATH_STYLE=false   # virtual-host style is the AWS default
S3_PUBLIC_BASE_URL=https://cdn.infimit.example   # CloudFront in front of the bucket
# Credentials via the SDK's default chain (IAM role on the host, env vars,
# or shared config) — do NOT bake `S3_ACCESS_KEY` / `S3_SECRET_KEY` into
# the env on EC2/ECS/EKS deployments.
```

The bucket policy should:

- Block public access in general.
- Allow public reads ONLY via the CloudFront distribution at `S3_PUBLIC_BASE_URL`.
- CORS allow `PUT` from the FE origin (the FE uploads directly to S3 — no backend pass-through).

A future `scripts/configure-s3-cors.sh` will deterministically apply the CORS config via the AWS CLI; until that lands, follow the manual steps in [`../docs/Phase_1/Subphase_3_Content_Engine/Backend_Handler_Documentation.md`](../docs/Phase_1/Subphase_3_Content_Engine/Backend_Handler_Documentation.md) §10.

### Per-purpose caps

| Purpose         | Max size | Allowed MIME                                     |
| --------------- | -------- | ------------------------------------------------ |
| `article_cover` | 10 MB    | image/jpeg, image/png, image/webp                |
| `article_embed` | 10 MB    | image/jpeg, image/png, image/webp                |
| `author_avatar` | 2 MB     | image/jpeg, image/png, image/webp                |
| `org_logo`      | 2 MB     | image/jpeg, image/png, image/webp, image/svg+xml |
| `epaper_pdf`    | 50 MB    | application/pdf                                  |
| `epaper_cover`  | 10 MB    | image/jpeg, image/png                            |
| `ad_creative`   | 10 MB    | image/jpeg, image/png, image/webp (Subphase 4)   |
| `tts_audio`     | 20 MB    | audio/mpeg, audio/mp4 (Subphase 4)               |

Caps are enforced TWICE — at `/upload-url` (refuse to issue presign) and at `/register` (anti-tamper re-validation against the size the FE claims). The presigned URL itself binds `Content-Type` into the signature, so S3 also rejects MIME tampering at upload time.

## Health probes

| Route      | Purpose                                                                |
| ---------- | ---------------------------------------------------------------------- |
| `/healthz` | Liveness — always 200 if process is up. Used by orchestrator liveness. |
| `/readyz`  | Readiness — 200 only when Mongo + Redis are reachable.                 |
| `/version` | Build/runtime info (name, version, env, uptime).                       |

## What's next

Subphase 4 fills in the article approval lifecycle (approve / reject / publish / unpublish / placement), the AI proxy (summary + keywords + TTS), comment write+moderation, and the notifications module. The handler doc is at [`../docs/Phase_1/Subphase_4_*/Backend_Handler_Documentation.md`](../docs/Phase_1/).
