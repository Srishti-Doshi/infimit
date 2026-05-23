/**
 * requireAuth middleware — verify an RS256 access token and populate req.user.
 *
 * Contract:
 *   - Reads `Authorization: Bearer <jwt>` from the request.
 *   - Verifies the JWT signature + standard claims (exp, iat) via shared/crypto.
 *   - Populates `req.user` with the AuthContext shape.
 *
 * Access tokens are short-lived (15 min) and intentionally NOT blocklisted —
 * the safety margin is acceptable per docs/10-security.md §10.2. Refresh-token
 * revocation (logout, password change) is enforced at the refresh path, not
 * here. By 15 min after revocation, no new access token can be minted.
 *
 * Errors:
 *   - 401 UNAUTHORIZED when header is missing/malformed, token is invalid,
 *     expired, or has the wrong shape. Generic message — never reveal whether
 *     a specific token was "expired vs invalid signature" to an attacker.
 */
import type { NextFunction, Request, Response } from 'express';

import { ApiError } from '@/shared/errors';
import { verifyAccessToken } from '@/shared/crypto';

const BEARER_PREFIX = 'Bearer ';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
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

  req.user = {
    id: payload.sub,
    email: payload.email,
    role: payload.role,
    ...(payload.organisationId ? { organisationId: payload.organisationId } : {}),
  };
  next();
}
