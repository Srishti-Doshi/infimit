# 🔐 10. Security & Access Control

Security is baked in at every layer — transport, application, data, and operational. This document is the authoritative spec for any engineer touching auth, permissions, or sensitive data.

---

## 10.1 Threat Model (summary)

| Threat | Mitigation |
|--------|------------|
| Credential stuffing | Argon2id hashing, rate limiting, lockout after 10 failures |
| XSS | Strict CSP, sanitize rich-text body, no `dangerouslySetInnerHTML` without DOMPurify |
| CSRF | SameSite=strict cookies + custom header check for state-changing requests |
| SQL / NoSQL injection | Mongoose parameterized queries, no string concatenation, input validation |
| Broken access control | Centralized `roleGuard`, integration tests cover every RBAC path |
| Sensitive data exposure | TLS everywhere, secrets in vault, no PII in logs |
| Insecure direct object reference | Always scope queries by `req.user.id` or role check |
| File upload abuse | MIME whitelist, size cap, virus scan (phase 3), pre-signed URLs |
| SSRF | Egress allowlist for ai-proxy, DNS pinning |
| Denial of service | Rate limiting, circuit breakers, body size caps |

---

## 10.2 Authentication — JWT Strategy

### Token types

| Token | Purpose | Lifetime | Storage |
|-------|---------|----------|---------|
| **Access token** | Every API call | **15 min** | Memory only (frontend) |
| **Refresh token** | Rotate access tokens | **30 days** | httpOnly, Secure, SameSite=strict cookie |
| **Email verify token** | One-time | 24 h | JWT (signed, not stored) |
| **Password reset token** | One-time | 1 h | JWT (signed, single-use via jti blocklist) |

### JWT claims

```json
{
  "sub": "userId",
  "role": "reader|author|editor|admin",
  "orgId": "optional",
  "jti": "unique-id-for-revocation",
  "iat": 1712345678,
  "exp": 1712346578,
  "iss": "infimit",
  "aud": "infimit-api"
}
```

### Rotation & revocation

- Refresh tokens are **rotated on every use** — the old `jti` is immediately revoked.
- On logout, the refresh `jti` is pushed to a Redis blocklist (`blocklist:jti:<jti>`) with TTL = token expiry.
- On password change, all sessions for that user are revoked (`sessions` collection updated with `revokedAt`).
- Access tokens are short-lived, so no blocklist is strictly needed — but critical breaches can push the user's entire access-token generation to a "minimum issuedAt" stored in Mongo and checked on each request.

### Signing

- Algorithm: **RS256** (asymmetric)
- Private key on backend only; public key available if needed for token verification elsewhere
- Keys rotated every 90 days with overlap period

---

## 10.3 Password Policy

- Minimum **10 characters**, at least one letter and one number
- Checked against Pwned Passwords API (k-anonymity lookup)
- Hashed with **Argon2id** (`memoryCost=19456`, `timeCost=2`, `parallelism=1`)
- Never logged, never returned, never stored in plaintext even transiently

---

## 10.4 RBAC Rules

All RBAC is centralized in `middleware/roleGuard.ts`. Routes declare required role(s); the middleware checks `req.user.role`. For resource-scoped rules (e.g., "author can only edit her own draft"), the service layer performs a second check:

```
if (article.authorId !== req.user.id && req.user.role !== 'editor' && req.user.role !== 'admin') {
  throw new ApiError(403, 'FORBIDDEN');
}
```

### Canonical RBAC matrix

