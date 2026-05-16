/**
 * notImplemented(subphase) — placeholder route handler.
 *
 * Returns the standard error envelope with code = INTERNAL_ERROR and
 * a message naming the subphase that delivers the real implementation.
 *
 * Mounted on skeleton routes so the API surface is reachable for
 * contract testing and frontend mocking, but never silently succeeds.
 */
import type { RequestHandler } from 'express';
import { ApiError, ErrorCode } from '@/shared/errors';

export function notImplemented(targetSubphase: string): RequestHandler {
  return (_req, _res, next) => {
    next(
      new ApiError(
        501,
        ErrorCode.INTERNAL_ERROR,
        `Not implemented — delivered in ${targetSubphase}`,
      ),
    );
  };
}
