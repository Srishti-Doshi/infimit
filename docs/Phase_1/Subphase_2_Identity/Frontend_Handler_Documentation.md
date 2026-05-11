# Subphase 2 — Identity & AI Contract Lock · Frontend Handler

**Owner:** Srishti · **Duration:** Week 3–4 · **Tag at exit:** `v0.2.0`

> **Theme of this subphase:** Real authentication — login, register, refresh, role-aware routing, profile UI. By the end, all four user roles can sign in against the real backend and land on a role-specific dashboard shell.

---

## 1. Objectives

1. Ship all auth flows: register, login, logout, refresh, email verification, password reset.
2. Implement an auth store (Zustand) holding access token in memory; refresh token comes via httpOnly cookie.
3. Build role-aware routing: `RequireAuth`, `RequireRole` guards per [`docs/05-api-documentation.md`](../../05-api-documentation.md) §5.16.
4. Wire the typed `apiClient` from Subphase 1 to the **real backend** at `/v1/*`.
5. Render the user profile page (read + edit) and avatar upload UI (presigned URL flow stubbed; real upload in Subphase 3).
6. Switch MSW off by default; keep behind a feature flag for offline dev.

---

## 2. Scope of Work

### In scope
- Pages:
  - `/auth/login`
  - `/auth/register` (reader / author — with org slug selection if author)
  - `/auth/forgot-password`
  - `/auth/reset-password?token=...`
  - `/auth/verify-email?token=...`
  - `/dashboard/me` (profile)
  - `/dashboard/admin/editors` (list + create + remove — admin only)
  - `/dashboard/admin/organisations` (list + create + edit — admin only)
- Components: `AuthForm`, `PasswordStrengthMeter`, `RoleBadge`, `AvatarUploader` (UI only).
- State: `useAuthStore` (Zustand) — access token, user, role, helpers.
- API:
  - `apiClient` refresh-on-401 interceptor (rotates via `/auth/refresh`, then retries once).
  - Resource clients: `auth.api.ts`, `users.api.ts`, `organisations.api.ts`.
- Routing:
  - `<RequireAuth>` HOC / wrapper.
  - `<RequireRole roles={['admin']}>` wrapper.
  - Role-based landing redirect after login (admin → `/dashboard/admin`, editor → `/dashboard/editor`, author → `/dashboard/author`, reader → `/dashboard/me`).
- Forms: React Hook Form + Zod; client-side password rule mirrors backend (≥ 10 chars, 1 letter + 1 number).
- Error handling: map `error.code` from envelope to friendly toasts.

### Out of scope
- Tiptap editor & draft flow → Subphase 3.
- Real avatar upload to S3 → Subphase 3 (UI only this subphase, with TODO).
- Calling AI service endpoints → Subphase 4.

---

## 3. Relevant References

| Topic | Doc |
|-------|-----|
| Auth endpoints (every contract) | [`05-api-documentation.md`](../../05-api-documentation.md) §5.2 |
| Users endpoints | [`05-api-documentation.md`](../../05-api-documentation.md) §5.3 |
| Organisations endpoints | [`05-api-documentation.md`](../../05-api-documentation.md) §5.4 |
| RBAC matrix | [`05-api-documentation.md`](../../05-api-documentation.md) §5.16 |
| JWT strategy (access in memory, refresh httpOnly cookie) | [`10-security.md`](../../10-security.md) §10.2 |
| Password policy | [`10-security.md`](../../10-security.md) §10.3 |
| Session lifecycle | [`07-workflows.md`](../../07-workflows.md) §7.8 |
| Rate-limit awareness | [`05-api-documentation.md`](../../05-api-documentation.md) §5.17 |

---

## 4. Expected Implementation Direction

### Auth store (Zustand) shape

```ts
interface AuthState {
  accessToken: string | null;
  user: { id: string; role: Role; name: string; email: string } | null;
  isHydrated: boolean;
  setSession(token: string, user: User): void;
  clear(): void;
}
```

- **Never persist** the access token to localStorage. Per [`10-security.md`](../../10-security.md) §10.2 it's memory-only.
- Refresh token is in an httpOnly cookie set by `/auth/login` and `/auth/refresh`. JS doesn't touch it.
- On app boot, call `GET /auth/me` (which uses the refresh cookie to rehydrate if access token is gone). If 401, user is logged out.

