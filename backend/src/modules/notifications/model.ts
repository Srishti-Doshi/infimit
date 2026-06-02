/**
 * Notification model — docs/04-database-design.md §4.2.8.
 *
 * In-app notifications for Subphase 4. Phase 2 adds email fan-out via a
 * background queue + a `channel` discriminator (currently always `in_app`).
 *
 * TTL on `createdAt` (180 days) auto-prunes the collection so it never
 * outgrows its index — read history past six months isn't useful and would
 * accumulate forever otherwise.
 *
 * Listeners (in `./listeners.ts`) persist a notification per fan-out event:
 *  - article.approved   → article_approved   (recipient: author)
 *  - article.rejected   → article_rejected   (recipient: author, body carries reason)
 *  - article.published  → article_published  (recipient: author + capped subscribers in P2)
 *  - article.unpublished → article_unpublished (recipient: author)
 *  - comment.approved   → new_comment        (recipient: article author)
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

export type NotificationType =
  | 'article_approved'
  | 'article_rejected'
  | 'article_published'
  | 'article_unpublished'
  | 'new_comment'
  | 'newsletter'
  | 'system';

export const NOTIFICATION_TYPES: readonly NotificationType[] = [
  'article_approved',
  'article_rejected',
  'article_published',
  'article_unpublished',
  'new_comment',
  'newsletter',
  'system',
];

export type NotificationChannel = 'in_app' | 'email';

export interface NotificationDocument {
  userId: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** Optional deep link the FE renders as the click target. */
  link: string;
  /** Loose typed metadata (article id, comment id, rejection reason, ...) the
   * FE may need without fetching the related entity. */
  metadata: Record<string, unknown>;
  read: boolean;
  readAt: Date | null;
  channel: NotificationChannel;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<NotificationDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    body: { type: String, default: '', trim: true, maxlength: 2000 },
    link: { type: String, default: '', trim: true, maxlength: 500 },
    metadata: { type: Schema.Types.Mixed, default: {} },
    read: { type: Boolean, default: false },
    readAt: { type: Date, default: null },
    channel: { type: String, enum: ['in_app', 'email'], default: 'in_app' },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        r.id = r._id;
        delete r._id;
        return r;
      },
    },
  },
);

// Primary access pattern: list a user's unread notifications, most recent
// first. Combined index covers the common GET /notifications query.
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 }, { name: 'userId_read_createdAt' });

// TTL: auto-purge after 180 days. Old read history isn't valuable enough
// to keep around forever.
const ONE_HUNDRED_EIGHTY_DAYS_SEC = 180 * 24 * 60 * 60;
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: ONE_HUNDRED_EIGHTY_DAYS_SEC, name: 'createdAt_ttl' },
);

export const Notification = model<NotificationDocument>('Notification', NotificationSchema);
export type NotificationModel = HydratedDocument<NotificationDocument>;
