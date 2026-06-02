/**
 * Notification repository — data access for the notifications collection.
 *
 * Thin Mongoose wrappers. Listeners do the bulk-insert at fan-out time;
 * the FE-facing endpoints read via this layer.
 */
import { type FilterQuery, type Types } from 'mongoose';

import {
  Notification,
  type NotificationChannel,
  type NotificationDocument,
  type NotificationModel,
  type NotificationType,
} from './model';

export interface CreateNotificationInput {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;
  metadata?: Record<string, unknown>;
  channel?: NotificationChannel;
}

export async function createNotification(
  input: CreateNotificationInput,
): Promise<NotificationModel> {
  return Notification.create({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? '',
    link: input.link ?? '',
    metadata: input.metadata ?? {},
    channel: input.channel ?? 'in_app',
  });
}

/**
 * Batch create — used by the `article.published` listener when fanning out
 * to a small set of subscribers (Phase 1 caps to ~50 per publish; Phase 2
 * uses a queue).
 */
export async function createMany(inputs: CreateNotificationInput[]): Promise<NotificationModel[]> {
  if (inputs.length === 0) return [];
  const docs = inputs.map((input) => ({
    userId: input.userId,
    type: input.type,
    title: input.title,
    body: input.body ?? '',
    link: input.link ?? '',
    metadata: input.metadata ?? {},
    channel: input.channel ?? 'in_app',
  }));
  return Notification.insertMany(docs) as Promise<NotificationModel[]>;
}

export async function findById(id: Types.ObjectId | string): Promise<NotificationModel | null> {
  return Notification.findById(id).exec();
}

export interface ListOptions {
  page?: number;
  limit?: number;
  unreadOnly?: boolean;
}

export async function listForUser(
  userId: Types.ObjectId,
  options: ListOptions = {},
): Promise<{ items: NotificationModel[]; total: number; unread: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const filter: FilterQuery<NotificationDocument> = { userId };
  if (options.unreadOnly) filter.read = false;

  const [items, total, unread] = await Promise.all([
    Notification.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    Notification.countDocuments(filter).exec(),
    // Unread count is its own query so it stays correct even when the caller
    // asks for the "everything" view (unreadOnly=false). The FE renders an
    // unread badge from this field regardless of which page it requested.
    Notification.countDocuments({ userId, read: false }).exec(),
  ]);

  return { items, total, unread };
}

/**
 * Mark a single notification as read. Returns null if no row matched OR if
 * the row's userId doesn't match `userId` (defense-in-depth — the service
 * also checks ownership). Idempotent: re-marking is a no-op write that
 * leaves `readAt` at the original value.
 */
export async function markRead(
  id: Types.ObjectId | string,
  userId: Types.ObjectId,
): Promise<NotificationModel | null> {
  return Notification.findOneAndUpdate(
    { _id: id, userId, read: false },
    { $set: { read: true, readAt: new Date() } },
    { new: true },
  ).exec();
}

/**
 * Mark every unread notification for a user as read. Returns the count of
 * notifications updated so the caller can echo it back to the FE.
 */
export async function markAllRead(userId: Types.ObjectId): Promise<number> {
  const result = await Notification.updateMany(
    { userId, read: false },
    { $set: { read: true, readAt: new Date() } },
  ).exec();
  return result.modifiedCount;
}
