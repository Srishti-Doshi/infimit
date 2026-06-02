/**
 * Notifications service — business logic for the notifications module.
 *
 * Surface:
 *   - sendNotification    — internal helper used by listeners (NOT exposed via HTTP).
 *   - listForUser         — paginated read of the current user's notifications.
 *   - markRead            — flip one notification to read (ownership-enforced).
 *   - markAllRead         — flip every unread notification for the user to read.
 *
 * `sendNotification` is the SINGLE write path. The event listeners in
 * `./listeners.ts` call it; nothing else should. We don't expose a public
 * POST endpoint — notifications are server-emitted, never client-posted.
 */
import { Types } from 'mongoose';

import { auditLog } from '@/shared/audit';
import { ApiError } from '@/shared/errors';

import * as notificationsRepo from './repository';
import type { CreateNotificationInput } from './repository';
import type { NotificationModel } from './model';

// ─── internal: send ─────────────────────────────────────────────────────

export async function sendNotification(input: CreateNotificationInput): Promise<NotificationModel> {
  const notification = await notificationsRepo.createNotification(input);

  auditLog(
    {
      entity: 'notification',
      entityId: notification._id.toString(),
      action: 'sent',
      details: {
        recipient: input.userId.toString(),
        type: input.type,
        channel: input.channel ?? 'in_app',
      },
    },
    'notification_sent',
  );

  return notification;
}

export async function sendNotifications(
  inputs: CreateNotificationInput[],
): Promise<NotificationModel[]> {
  if (inputs.length === 0) return [];
  const created = await notificationsRepo.createMany(inputs);

  // One audit line for the batch, not one per recipient — the metadata
  // includes the recipient list so forensic reconstruction is still
  // possible without spamming the log.
  auditLog(
    {
      entity: 'notification',
      action: 'sent_batch',
      details: {
        count: created.length,
        type: inputs[0]?.type,
        recipients: inputs.map((i) => i.userId.toString()),
      },
    },
    'notification_batch_sent',
  );

  return created;
}

// ─── FE-facing: list ────────────────────────────────────────────────────

export interface ListInput {
  userId: string;
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export async function listForUser(input: ListInput): Promise<{
  items: NotificationModel[];
  total: number;
  unread: number;
  page: number;
  limit: number;
}> {
  const result = await notificationsRepo.listForUser(new Types.ObjectId(input.userId), {
    page: input.page,
    limit: input.limit,
    unreadOnly: input.unreadOnly,
  });

  return {
    items: result.items,
    total: result.total,
    unread: result.unread,
    page: input.page ?? 1,
    limit: input.limit ?? 20,
  };
}

// ─── FE-facing: mark read ───────────────────────────────────────────────

export async function markRead(notificationId: string, userId: string): Promise<NotificationModel> {
  if (!Types.ObjectId.isValid(notificationId)) {
    throw ApiError.notFound('Notification not found');
  }

  const updated = await notificationsRepo.markRead(notificationId, new Types.ObjectId(userId));

  if (!updated) {
    // The match failed because either (a) the id doesn't exist, (b) it
    // belongs to another user, or (c) it was already read. (a)+(b) should
    // surface as 404 (don't leak existence to other users); (c) should be
    // a 200 idempotent success. Re-read to disambiguate.
    const existing = await notificationsRepo.findById(notificationId);
    if (!existing || existing.userId.toString() !== userId) {
      throw ApiError.notFound('Notification not found');
    }
    // Already read — idempotent success.
    return existing;
  }

  return updated;
}

// ─── FE-facing: mark all read ───────────────────────────────────────────

export async function markAllRead(userId: string): Promise<{ updated: number }> {
  const count = await notificationsRepo.markAllRead(new Types.ObjectId(userId));
  return { updated: count };
}
