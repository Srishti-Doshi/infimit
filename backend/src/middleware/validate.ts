/**
 * validate(schemas) — Zod-driven request validator.
 *
 * Each segment (body/query/params) is optional. Validated values REPLACE
 * the originals so handlers downstream can rely on the typed shape.
 *
 * Throws ApiError.validation on failure (422); the global error handler
 * formats the envelope.
 *
 * Usage:
 *   router.post('/articles',
 *     validate({ body: CreateArticleSchema }),
 *     controller.create);
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { ApiError } from '@/shared/errors';

export interface ValidationSchemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

export function validate(schemas: ValidationSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const issues: Record<string, unknown> = {};

    if (schemas.body) {
      const r = schemas.body.safeParse(req.body);
      if (!r.success) issues.body = r.error.flatten();
      else req.body = r.data;
    }

    if (schemas.query) {
      const r = schemas.query.safeParse(req.query);
      if (!r.success) issues.query = r.error.flatten();
      else req.query = r.data as Request['query'];
    }

    if (schemas.params) {
      const r = schemas.params.safeParse(req.params);
      if (!r.success) issues.params = r.error.flatten();
      else req.params = r.data as Request['params'];
    }

    if (Object.keys(issues).length > 0) {
      return next(ApiError.validation('Request validation failed', issues));
    }

    next();
  };
}
