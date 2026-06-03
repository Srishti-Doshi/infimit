import { apiClient } from './api-client';
import type { ApiSuccess } from '@/types/api';
import type { Notification } from '@/types/notification';

/**
 * Notifications resource client (Subphase 4 surface).
 *
 * Read + mark-as-read only — notifications are server-emitted by event
 * listeners (no client POST). All endpoints are user-scoped + authed.
 */

export interface NotificationsListResult {
  items: Notification[];
  total: number;
  /** Count of unread regardless of the current filter. */
  unread: number;
  page?: number;
  limit?: number;
}

export interface ListNotificationsQuery {
  page?: number;
  limit?: number;
  /**
   * When true, only unread notifications are returned. `total` still reflects
   * the filtered count; `unread` always reflects the full unread count for
   * badge rendering.
   */
  unreadOnly?: boolean;
}

/** `GET /v1/notifications` — paginated list with global unread count. */
export async function listNotifications(
  query: ListNotificationsQuery = {},
): Promise<NotificationsListResult> {
  const res = await apiClient.get<ApiSuccess<NotificationsListResult>>('/notifications', {
    params: query,
  });
  return res.data.data;
}

/** `POST /v1/notifications/:id/read` — idempotent mark-as-read on a single notification. */
export async function markNotificationRead(id: string): Promise<Notification> {
  const res = await apiClient.post<ApiSuccess<{ notification: Notification }>>(
    `/notifications/${id}/read`,
  );
  return res.data.data.notification;
}

/** `POST /v1/notifications/read-all` — bulk mark-read; returns the count flipped. */
export async function markAllNotificationsRead(): Promise<{ updated: number }> {
  const res = await apiClient.post<ApiSuccess<{ updated: number }>>('/notifications/read-all');
  return res.data.data;
}
