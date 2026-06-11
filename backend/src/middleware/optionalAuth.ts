/**
 * optionalAuth middleware — verify the access token if present, otherwise
 * pass through without populating `req.user`. Used on endpoints that serve
 * both public and authenticated views from the same path (`GET /v1/articles`
 * returns a public reader list when unauthed and a role-scoped dashboard
 * list when authed; the controller branches on `req.user` presence).
 *
 * Never throws on missing or invalid tokens — that's the whole point.
 * Errors during verification (signature mismatch, expiry, blocklisted jti)
 * silently fall through to public mode so a stale token on the public
 * surface degrades gracefully instead of 401'ing. Real auth gates still
 * use `requireAuth` and surface 401 explicitly.
 */
import type { NextFunction, Request, Response } from 'express';

import { verifyAccessToken } from '@/shared/crypto';
import { isJtiBlocklisted } from '@/modules/auth/blocklist';

const BEARER_PREFIX = 'Bearer ';

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.headers.authorization;
  if (!header || !header.startsWith(BEARER_PREFIX)) {
    next();
    return;
  }

  const token = header.slice(BEARER_PREFIX.length).trim();
  if (!token) {
    next();
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    if (await isJtiBlocklisted(payload.jti)) {
      next();
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
  } catch {
    // Token present but bad — fall through unauthenticated. Public callers
    // with a stale/forged token still see the public view, never a 401.
  }
  next();
}
