/**
 * requireInternalKey — guards backend-internal endpoints meant for
 * service-to-service calls (e.g., AI service callbacks, internal admin tooling).
 *
 * Constant-time string compare avoids timing oracles.
 *
 * Per docs/10-security.md §10.6: X-Internal-Key is a shared secret,
 * rotated quarterly, never logged (see logger.ts redact list).
 */
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { ApiError, ErrorCode } from '@/shared/errors';
import { loadEnv } from '@/config/env';

const env = loadEnv();

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

export const requireInternalKey: RequestHandler = (req: Request, _res: Response, next: NextFunction) => {
  const presented = req.header('x-internal-key');
  if (!presented || !safeEqual(presented, env.AI_INTERNAL_KEY)) {
    return next(new ApiError(401, ErrorCode.INVALID_INTERNAL_KEY, 'Invalid or missing X-Internal-Key'));
  }
  next();
};
