import type { AxiosError } from 'axios';
import axios, { type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';

import type { ApiError } from '@/types/api';

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
 * Subphase 1 — passthrough. Subphase 2 injects the access token here from
 * the in-memory auth store. Tokens never live in localStorage per docs/10-security.md §10.1.
 */
apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  return config;
});

/**
 * Response interceptor.
 *
 * Centralizes error transformation so consumers receive an `ApiError`-shaped
 * rejection regardless of whether the failure was network, timeout, or HTTP.
 * Subphase 2 will also intercept 401 here to attempt refresh-token rotation
 * before propagating the error.
 */
apiClient.interceptors.response.use(
  (response) => response,
  (error: AxiosError<ApiError>) => {
    if (error.response?.data?.success === false) {
      return Promise.reject(error.response.data.error);
    }
    return Promise.reject({
      code: error.code ?? 'NETWORK_ERROR',
      message: error.message,
      details: { status: error.response?.status },
    } satisfies ApiError['error']);
  },
);
