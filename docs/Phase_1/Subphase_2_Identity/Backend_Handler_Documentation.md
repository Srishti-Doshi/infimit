# Subphase 2 — Identity & AI Contract Lock · Backend Handler

**Owner:** You · **Duration:** Week 3–4 · **Tag at exit:** `v0.2.0`

> **Theme of this subphase:** Real identity. Every user role exists in the database, can register, log in, refresh, log out, verify email, and reset password. Editors and organisations are administrable. The `auth`, `users`, `organisations` modules ship to production-shape; the rest stay skeletons.

---

## 1. Objectives

1. Implement `auth` module fully: register, login, refresh (rotation), logout, email verify, password reset.
2. Implement `users` module: profile read/update, avatar URL set, editor CRUD (admin), public author endpoint.
3. Implement `organisations` module: CRUD per the contract.
4. Wire **real** `authGuard` (JWT verify + revocation check) and `roleGuard` middleware.
5. Build sessions collection + refresh-token rotation + Redis jti blocklist.
6. Ship the seed script: admin + 2 editors + 5 categories + 1 organisation.
7. Lock down rate-limit rules per [`docs/05-api-documentation.md`](../../05-api-documentation.md) §5.17.

---

## 2. Scope of Work

### In scope
- **`auth` module** — every endpoint in [`docs/05-api-documentation.md`](../../05-api-documentation.md) §5.2.
  - JWT signing (RS256) per [`docs/10-security.md`](../../10-security.md) §10.2.
  - Refresh token rotation (httpOnly cookie, SameSite=strict, Secure).
  - Redis jti blocklist for logout + password change.
  - Argon2id password hashing (`memoryCost=19456`, `timeCost=2`, `parallelism=1`).
  - Email verification + password reset tokens (signed JWT, single-use via blocklist).
  - Email send stub (Pino-logged in dev; real SES in Phase 2).
- **`users` module** — endpoints in [`docs/05-api-documentation.md`](../../05-api-documentation.md) §5.3.
- **`organisations` module** — endpoints in [`docs/05-api-documentation.md`](../../05-api-documentation.md) §5.4.
- Middleware:
  - `authGuard.ts` — real JWT verify, blocklist check, `req.user` injection.
  - `roleGuard.ts` — checks `req.user.role` against array; throws `403 FORBIDDEN`.
  - `rateLimit.ts` — Redis sliding window with the limits from [`docs/05-api-documentation.md`](../../05-api-documentation.md) §5.17.
- Mongoose schemas + indexes (per [`docs/04-database-design.md`](../../04-database-design.md)):
  - `users` (§4.2.1)
  - `organisations` (§4.2.2)
  - `sessions` (§4.2.14)
- Seed script (`scripts/seed.ts`): admin, 2 editors, 1 organisation, 5 categories (categories stored as a constants enum, not a Mongo collection in MVP).
- Integration tests via supertest + `mongodb-memory-server` + `redis-mock` for every auth endpoint.
- Audit logging stub: every state-changing auth event emits a Pino log line with `actor`, `entity`, `action`.

### Out of scope
- Real email delivery (SES) → Phase 2.
- Articles, comments, media → Subphase 3.
- AI proxy integration → Subphase 4.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Auth endpoints contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.2 |
| Users contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.3 |
| Organisations contract | [`05-api-documentation.md`](../../05-api-documentation.md) §5.4 |
| RBAC matrix | [`05-api-documentation.md`](../../05-api-documentation.md) §5.16 |
| Auth module surface | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.1 |
| Users module surface | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.2 |
| Organisations module surface | [`03-module-breakdown.md`](../../03-module-breakdown.md) §3.2.3 |
| Auth & JWT strategy | [`10-security.md`](../../10-security.md) §10.2 |
| Password policy | [`10-security.md`](../../10-security.md) §10.3 |
| RBAC rules | [`10-security.md`](../../10-security.md) §10.4 |
| Schemas | [`04-database-design.md`](../../04-database-design.md) §4.2.1, §4.2.2, §4.2.14 |
| Session lifecycle | [`07-workflows.md`](../../07-workflows.md) §7.8 |
| Rate limits | [`05-api-documentation.md`](../../05-api-documentation.md) §5.17 |

