/**
 * requireAuth middleware — Subphase 1 SKELETON.
 *
 * Real JWT verification lands in Subphase 2 (per Backend_Handler_Documentation
 * for Subphase 2 §4). The contract here is intentional:
 *  - throws ApiError.unauthorized() if no/invalid token
 *  - populates `req.user` (AuthContext) on success
 *
 * For Subphase 1 the function is wired but no protected routes exist; this
 * keeps the surface area locked so Subphase 2 only fills the body.
 */
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '@/shared/errors';

export function requireAuth(_req: Request, _res: Response, next: NextFunction): void {
  // Subphase 2 will:
  //  1. read Authorization: Bearer <jwt>
  //  2. verify against JWT_ACCESS_SECRET
  //  3. assign req.user = { id, role, email, organisationId? }
  next(ApiError.unauthorized('Authentication not yet implemented (Subphase 2)'));
}
