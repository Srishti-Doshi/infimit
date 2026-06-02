/**
 * Zod schemas for the notifications module.
 *
 * Notifications are created by event listeners (server-side), not by direct
 * client requests, so there's no `postNotificationBodySchema`. The FE only
 * READS notifications (list) and FLIPS the read flag.
 */
import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;

/** Path-param: 24-char hex ObjectId for the `/:id/read` endpoint. */
export const notificationIdParamSchema = z.object({
  id: z.string().regex(objectIdRegex, 'Invalid notification id'),
});

/**
 * Pagination + optional `unreadOnly` filter for `GET /notifications`.
 * `unreadOnly=true` is the natural default UX: the FE wants the unread
 * badge count or the unread feed. `unreadOnly=false` returns all
 * notifications (read + unread) for an "everything" view.
 */
export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  unreadOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === 'true' || v === true),
});
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;
