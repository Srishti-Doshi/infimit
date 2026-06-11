/**
 * Analytics controllers — HTTP layer.
 *
 *   POST /v1/analytics/track            🌍/👤 fire-and-forget; 204
 *   GET  /v1/analytics/articles/:id     ✍️📝👑 article stats (auth + RBAC)
 *   GET  /v1/analytics/authors/:id      ✍️📝👑 author stats (auth + RBAC)
 *   GET  /v1/analytics/platform         👑 admin-only platform stats
 *
 * The track endpoint is dual-mode: anonymous callers can fire events (the FE
 * uses this for `view` and `read_complete` on the public article page).
 * `req.user` is optional. The server NEVER trusts a body-supplied userId —
 * `userId` is set from `req.user.id` when present, otherwise null.
 */
import { type Request, type Response } from 'express';

import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import {
  contextFromRequest,
  getArticleStats,
  getAuthorStats,
  getPlatformStats,
  trackEvent,
} from './service';
import type { TrackEventBody } from './validator';

export const trackEventHandler = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as TrackEventBody;
  const ctx = contextFromRequest(req);

  trackEvent({
    type: body.type,
    articleId: body.articleId,
    adId: body.adId,
    sessionId: body.sessionId,
    // Trust ONLY req.user — never the body's userId (which the schema
    // doesn't even surface).
    userId: req.user?.id,
    referrer: body.referrer ?? ctx.referrer,
    userAgent: ctx.userAgent,
    country: ctx.country,
    durationMs: body.durationMs,
  });

  // 204 No Content — fire-and-forget contract per §5.8.
  res.status(204).send();
});

export const getArticleStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const stats = await getArticleStats(id, { id: req.user.id, role: req.user.role });
  res.status(200).json({ success: true, data: { stats } });
});

export const getAuthorStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const stats = await getAuthorStats(id, { id: req.user.id, role: req.user.role });
  res.status(200).json({ success: true, data: { stats } });
});

export const getPlatformStatsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const stats = await getPlatformStats({ role: req.user.role });
  res.status(200).json({ success: true, data: { stats } });
});
