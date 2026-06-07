/**
 * requireAuth middleware — verify an RS256 access token and populate req.user.
 *
 * Contract:
 *   - Reads `Authorization: Bearer <jwt>` from the request.
 *   - Verifies the JWT signature + standard claims (exp, iat) via shared/crypto.
 *   - Checks the access-token `jti` against the Redis blocklist (closes the
 *     up-to-15-min window where a stolen or shared access token would otherwise
 *     remain usable after `/logout`).
 *   - Populates `req.user` with the AuthContext shape (incl. `jti` + `exp` so
 *     `logoutUser` can blocklist this access token).
 *
 * Errors:
 *   - 401 UNAUTHORIZED when header is missing/malformed, token is invalid,
 *     expired, blocklisted, or has the wrong shape. Generic message — never
 *     reveal whether a failure was signature / expiry / blocklisted to an
 *     attacker.
 *
 * Perf: the blocklist check is a single Redis `EXISTS` (~1ms). Acceptable cost
 * for plugging the post-logout access-token reuse window — see
 * docs/10-security.md §10.2 and issue #28.
 */
import type { NextFunction, Request, Response } from 'express';

import { ApiError } from '@/shared/errors';
import { verifyAccessToken } from '@/shared/crypto';
import { isJtiBlocklisted } from '@/modules/auth/blocklist';

const BEARER_PREFIX = 'Bearer ';

export async function requireAuth(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    next(ApiError.unauthorized('Missing or malformed Authorization header'));
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    next(ApiError.unauthorized('Missing access token'));
    return;
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    // Don't leak whether the failure was signature / expiry / malformed —
    // surface a single generic message to keep error-channel info minimal.
    next(ApiError.unauthorized('Invalid or expired access token'));
    return;
  }

  // Reject tokens whose jti was blocklisted (logout, password change, etc.).
  // Use the same generic message as other auth failures — don't disclose that
  // the token is structurally valid but revoked.
  if (await isJtiBlocklisted(payload.jti)) {
    next(ApiError.unauthorized('Invalid or expired access token'));
    return;
  }

  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    jti: payload.jti,
    exp: payload.exp,
    ...(payload.organisationId ? { organisationId: payload.organisationId } : {}),
  };
  next();
}
