/**
 * Notification domain types. Mirror the backend model
 * (`backend/src/modules/notifications/model.ts`).
 *
 * Notifications are server-emitted by event listeners — there's no
 * client-creation endpoint. The FE only reads + marks-as-read.
 */

export type NotificationType =
  | 'article_approved'
  | 'article_rejected'
  | 'article_published'
  | 'article_unpublished'
  | 'new_comment'
  | 'newsletter'
  | 'system';

export type NotificationChannel = 'in_app' | 'email';

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Optional deep link the FE renders as the click target. */
  link: string;
  /**
   * Loose typed metadata (article id, comment id, rejection reason, ...).
   * The FE branches on `type` first; this object carries the typed details.
   */
  metadata: Record<string, unknown>;
  read: boolean;
  readAt: string | null;
  channel: NotificationChannel;
  createdAt: string;
  updatedAt: string;
}