---

## 4. Expected Implementation Direction

### Module shape (mandatory pattern)

Per [`docs/03-module-breakdown.md`](../../03-module-breakdown.md) §3.1, every module follows:

```
modules/auth/
├── routes.ts         ← Express router; wires guards + validators
├── controller.ts     ← Thin: parse, call service, respond.ok(...)
├── service.ts        ← Business logic; uses repository + crypto + token helpers
├── repository.ts     ← Mongoose queries; never throws ApiError
├── validator.ts      ← Zod schemas for request bodies
├── model.ts          ← Mongoose schema + TS types
├── events.ts         ← EventEmitter publishes (user.registered, etc.)
└── index.ts          ← Public surface only (no .service exports)
```

### JWT structure (locked)

Per [`docs/10-security.md`](../../10-security.md) §10.2:

```json
{
  "sub": "userId",
  "role": "reader|author|editor|admin",
  "orgId": "optional",
  "jti": "uuid",
  "iat": 1700000000,
  "exp": 1700000900,
  "iss": "infimit",
  "aud": "infimit-api"
}
```

- **Access**: 15 min, RS256, returned in JSON body.
- **Refresh**: 30 days, RS256, sent as `Set-Cookie: refresh_token=...; HttpOnly; Secure; SameSite=Strict; Path=/v1/auth/refresh`.
- On refresh, **rotate**: revoke old `jti` (push to Redis blocklist with TTL = exp), mint new pair.
- On logout, revoke `jti` immediately.
- On password change, revoke **all sessions for user** (`sessions.revokedAt=now` + loop blocklist).

### Refresh token storage

- Persist in `sessions` collection (per [`docs/04-database-design.md`](../../04-database-design.md) §4.2.14) with `{ userId, tokenId, userAgent, ip, expiresAt, revokedAt }`.
- TTL index on `expiresAt`.

### Email verify / password reset tokens

- Short-lived RS256 JWTs with claims `{ sub: userId, purpose: "verify"|"reset", jti, exp }`.
- Verify-purpose: 24 h. Reset-purpose: 1 h.
- One-time use: after consumption, push `jti` to Redis blocklist with matching TTL.

### Rate limits (Redis sliding window, per [`05-api-documentation.md`](../../05-api-documentation.md) §5.17)

| Route group | Limit | Key |
|-------------|-------|-----|
| `/auth/*` | 10 req/min | per IP |
| Public reads | 120 req/min | per IP |
| Auth writes | 60 req/min | per user |
| Comments | 10 req/min | per user (Subphase 4) |
| AI endpoints | 20 req/min | per user (Subphase 4) |

### Validators (Zod) — must mirror [`docs/10-security.md`](../../10-security.md) §10.3 password policy

```ts
export const passwordSchema = z.string().min(10).regex(/[A-Za-z]/).regex(/[0-9]/);
```

### Audit logging (stub for P1, full collection in P2)

For every auth state change, log:
```ts
logger.info({ audit: true, entity: "user", entityId, action: "login"|"register"|..., actor, at });
```

### Seed script

Idempotent. Reading `.env.seed` for the demo admin email/password (e.g., `admin@infimit.com` / random 16-char pwd printed to stdout).

```
yarn seed
> Seeded:
>   admin: admin@infimit.com (password: ...)
>   editor: editor.research@infimit.com (set password via email link printed below)
>   editor: editor.campus@infimit.com (set password via email link printed below)
>   organisation: Infimit College Press (slug: infimit-press)
>   categories: education_policy, campus_news, research_innovation, student_achievements, tech_in_education
```

---

## 5. Dependencies

### Blocking
- Subphase 1 foundation: middleware shells, env, Pino, Mongo+Redis healthy.

### Soft
- Frontend's confirmation of cookie name (`refresh_token`) and refresh path (`/v1/auth/refresh`).

