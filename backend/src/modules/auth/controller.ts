/**
 * Auth controllers — HTTP layer.
 *
 * Each handler parses the request via its Zod validator, calls the service,
 * and serialises the result through the envelope contract from docs/05-api §5.
 * Cookie handling (refresh_token) lives at this layer so the service stays
 * transport-agnostic.
 */
import { type Request, type Response } from 'express';

import { loadEnv } from '@/config/env';
import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import {
  getCurrentUser,
  loginUser,
  logoutUser,
  refreshTokens,
  registerUser,
  requestPasswordReset,
  resetPassword,
  verifyEmail,
} from './service';
import {
  forgotPasswordBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
  verifyEmailBodySchema,
} from './validator';

const REFRESH_COOKIE_NAME = 'refresh_token';
const REFRESH_COOKIE_PATH = '/v1/auth';

/**
 * Set the refresh-token cookie per docs/10-security.md §10.2:
 *   - HttpOnly: not readable by JS
 *   - Secure: HTTPS-only in production
 *   - SameSite=Strict: blocks cross-site CSRF replays
 *   - Path=/v1/auth: scoped to the refresh + logout endpoints only
 */
function setRefreshCookie(res: Response, refreshToken: string, maxAgeSeconds: number): void {
  const env = loadEnv();
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
    maxAge: maxAgeSeconds * 1000,
  });
}

function clearRefreshCookie(res: Response): void {
  const env = loadEnv();
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: REFRESH_COOKIE_PATH,
  });
}

// ─── handlers ────────────────────────────────────────────────────────────

export const register = asyncHandler(async (req: Request, res: Response) => {
  const body = registerBodySchema.parse(req.body);
  const { user, tokens } = await registerUser(body, req);

  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresIn);

  res.status(201).json({
    success: true,
    data: {
      user: user.toJSON(),
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    },
  });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const body = loginBodySchema.parse(req.body);
  const { user, tokens } = await loginUser(body, req);

  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresIn);

  res.status(200).json({
    success: true,
    data: {
      user: user.toJSON(),
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    },
  });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const cookie = req.cookies?.[REFRESH_COOKIE_NAME];
  if (typeof cookie !== 'string' || !cookie) {
    throw ApiError.unauthorized('Missing refresh-token cookie');
  }
  const { user, tokens } = await refreshTokens(cookie, req);

  setRefreshCookie(res, tokens.refreshToken, tokens.refreshExpiresIn);

  res.status(200).json({
    success: true,
    data: {
      user: user.toJSON(),
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
    },
  });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const cookie = req.cookies?.[REFRESH_COOKIE_NAME];
  await logoutUser(
    typeof cookie === 'string' ? cookie : undefined,
    req.user.jti,
    req.user.exp,
    req.user.id,
  );
  clearRefreshCookie(res);
  res.status(204).send();
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const user = await getCurrentUser(req.user.id);
  res.status(200).json({
    success: true,
    data: { user: user.toJSON() },
  });
});

export const verifyEmailHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = verifyEmailBodySchema.parse(req.body);
  const { user } = await verifyEmail(body.token);
  res.status(200).json({
    success: true,
    data: { user: user.toJSON() },
  });
});

export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  const body = forgotPasswordBodySchema.parse(req.body);
  await requestPasswordReset(body.email);
  // Same response regardless of whether email exists — prevents enumeration.
  res.status(200).json({
    success: true,
    data: { sent: true },
  });
});

export const resetPasswordHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = resetPasswordBodySchema.parse(req.body);
  await resetPassword(body.token, body.password);
  res.status(200).json({
    success: true,
    data: { reset: true },
  });
});
