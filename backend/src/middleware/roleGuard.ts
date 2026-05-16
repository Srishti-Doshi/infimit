/**
 * requireRole(...allowed) — Subphase 1 SKELETON.
 *
 * Composed AFTER requireAuth. Asserts req.user.role ∈ allowed.
 * Per docs/10-security.md §10.4 role hierarchy:
 *   reader < author < editor < admin
 *
 * The check is exact-match, not hierarchical — explicit grants per route.
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ApiError } from '@/shared/errors';
import type { UserRole } from '@/shared/types';

export function requireRole(...allowed: UserRole[]): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!allowed.includes(req.user.role)) {
      return next(ApiError.forbidden(`Role '${req.user.role}' is not permitted`));
    }
    next();
  };
}
