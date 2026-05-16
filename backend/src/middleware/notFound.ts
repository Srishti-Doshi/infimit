/**
 * 404 fallback — mounted AFTER all routes. Hands an ApiError to errorHandler
 * so the response uses the standard envelope.
 */
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '@/shared/errors';

export function notFound(req: Request, _res: Response, next: NextFunction): void {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}