### Provides for downstream
- `authGuard` + `roleGuard` (real) — every subsequent module relies on these.
- User documents in DB — articles, comments, bookmarks, notifications all FK to `users._id`.
- Sessions + blocklist mechanism — reused for any future token-revocation needs.

---

## 6. Suggested Development Order

1. **Day 1** — Mongoose schemas: `users`, `organisations`, `sessions` per `docs/04-database-design.md` (with indexes). Migration script to create indexes (background builds).
2. **Day 2** — JWT helpers in `shared/jwt.ts`: sign access, sign refresh, sign purpose-token, verify, decode. Use RS256 with keys in env.
3. **Day 3** — Password helpers in `shared/hash.ts`: argon2id hash + verify. Pwned Passwords stub (defer real k-anonymity check unless trivial).
4. **Day 4** — `auth.service.ts`: register (reader / author), login (returns access + sets cookie). `auth.repository.ts` for `findByEmail`, `createUser`, `createSession`.
5. **Day 5** — `auth.service.ts`: refresh (rotation), logout (blocklist). Integration test for the rotation cycle.
6. **Day 6** — Email verify + password reset: token issuance + consumption. Email send stub (logs to Pino).
7. **Day 7** — Real `authGuard` middleware: verify JWT, check blocklist, attach `req.user`. Real `roleGuard`. Replace Subphase 1 stubs.
8. **Day 8** — Rate-limit middleware (Redis sliding window) — wire on `/auth/*` first.
9. **Day 9** — `users` module: profile read/update, avatar URL set, editor CRUD (admin), public author endpoint.
10. **Day 10** — `organisations` module: full CRUD.
11. **Day 11** — Seed script (`scripts/seed.ts`). Categories enum lives at `src/shared/categories.ts`.
12. **Day 12** — Integration tests covering: register, login, refresh, logout, blocklist, password change revokes all sessions, RBAC denials, rate-limit denials.
13. **Day 13 — Integration Day** — Live end-to-end with Frontend: register a reader, log in, hit `/auth/me`, log out. Admin (from seed) creates an editor.
14. **Day 14** — Exit review, tag `v0.2.0`.

---

## 7. Important Considerations

- **Argon2id parameters are non-negotiable.** Use exact values from [`10-security.md`](../../10-security.md) §10.3. Anything weaker is a finding.
- **Never log passwords, tokens, JWTs, or PII.** Per [`10-security.md`](../../10-security.md) §10.1.
- **Slug uniqueness for users.** Generate from `name` + suffix on collision. The `slug` field is for public author pages; readers don't need a slug (set null).
- **Email lowercase + trim** at the validator boundary. Indexes assume normalized email.
- **`organisationId` is required when `role=author`.** Validator should refuse otherwise.
- **Optimistic concurrency.** `users` and `organisations` don't yet need a `version` field; that's only on `articles`. But all updates should use `findOneAndUpdate({ _id, deletedAt: null }, ...)`.
- **Soft delete editors** (set `deletedAt`, `isActive: false`). Email becomes free for re-registration only after `deletedAt + 30 days` — enforce in the unique-index lookup (compound index `{ email: 1, deletedAt: 1 }`).
- **CORS + cookies.** With cookies, `Access-Control-Allow-Credentials: true` and the origin must be the explicit FE origin (no `*`).
- **Refresh endpoint security.** `POST /v1/auth/refresh` — read refresh token from the cookie, never from body or header. Reject if cookie missing.
- **Replay protection.** A stolen access token is valid for 15 min max; a stolen refresh, used once after rotation, will be invalidated and the legitimate user's next refresh will fail — alert (log + Sentry) on that mismatch.
- **Rate-limit storage.** Use a Lua script in Redis for atomic sliding-window check. Document the algorithm in `middleware/rateLimit.ts` header comment.
- **Public author endpoint** (`GET /users/authors/:slug`) returns redacted fields only (no email, no phone, no preferences). Define a `toPublic()` serializer in `users.service.ts`.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Frontend** | Kickoff | Confirm cookie name `refresh_token`, path `/v1/auth/refresh`, SameSite=strict, Secure, HttpOnly. Confirm response envelope. Share Zod schemas (or their TS types) so frontend mirrors them. |
| **Frontend** | Day 8 | Coordinate live wire-up. Provide seed admin credentials. |
| **Frontend** | Integration Day | Pair-debug CORS, cookie behavior, refresh single-flight. |
| **AI** | Kickoff | Confirm AI's `/v1/summarize` request/response shape (still locked from `docs/06-ai-service.md` §6.2.1). Backend won't call it yet, but the contract for Subphase 4 should be agreed. Confirm AI's stub will return deterministic output that backend can integration-test against. |
| **AI** | End of subphase | Share the planned `ai-proxy` interface (TS types) so AI can confirm payload conformance. |

