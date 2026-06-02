/**
 * Notifications routes — Subphase 4.
 *
 * Endpoints (all authenticated, all user-scoped):
 *   GET    /v1/notifications                — list current user's notifications
 *   POST   /v1/notifications/:id/read       — mark one as read
 *   POST   /v1/notifications/read-all       — mark every unread as read
 *
 * No POST creation endpoint — notifications are server-emitted by event
 * listeners (see `./listeners.ts`), never client-posted.
 */
import { Router } from 'express';

import { requireAuth, validate } from '@/middleware';

import { listNotificationsHandler, markAllReadHandler, markReadHandler } from './controller';
import { listNotificationsQuerySchema, notificationIdParamSchema } from './validator';

const router = Router();

router.get(
  '/',
  requireAuth,
  validate({ query: listNotificationsQuerySchema }),
  listNotificationsHandler,
);

// `read-all` must come BEFORE `:id/read` so Express doesn't match "read-all"
// as the `:id` segment.
router.post('/read-all', requireAuth, markAllReadHandler);

router.post(
  '/:id/read',
  requireAuth,
  validate({ params: notificationIdParamSchema }),
  markReadHandler,
);

export default router;
