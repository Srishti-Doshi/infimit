/**
 * Stable machine-readable error codes — the FE switches on these.
 *
 * Envelope contract (`{ error: { code, message, details? } }`) is defined
 * in docs/05-api-documentation.md §5.1 and docs/02-system-architecture.md §2.5.
 *
 * Add new codes here ONLY. Renames are breaking changes and require a contract PR.
 */
export const ErrorCode = {
  // Auth / authz
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  TOKEN_EXPIRED: 'TOKEN_EXPIRED',
  INVALID_TOKEN: 'INVALID_TOKEN',
  INVALID_INTERNAL_KEY: 'INVALID_INTERNAL_KEY',

  // Validation / request shape
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',

  // Resource
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  INVALID_STATE: 'INVALID_STATE',

  // Rate limiting
  RATE_LIMITED: 'RATE_LIMITED',

  // Upstreams / infra
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  DB_UNAVAILABLE: 'DB_UNAVAILABLE',
  CACHE_UNAVAILABLE: 'CACHE_UNAVAILABLE',

  // Catch-all
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeKey = keyof typeof ErrorCode;
export type ErrorCodeValue = (typeof ErrorCode)[ErrorCodeKey];
