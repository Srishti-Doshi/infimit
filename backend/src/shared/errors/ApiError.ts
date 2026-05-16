/**
 * ApiError — the only error class controllers/services should throw for
 * HTTP-shaped failures. The global errorHandler middleware translates these
 * into the response envelope from docs/05-api-documentation.md §5.4.
 *
 * Repositories MUST NOT throw ApiError — they throw native Errors or return null.
 * Mapping happens in the service layer.
 */
import { ErrorCode, type ErrorCodeValue } from './errorCodes';

export interface ApiErrorOptions {
  details?: unknown;
  cause?: unknown;
}

export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCodeValue;
  public readonly details?: unknown;
  public readonly isOperational: boolean = true;

  constructor(statusCode: number, code: ErrorCodeValue, message: string, options: ApiErrorOptions = {}) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options.details;
    if (options.cause) (this as { cause?: unknown }).cause = options.cause;
    Error.captureStackTrace?.(this, ApiError);
  }

  toJSON(): { error: { code: ErrorCodeValue; message: string; details?: unknown } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.details !== undefined ? { details: this.details } : {}),
      },
    };
  }

  // Convenience constructors — keep call sites readable.
  static unauthorized(message = 'Authentication required', details?: unknown): ApiError {
    return new ApiError(401, ErrorCode.UNAUTHORIZED, message, { details });
  }

  static forbidden(message = 'Permission denied', details?: unknown): ApiError {
    return new ApiError(403, ErrorCode.FORBIDDEN, message, { details });
  }

  static notFound(message = 'Resource not found', details?: unknown): ApiError {
    return new ApiError(404, ErrorCode.NOT_FOUND, message, { details });
  }

  static badRequest(message = 'Bad request', details?: unknown): ApiError {
    return new ApiError(400, ErrorCode.BAD_REQUEST, message, { details });
  }

  static validation(message = 'Invalid request', details?: unknown): ApiError {
    return new ApiError(422, ErrorCode.VALIDATION_ERROR, message, { details });
  }

  static conflict(message = 'Resource conflict', details?: unknown): ApiError {
    return new ApiError(409, ErrorCode.CONFLICT, message, { details });
  }

  static invalidState(message = 'Operation not allowed in current state', details?: unknown): ApiError {
    return new ApiError(409, ErrorCode.INVALID_STATE, message, { details });
  }

  static rateLimited(message = 'Too many requests', details?: unknown): ApiError {
    return new ApiError(429, ErrorCode.RATE_LIMITED, message, { details });
  }

  static internal(message = 'Internal server error', details?: unknown): ApiError {
    return new ApiError(500, ErrorCode.INTERNAL_ERROR, message, { details });
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}
