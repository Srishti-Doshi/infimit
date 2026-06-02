/**
 * Notifications controllers — HTTP layer.
 *
 * Every endpoint requires authentication. Notifications are scoped to the
 * authenticated user — there's no admin-cross-user view in P1.
 */
import { type Request, type Response } from 'express';

import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import { listForUser, markAllRead, markRead } from './service';
import type { ListNotificationsQuery } from './validator';

export const listNotificationsHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  // Cast through unknown — validate() middleware has replaced req.query with
  // the parsed + transformed schema output, but TS sees the raw `ParsedQs`
  // type at the route boundary. The runtime types match.
  const query = req.query as unknown as ListNotificationsQuery;
  const result = await listForUser({
    userId: req.user.id,
    page: query.page,
    limit: query.limit,
    unreadOnly: query.unreadOnly ?? false,
  });
  res.status(200).json({
    success: true,
    data: {
      items: result.items.map((n) => n.toJSON()),
      total: result.total,
      unread: result.unread,
      page: result.page,
      limit: result.limit,
    },
  });
});

export const markReadHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const notification = await markRead(id, req.user.id);
  res.status(200).json({ success: true, data: { notification: notification.toJSON() } });
});

export const markAllReadHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const result = await markAllRead(req.user.id);
  res.status(200).json({ success: true, data: result });
});