### `apiClient` interceptor

```ts
// 401 → call /auth/refresh once → retry original request once → if still 401, clear store + redirect
```

- Use a single-flight refresh promise so concurrent 401s share one refresh.
- Skip refresh for `/auth/login`, `/auth/register`, `/auth/refresh` themselves.

### Role-aware routing

```ts
<Route element={<RequireAuth />}>
  <Route element={<RequireRole roles={['admin']} />}>
    <Route path="/dashboard/admin/*" element={<AdminLayout />}>...</Route>
  </Route>
</Route>
```

Redirect rules:
- Unauthenticated user hitting a protected route → `/auth/login?next=<path>`.
- Authenticated user hitting `/auth/login` → role-based landing.
- Wrong role → `403 Forbidden` page.

### Form validation (client-side Zod)

`auth.schema.ts` — mirrors backend Zod where reasonable:

```ts
export const passwordSchema = z.string()
  .min(10, "Min 10 characters")
  .regex(/[A-Za-z]/, "Needs a letter")
  .regex(/[0-9]/, "Needs a number");

export const loginSchema = z.object({ email: z.string().email(), password: passwordSchema });
export const registerSchema = z.object({
  role: z.enum(["reader", "author"]),
  name: z.string().min(2),
  email: z.string().email(),
  password: passwordSchema,
  organisationSlug: z.string().optional(),
}).refine((d) => d.role !== "author" || !!d.organisationSlug, { message: "Authors require organisation" });
```

### Error → UX mapping

| Backend error code | Toast |
|--------------------|-------|
| `EMAIL_EXISTS` | "An account with this email already exists. Try logging in." |
| `INVALID_CREDENTIALS` | "Email or password is incorrect." |
| `ACCOUNT_DISABLED` | "Account disabled. Contact support." |
| `RATE_LIMITED` | "Too many attempts. Try again in a minute." |
| `VALIDATION_ERROR` | Inline form errors from `details` |
| `INTERNAL_ERROR` | "Something went wrong. Please retry." |
| `AI_UNAVAILABLE` | (not applicable this subphase) |

---

## 5. Dependencies

### Blocking
- **Backend Subphase 2 deliverables** — at least `/auth/login`, `/auth/register`, `/auth/refresh`, `/auth/me` must be live for true integration on Day 13.

### Soft
- Backend's seed script (admin + 2 editors) — allows you to log in as each role on integration day.
- Subphase 1 mock handlers — keep MSW available as fallback for solo dev.

### Provides for downstream
- `useAuthStore`, `<RequireAuth>`, `<RequireRole>` — consumed by every protected route in Subphases 3, 4, 5.
- `apiClient` refresh logic — battle-tested before media uploads (Subphase 3) need long-lived sessions.

---

## 6. Suggested Development Order

1. **Day 1** — Auth store (Zustand) skeleton. `apiClient` 401 interceptor with single-flight refresh.
2. **Day 2** — Login page + form (RHF + Zod). Wire to MSW first, then real backend on Day 8.
3. **Day 3** — Register page (reader + author variants). Org slug lookup hint UI.
4. **Day 4** — Forgot password + reset password pages. Verify-email page.
5. **Day 5** — `<RequireAuth>` + `<RequireRole>` + role-based redirects. `403 Forbidden` page.
6. **Day 6** — Profile page (`/dashboard/me`) — view + edit fields, avatar upload UI (stub, no S3 yet).
7. **Day 7** — Admin: editor management + organisation management screens (table + create modal).
8. **Day 8 — Live wire-up checkpoint** — Switch `VITE_USE_MOCK=false` against local backend. Smoke-test all flows.
9. **Day 9** — Refine error toasts; map every backend error code.
10. **Day 10** — Loading + skeleton states; empty states.
11. **Day 11** — Accessibility audit (keyboard nav, ARIA labels on forms).
12. **Day 12** — Component tests (React Testing Library): auth store, RequireAuth guard, login form happy/sad paths.
13. **Day 13 — Integration Day** — End-to-end manual: register reader → log in → log out. Log in as admin → create editor → log in as editor (after backend manually sets password). Verify role-based landing.
14. **Day 14** — Exit review, tag `v0.2.0`.

