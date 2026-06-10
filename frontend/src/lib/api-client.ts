import type { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import axios, { type AxiosInstance } from 'axios';

import { getAccessToken, useAuthStore } from '@/store/auth-store';
import type { ApiSuccess, ApiError } from '@/types/api';
import type { RefreshPayload } from '@/types/auth';

/**
 * Resolved base URL for the backend API.
 *
 * - When `VITE_USE_MOCK=true` (default in dev), MSW intercepts requests before
 *   they hit the network, so this URL is the request path MSW matches against.
 * - When `VITE_USE_MOCK=false`, requests go to the real backend at this URL.
 *
 * Trailing `/v1` is included so module-level api files compose paths like
 * `apiClient.get('/articles')` without re-stating the version.
 */
const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * Shared axios instance.
 *
 * `withCredentials: true` is required for the refresh-token cookie (httpOnly,
 * SameSite=strict) that Subphase 2 issues. The 10-second timeout protects
 * against hung connections; individual requests can override.
 */
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  withCredentials: true,
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

/**
 * Request interceptor.
 *
 * Injects the in-memory access token as a Bearer header (never localStorage,
 * per docs/10-security.md §10.2) and the `X-Requested-With` header that the
 * backend's CSRF check expects on state-changing requests (§10.1 — the refresh
 * cookie is SameSite=strict, this is the paired custom-header signal).
 */
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`);
  }
  config.headers.set('X-Requested-With', 'XMLHttpRequest');
  return config;
});

/**
 * Endpoints where a 401 is NOT an expired-access-token signal, so we must not
 * try to refresh: the credential flows themselves and the refresh call (which
 * would otherwise recurse).
 */
const REFRESH_BYPASS = ['/auth/login', '/auth/register', '/auth/refresh'];

function isRefreshable(config: InternalAxiosRequestConfig | undefined): boolean {
  const url = config?.url ?? '';
  return !REFRESH_BYPASS.some((path) => url.includes(path));
}

/**
 * Single-flight refresh.
 *
 * A page that fires N requests in parallel and gets N 401s must trigger exactly
 * ONE `/auth/refresh` — all callers await the same in-flight promise. The
 * backend rotates the refresh cookie on every use, so concurrent refreshes
 * would invalidate each other and log the user out (docs/10-security.md §10.2).
 */
let refreshPromise: Promise<string> | null = null;

function refreshAccessToken(): Promise<string> {
  refreshPromise ??= apiClient
    .post<ApiSuccess<RefreshPayload>>('/auth/refresh')
    .then((res) => {
      const { accessToken, user } = res.data.data;
      if (user) {
        useAuthStore.getState().setSession(accessToken, user);
      } else {
        useAuthStore.getState().setAccessToken(accessToken);
      }
      return accessToken;
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

function toApiError(error: AxiosError<ApiError>): ApiError['error'] {
  // Capture `Retry-After` (seconds) so RATE_LIMITED toasts can show a countdown.
  const retryAfterRaw = error.response?.headers?.['retry-after'];
  const retryAfter =
    typeof retryAfterRaw === 'string'
      ? Number(retryAfterRaw)
      : (retryAfterRaw as number | undefined);
  const retryDetail =
    typeof retryAfter === 'number' && !Number.isNaN(retryAfter) ? { retryAfter } : {};

  if (error.response?.data?.success === false) {
    const body = error.response.data.error;
    const baseDetails = (body.details as Record<string, unknown> | undefined) ?? {};
    return { ...body, details: { ...baseDetails, status: error.response.status, ...retryDetail } };
  }
  return {
    code: error.code ?? 'NETWORK_ERROR',
    message: error.message,
    details: { status: error.response?.status, ...retryDetail },
  };
}

/**
 * Response interceptor.
 *
 * 401 vs 403 vs 429 — these are DIFFERENT signals and must NEVER be conflated:
 *
 *   - **401 UNAUTHORIZED** = "your token is invalid or expired". Refresh the
 *     access token (once, for refreshable requests) and replay. If refresh
 *     itself fails, clear the session (route guards then redirect to login)
 *     and surface the original error.
 *
 *   - **403 FORBIDDEN** = "your token is valid; you just lack permission for
 *     this resource". Surface the error to the caller. **Do NOT clear the
 *     session** — the user is still signed in, they just hit a guarded
 *     endpoint. Earlier versions of this file widened the 401 path to
 *     include 403 and bounced users to /auth/login on legitimate role
 *     denials; that bug was fixed and this comment exists to prevent
 *     regression.
 *
 *   - **429 RATE_LIMITED** = "you're hitting this endpoint too fast". Surface
 *     the error with `Retry-After` (parsed below into `details.retryAfter` for
 *     toast countdowns). **Do NOT clear the session** — the user is still
 *     signed in, they just need to slow down. Pinned by a regression test in
 *     `auth-refresh.test.ts` (#20).
 *
 * Only the 401 branch below has session-clear side effects. Any new status
 * code added in the future MUST default to the pass-through `Promise.reject`
 * path — never widen the 401 branch.
 *
 * All rejections are normalized to the `ApiError['error']` shape so consumers
 * branch on a machine-readable `code` and never parse `message`.
 */
apiClient.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError<ApiError>) => {
    const original = error.config as RetriableConfig | undefined;

    if (error.response?.status === 401 && original && !original._retry && isRefreshable(original)) {
      original._retry = true;
      try {
        await refreshAccessToken();
        return await apiClient(original);
      } catch {
        useAuthStore.getState().clear();
      }
    }

    return Promise.reject(toApiError(error));
  },
);
