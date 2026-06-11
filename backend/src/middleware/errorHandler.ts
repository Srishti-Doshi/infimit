/**
 * Global error handler.
 *
 * - ApiError → its statusCode + structured envelope
 * - ZodError → 422 VALIDATION_ERROR with flattened issues (defense-in-depth;
 *              validate() middleware should catch first)
 * - Mongoose ValidationError → 422 VALIDATION_ERROR
 * - Mongoose CastError → 422 VALIDATION_ERROR ("invalid <path>")
 *   (Routed through ApiError.validation for envelope consistency. If the
 *    contract ever needs 400 BAD_REQUEST for malformed-id cases, switch this
 *    branch only — call sites won't change.)
 * - duplicate key (E11000) → 409 CONFLICT
 * - anything else → 500 INTERNAL_ERROR (message scrubbed in non-dev)
 *
 * Always emits the envelope from docs/05-api-documentation.md §5.4:
 *   { success: false, error: { code, message, details? }, requestId }
 *
 * The `success: false` flag mirrors the `success: true` flag on success
 * responses. The FE's axios interceptor branches on this flag to distinguish
 * a server-shaped error envelope (where `error.code` is machine-readable)
 * from a network/transport error (where it falls back to `NETWORK_ERROR`).
 * See frontend/src/lib/api-client.ts:106 in PR #5 for the consumer side.
 *
 * Per Express convention, must accept 4 args to be recognised as an error handler.
 */
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { ApiError, ErrorCode, isApiError } from '@/shared/errors';
import { loadEnv } from '@/config/env';
import { captureException } from '@/config/sentry';

const env = loadEnv();

interface MongoDuplicateKeyError {
  code: 11000;
  keyValue?: Record<string, unknown>;
}

function isDuplicateKeyError(err: unknown): err is MongoDuplicateKeyError {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const log = req.log ?? console;

  let apiErr: ApiError;

  if (isApiError(err)) {
    apiErr = err;
  } else if (err instanceof ZodError) {
    apiErr = ApiError.validation('Validation failed', err.flatten());
  } else if (err instanceof mongoose.Error.ValidationError) {
    apiErr = ApiError.validation('Validation failed', err.errors);
  } else if (err instanceof mongoose.Error.CastError) {
    apiErr = ApiError.validation(`Invalid ${err.path}: ${err.value}`);
  } else if (isDuplicateKeyError(err)) {
    apiErr = new ApiError(409, ErrorCode.CONFLICT, 'Duplicate key', {
      details: err.keyValue,
    });
  } else {
    const message =
      env.NODE_ENV === 'production'
        ? 'Internal server error'
        : ((err as Error)?.message ?? 'Unknown error');
    apiErr = ApiError.internal(message);
  }

  // Log everything; level chosen by class of error.
  if (apiErr.statusCode >= 500) {
    log.error({ err, requestId: req.requestId, code: apiErr.code }, 'unhandled_error');
    // Mirror 5xx to Sentry. No-op when SENTRY_DSN is unset (dev / test); in
    // production this is the canonical bug-reporting path. 4xx are not
    // reported — they're client-shape failures, not server bugs.
    captureException(err, {
      requestId: req.requestId,
      code: apiErr.code,
      path: req.path,
      method: req.method,
    });
  } else if (apiErr.statusCode >= 400) {
    log.warn(
      { err: { message: apiErr.message, code: apiErr.code }, requestId: req.requestId },
      'request_failed',
    );
  }

  // Surface retryAfterSec as the standard `Retry-After` header on 429s so HTTP
  // clients (browsers, axios, etc.) can honor it without parsing the body.
  if (apiErr.statusCode === 429) {
    const details = apiErr.details as { retryAfterSec?: unknown } | undefined;
    const retryAfterSec = typeof details?.retryAfterSec === 'number' ? details.retryAfterSec : null;
    if (retryAfterSec !== null) {
      res.setHeader('Retry-After', String(retryAfterSec));
    }
  }

  res.status(apiErr.statusCode).json({
    success: false,
    ...apiErr.toJSON(),
    requestId: req.requestId,
  });
};
