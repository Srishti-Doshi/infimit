import { toast } from '@/components/ui';
import type { ApiError } from '@/types/api';

/**
 * Default user-facing copy for every documented backend error code (plus the
 * client-synthesized `NETWORK_ERROR`). Pages use these directly via
 * `toastError(error)` or override per-field via `mapToFieldError`.
 *
 * Keep keys in sync with `backend/src/shared/errors/errorCodes.ts`.
 */
const MESSAGES: Record<string, string> = {
  // Auth / authz
  UNAUTHORIZED: 'Please sign in to continue.',
  FORBIDDEN: "You don't have access to do that.",
  INVALID_CREDENTIALS: 'Email or password is incorrect.',
  TOKEN_EXPIRED: 'This link has expired. Please request a new one.',
  INVALID_TOKEN: 'This link is no longer valid.',
  INVALID_INTERNAL_KEY: 'Internal authentication failure. Please try again.',
  ACCOUNT_DISABLED: 'This account is disabled. Please contact support.',
  EMAIL_NOT_VERIFIED: 'Please verify your email before signing in.',

  // Identity domain
  EMAIL_EXISTS: 'An account with this email already exists.',
  EMAIL_RECENTLY_DELETED: 'This email was recently in use. Please use a different one.',
  ORGANISATION_NOT_FOUND: "We couldn't find that organisation.",

  // Validation / request shape
  BAD_REQUEST: 'Something about that request was invalid.',
  VALIDATION_ERROR: 'Some fields are invalid. Please check and try again.',
  PAYLOAD_TOO_LARGE: 'That file is too large.',
  UNSUPPORTED_MEDIA_TYPE: "That file type isn't supported.",

  // Resource
  NOT_FOUND: "We couldn't find what you were looking for.",
  CONFLICT: 'That conflicts with an existing record.',
  VERSION_CONFLICT: 'Someone else updated this just now. Refresh and try again.',
  INVALID_STATE: "That action isn't allowed in the current state.",

  // Rate limiting
  RATE_LIMITED: 'Too many attempts. Please try again in a minute.',

  // Upstream / infra
  AI_UNAVAILABLE: 'The AI service is temporarily unavailable.',
  DB_UNAVAILABLE: 'The service is having trouble right now. Please retry shortly.',
  CACHE_UNAVAILABLE: 'The service is having trouble right now. Please retry shortly.',

  // Client-synthesized
  NETWORK_ERROR: "Can't reach the server. Check your connection and try again.",

  // Catch-all
  INTERNAL_ERROR: 'Something went wrong on our end. Please try again.',
};

const FALLBACK = MESSAGES.INTERNAL_ERROR!;

/** Returns the user-facing copy for a given error code, with a sensible fallback. */
export function errorMessage(error: ApiError['error'] | undefined): string {
  if (!error) return FALLBACK;
  return MESSAGES[error.code] ?? FALLBACK;
}

/**
 * Read `Retry-After` (seconds) from the error details, if the apiClient
 * captured it from the response headers. Returns `null` when absent.
 */
export function retryAfterSeconds(error: ApiError['error']): number | null {
  const details = error.details as { retryAfter?: number } | undefined;
  return typeof details?.retryAfter === 'number' ? details.retryAfter : null;
}

/**
 * Fire a `toast.error` with the standard copy. Rate-limited responses include
 * the wait time if the backend sent a `Retry-After` header.
 */
export function toastError(error: ApiError['error']): void {
  if (error.code === 'RATE_LIMITED') {
    const wait = retryAfterSeconds(error);
    if (wait != null) {
      toast.error(`Too many attempts. Try again in ${wait}s.`);
      return;
    }
  }
  toast.error(errorMessage(error));
}

/**
 * Per-form mapping from error code → inline field error. Returns `true` when a
 * mapping fired, so the caller can decide whether to fall back to a toast:
 *
 *     onError: (error) => {
 *       if (mapToFieldError(error, setError, {
 *         EMAIL_EXISTS: { field: 'email', message: '…' },
 *       })) return;
 *       toastError(error);
 *     }
 */
/**
 * Generic over the field name so RHF's `UseFormSetError<T>` (which uses
 * `Path<T>`) typechecks at the call site — the caller's string literal field
 * names are validated against their form's value shape.
 */
export function mapToFieldError<F extends string>(
  error: ApiError['error'],
  setError: (field: F, error: { message: string }) => void,
  mappings: Partial<Record<string, { field: F; message: string }>>,
): boolean {
  const m = mappings[error.code];
  if (!m) return false;
  setError(m.field, { message: m.message });
  return true;
}