---

## 7. Important Considerations

- **No tokens in localStorage** — re-state for the team. [`10-security.md`](../../10-security.md) §10.2 is explicit.
- **Single-flight refresh.** A page that fires 5 parallel requests should not trigger 5 refresh calls. Implement a shared promise.
- **Avoid token-leak via interceptors.** The Authorization header must never appear in Sentry breadcrumbs or browser logs.
- **CSRF.** Refresh cookie is SameSite=strict. Any cross-site form using POST should include a custom header (e.g., `X-Requested-With: XMLHttpRequest`) so server's CSRF check passes.
- **Verify email gating.** A registered user can log in but **submit-for-review will fail at backend** if `isEmailVerified=false` per [`07-workflows.md`](../../07-workflows.md) §7.1 validation rules. Show a non-blocking banner urging verification.
- **Password fields** — `autocomplete="new-password"` on register and reset, `autocomplete="current-password"` on login.
- **Rate-limit messaging.** Surface `Retry-After` header into the toast countdown if present.
- **Don't poll `/auth/me`.** Call it once on app boot; otherwise the access token expiry + 401 interceptor handle silent rehydration.

---

## 8. Communication Points with Other Handlers

| With | When | What |
|------|------|------|
| **Backend** | Kickoff | Lock `/v1/auth/*` payloads and error codes. Confirm refresh cookie name (`refresh_token`), domain, SameSite, Secure flags. Confirm `/auth/me` returns the same `{ user }` shape as login. |
| **Backend** | Day 8 | Coordinate live wire-up. Backend handler shares seed credentials (admin email/password). |
| **Backend** | Integration Day | Pair-debug any CORS / cookie / RBAC issues. |
| **AI** | — | No direct comm; AI service still not called from FE. |

---

## 9. Deliverables

- [ ] All auth pages: login, register, forgot, reset, verify-email.
- [ ] Auth store (Zustand) holding access token in memory + user.
- [ ] `apiClient` with single-flight 401-refresh interceptor.
- [ ] Role-aware routing: `RequireAuth`, `RequireRole`, redirects.
- [ ] Profile page (view + edit) with avatar upload UI stub.
- [ ] Admin: editor list + create + remove screens.
- [ ] Admin: organisation list + create + edit screens.
- [ ] Toasts mapping every documented backend error code.
- [ ] MSW handlers updated to match locked backend contract (toggle off by default).
- [ ] Tests: auth store, RequireAuth, login form (happy + sad).
- [ ] `frontend/README.md` updated with auth flow notes and env vars.

### Acceptance checklist
- Logging in as admin / editor / author / reader each redirects to the correct dashboard.
- Refresh works silently on access-token expiry (verify by sleeping or shortening expiry locally).
- Logging out clears state and revokes the cookie (cookie cleared in network tab).
- Wrong role hitting `/dashboard/admin/*` shows 403, not 404.
- Form validation matches backend rules — no submission that the backend would reject.

---

## 10. Risks & Blockers

| Risk | Mitigation |
|------|------------|
| Refresh cookie behaving differently across browsers (Safari) | Test in Safari + Chrome + Firefox on integration day. Backend must set `Secure` + `SameSite=strict` + correct domain. |
| Backend rotation logic invalidates token mid-request burst | Single-flight refresh promise; verify under network throttling. |
| Race between hydration (`/auth/me`) and first protected-route navigation | `isHydrated` flag in auth store; layout shell shows spinner until hydration completes. |
| Email verification token in URL gets leaked via referrer | Pages handling tokens set `<meta name="referrer" content="no-referrer">`. |
| Locked-out test accounts during dev | Backend seed script must be re-runnable to reset; document in `frontend/README.md`. |
| Mismatch between client-side Zod and server-side Zod | Treat backend as source of truth; if a 422 returns details, surface inline and link to backend validation error code. |
| Org slug field UX awkward (author has to know the slug) | Render a typeahead pulling from `/organisations` public list; ship a basic version with just a text input + helper text if typeahead slips. |
