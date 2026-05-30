import { apiClient } from './api-client';
import type {
  ForgotPasswordInput,
  LoginInput,
  ReaderRegisterInput,
  UpdateProfileInput,
} from './auth-schema';
import type { ApiSuccess } from '@/types/api';
import type { AuthPayload, User } from '@/types/auth';

/**
 * Auth resource client. Each function unwraps the `{ success, data }` envelope
 * and returns the inner payload; errors arrive already normalized to
 * `ApiError['error']` by the apiClient response interceptor.
 */

/** `POST /auth/login` — sets the refresh cookie and returns the access token + user. */
export async function login(credentials: LoginInput): Promise<AuthPayload> {
  const res = await apiClient.post<ApiSuccess<AuthPayload>>('/auth/login', credentials);
  return res.data.data;
}

/**
 * `POST /auth/register` — creates a reader account. Backend also accepts
 * `role: 'author'` with an `organisationSlug`, but the public signup form is
 * readers-only; authors come in through the institutional onboarding flow.
 */
export async function registerReader(body: ReaderRegisterInput): Promise<AuthPayload> {
  const res = await apiClient.post<ApiSuccess<AuthPayload>>('/auth/register', {
    role: 'reader',
    ...body,
  });
  return res.data.data;
}

/**
 * `POST /auth/forgot-password` — backend always returns 200 even for unknown
 * emails (anti-enumeration), so callers should treat any non-throw as success.
 */
export async function requestPasswordReset(body: ForgotPasswordInput): Promise<void> {
  await apiClient.post('/auth/forgot-password', body);
}

/** `POST /auth/reset-password` — `token` arrives in the reset URL, not the form. */
export async function resetPassword(body: { token: string; password: string }): Promise<void> {
  await apiClient.post('/auth/reset-password', body);
}

/** `POST /auth/verify-email` — single-use token from the verification link. */
export async function verifyEmail(token: string): Promise<void> {
  await apiClient.post('/auth/verify-email', { token });
}

/**
 * `GET /auth/me` — used for boot hydration. A 401 here triggers the
 * single-flight refresh in the apiClient interceptor; if the refresh cookie is
 * present this transparently rotates the token and retries, so a successful
 * resolve here means we now have a live session.
 */
export async function getMe(): Promise<User> {
  const res = await apiClient.get<ApiSuccess<{ user: User }>>('/auth/me');
  return res.data.data.user;
}

/** `PATCH /users/me` — update editable profile fields; returns the new user. */
export async function updateMe(body: UpdateProfileInput): Promise<User> {
  const res = await apiClient.patch<ApiSuccess<{ user: User }>>('/users/me', body);
  return res.data.data.user;
}

/** `POST /auth/logout` — clears the refresh cookie + blocklists the jti. */
export async function logout(): Promise<void> {
  await apiClient.post('/auth/logout');
}
