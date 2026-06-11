/**
 * Analytics routes — docs/05-api-documentation.md §5.8.
 *
 *   POST /v1/analytics/track            🌍/👤  optionalAuth; 204 fire-and-forget
 *   GET  /v1/analytics/articles/:id     ✍️📝👑 requireAuth; service applies RBAC
 *   GET  /v1/analytics/authors/:id      ✍️📝👑 requireAuth; service applies RBAC
 *   GET  /v1/analytics/platform         👑     requireAuth + admin (service)
 *
 * Track uses `optionalAuth` so anonymous events flow through with no
 * `req.user`; the service sets `userId: null` in that case. Read endpoints
 * use `requireAuth` (no anonymous access) plus role gates inside the service
 * (defence in depth).
 */
import { Router } from 'express';

import { optionalAuth, requireAuth, validate } from '@/middleware';

import {
  getArticleStatsHandler,
  getAuthorStatsHandler,
  getPlatformStatsHandler,
  trackEventHandler,
} from './controller';
import { idParamSchema, trackEventBodySchema } from './validator';

const router = Router();

router.post('/track', optionalAuth, validate({ body: trackEventBodySchema }), trackEventHandler);

router.get(
  '/articles/:id',
  requireAuth,
  validate({ params: idParamSchema }),
  getArticleStatsHandler,
);
router.get('/authors/:id', requireAuth, validate({ params: idParamSchema }), getAuthorStatsHandler);
router.get('/platform', requireAuth, getPlatformStatsHandler);

export default router;
