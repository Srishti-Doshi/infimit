/**
 * Wraps an async Express handler so rejected promises forward to next().
 * Eliminates try/catch boilerplate in controllers.
 *
 * Usage:
 *   router.get('/x', asyncHandler(async (req, res) => { ... }));
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

export function asyncHandler(fn: AsyncHandler): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