| Action | Reader | Author | Editor | Admin |
|--------|:---:|:---:|:---:|:---:|
| Read published articles | ✅ | ✅ | ✅ | ✅ |
| Comment | ✅ | ✅ | ✅ | ✅ |
| Bookmark | ✅ | ✅ | ✅ | ✅ |
| Create draft | ❌ | ✅ | ✅ | ✅ |
| Edit own draft | ❌ | ✅ | ✅ | ✅ |
| Edit others' articles | ❌ | ❌ | ✅ | ✅ |
| Submit for review | ❌ | ✅ | ✅ | ✅ |
| Approve article | ❌ | ❌ | ✅ | ✅ |
| Reject article | ❌ | ❌ | ✅ | ✅ |
| Publish article | ❌ | ❌ | ✅ | ✅ |
| Unpublish any article | ❌ | ❌ | ❌ | ✅ |
| Set placement (featured/trending) | ❌ | ❌ | ✅ | ✅ |
| Delete any article | ❌ | ❌ | ❌ | ✅ |
| Moderate comments | ❌ | ❌ | ✅ | ✅ |
| Upload media (own scope) | ❌ | ✅ | ✅ | ✅ |
| Delete any media | ❌ | ❌ | ❌ | ✅ |
| Manage ads | ❌ | ❌ | ✅ | ✅ |
| Create editor | ❌ | ❌ | ❌ | ✅ |
| Remove editor | ❌ | ❌ | ❌ | ✅ |
| Create organisation | ❌ | ❌ | ❌ | ✅ |
| Upload e-paper | ❌ | ❌ | ❌ | ✅ |
| View platform analytics | ❌ | own | section | ✅ |
| View own analytics | ❌ | ✅ | ✅ | ✅ |

**Editor scoping (phase 2):** editors can optionally be limited to specific categories (`user.sectionsOwned`), and RBAC checks the article's category against that list.

---

## 10.5 Input Validation & Sanitization

- **Every** route has a Zod schema. No request reaches a service without validation.
- Rich-text body is sanitized server-side with **DOMPurify (jsdom)** — whitelist of tags and attributes.
- File uploads check MIME magic bytes, not just the `Content-Type` header.
- URL fields are validated as HTTPS only, rejected if they resolve to private IP ranges (SSRF).

---

## 10.6 Transport & Headers

- **TLS 1.2+** enforced (HSTS `max-age=31536000; includeSubDomains; preload`)
- Security headers via `helmet`:
  - `Content-Security-Policy`: strict, script-src self + CDN, no inline
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`: camera=(), microphone=(), geolocation=()
- **CORS**: allowlist from env. No `*`. Credentials allowed only for known frontend origins.

---

## 10.7 Data Protection

### At rest
- MongoDB encryption at rest (Atlas default)
- S3 bucket encryption (SSE-S3 or SSE-KMS)
- Secrets in AWS Secrets Manager / Vault — never in `.env` on servers

### In transit
- TLS everywhere — including internal hop to AI service (cert pinning inside private VPC)

### PII handling
- Logs scrub email, name, IP
- Author bios & profile images are considered public once the author is verified
- Right-to-be-forgotten: `DELETE /users/me` anonymizes user doc (null PII fields, keep referential integrity) and purges linked bookmarks & notifications

---

## 10.8 Rate Limiting & Abuse Prevention

- Redis-backed sliding window per-IP and per-user (see [API Docs §5.17](05-api-documentation.md#517-rate-limiting))
- Comment endpoint has stricter caps + AI moderation
- Login endpoint implements **exponential backoff** after failed attempts
- Captcha on register & forgot-password (phase 2)

---

## 10.9 Secrets Management

| Secret | Storage | Rotation |
|--------|---------|----------|
| JWT RSA keys | Vault | 90 days |
| Mongo URI | Vault → env at boot | 180 days |
| Redis password | Vault | 180 days |
| S3 IAM keys | IAM role (no keys!) | — |
| AI service internal key | Vault | 30 days |
| SES SMTP credentials | Vault | 180 days |
| Sentry DSN | env | low-sensitivity |

Secrets are **injected at container start** via a sidecar or ECS task role. Never baked into images. Rotation is automated via GitHub Actions + Vault.

---

## 10.10 Audit & Compliance

- **Audit log** (phase 2): every admin action, editor action, and state transition written to `audit_logs` with `actor`, `action`, `target`, `diff`, `at`.
- **Retention:** 1 year.
- **Immutability:** write-only API; admin UI shows read-only history.
- **GDPR/DPIA:** documented in a separate compliance doc; export + delete APIs satisfy data subject rights.

---

## 10.11 Responsible Disclosure

Public `security.txt` file + `security@infimit.com` inbox, routed to the eng lead. Reported vulnerabilities are triaged within 48 h, fixed within 7 days for high severity.