---

## 9. Deliverables

- [ ] `auth` module fully implementing §5.2 endpoints.
- [ ] `users` module fully implementing §5.3 endpoints.
- [ ] `organisations` module fully implementing §5.4 endpoints.
- [ ] Real `authGuard` + `roleGuard` replacing Subphase 1 stubs.
- [ ] Rate-limit middleware applied per §5.17.
- [ ] Mongoose schemas + indexes for `users`, `organisations`, `sessions` matching `docs/04-database-design.md`.
- [ ] Refresh-token rotation + jti blocklist working in Redis.
- [ ] Argon2id password hashing per security policy.
- [ ] Email verify + password reset token issuance + consumption (email send stubbed via Pino).
- [ ] Seed script populating admin, 2 editors, 1 organisation, categories enum.
- [ ] Integration tests covering all auth flows and RBAC denials.
- [ ] Audit-log line emitted for every state-changing auth event.
- [ ] `.env.example` updated with `JWT_PRIVATE_KEY`, `JWT_PUBLIC_KEY`, `JWT_ISSUER`, `JWT_AUDIENCE`.

### Acceptance checklist
- Register → login → `/auth/me` returns correct user.
- Logout sets `Set-Cookie: refresh_token=; Max-Age=0` and pushes jti to blocklist.
- Replaying an old refresh after rotation returns 401 with `INVALID_TOKEN`.
- Password change revokes all sessions; the old access token still works for ≤ 15 min (acceptable per security model) but a refresh fails.
- Admin can `POST /users/editors`; new editor receives a console log of the password-set link.
- Rate limit: 11th `/auth/login` from same IP within 1 minute → 429 with `Retry-After`.
- Integration tests cover happy + sad paths; CI green.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| JWT keypair handling differs across envs (PEM line endings) | Store keys as base64 in env; decode at boot. Document in README. |
| Argon2 native binding fails on Alpine Docker image | Use `argon2` npm package with prebuilt binaries; ensure builder stage has `python3 make g++` available. Verify in CI. |
| Mongo unique index on `email` blocks soft-deleted re-registration | Use compound unique index `{ email: 1, deletedAt: 1 }` with partial filter `{ deletedAt: null }`. Test edge case explicitly. |
| Redis sliding-window race conditions | Implement with Redis Lua script (atomic). Or use `rate-limiter-flexible` library if cost-effective. |
| Refresh rotation token theft alarms | Log `refresh_reuse_detected` warnings; in P2, wire to alerting. P1: a Pino log line is sufficient. |
| Email verify links broken locally (no real email) | Print the link to stdout in dev; frontend dev can copy-paste. Document in README. |
| Pwned Passwords integration adds external dependency | Defer to Phase 2 if it adds latency; ship without it in MVP — note in `docs/decisions.md`. |
| Cookie SameSite=strict breaks integration if FE and BE on different ports | Use `Domain=localhost` and SameSite=lax in dev only (toggle via env); strict in staging/prod. |
| Public-author endpoint accidentally leaks PII | Add an explicit `toPublic(user)` function with unit tests asserting shape. |
| Rate limit blocks integration test runs | Tests use a different IP / disable rate-limit middleware in test env (`NODE_ENV=test`). |
