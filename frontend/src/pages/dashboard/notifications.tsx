import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, Check, CheckCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Card, CardBody, Container, EmptyState, Skeleton, toast } from '@/components/ui';
import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/notifications-api';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Notification, NotificationType } from '@/types/notification';

/**
 * `/dashboard/notifications` — minimal viable list per FE handler doc.
 *
 * Surfaces every notification (read + unread), newest first. Each row has a
 * single "Mark read" affordance on unread entries; the header carries a
 * "Mark all read" CTA when there's at least one unread.
 *
 * Subphase 5 polishes this (filters by type, infinite scroll, time-grouping).
 * For Subphase 4 the surface is functional: bell badge stays accurate +
 * the user can clear it.
 */
export default function NotificationsPage(): JSX.Element {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'list'],
    queryFn: () => listNotifications(),
  });

  const items = data?.items ?? [];
  const unread = data?.unread ?? 0;

  const invalidate = (): Promise<void> =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['notifications', 'list'] }),
      queryClient.invalidateQueries({ queryKey: ['notifications', 'badge'] }),
    ]).then(() => undefined);

  const markOne = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: () => invalidate(),
    onError: (error: ApiError['error']) => toastError(error),
  });

  const markAll = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: async ({ updated }) => {
      await invalidate();
      toast.success(`Marked ${updated} notifications as read.`);
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  return (
    <Container width="default" className="py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display-md font-semibold text-ink-primary">
            Notifications
          </h1>
          <p className="mt-2 text-body-base text-ink-secondary">
            Activity on your articles, comments on your pieces, and platform updates.
          </p>
        </div>
        {unread > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<CheckCheck className="h-4 w-4" aria-hidden="true" />}
            onClick={() => markAll.mutate()}
            disabled={markAll.isPending}
          >
            {markAll.isPending ? 'Marking…' : 'Mark all read'}
          </Button>
        ) : null}
      </header>

      <Card className="mt-8">
        <CardBody className="p-0">
          {isLoading ? (
            <NotificationSkeletons />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Bell className="h-6 w-6" aria-hidden="true" />}
              title="No notifications yet"
              description="When something happens on your articles or comments, it'll show up here."
            />
          ) : (
            <ul className="divide-y divide-line">
              {items.map((n) => (
                <NotificationItem
                  key={n.id}
                  notification={n}
                  isProcessing={markOne.isPending && markOne.variables === n.id}
                  onMarkRead={() => markOne.mutate(n.id)}
                />
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </Container>
  );
}

interface NotificationItemProps {
  notification: Notification;
  isProcessing: boolean;
  onMarkRead: () => void;
}

function NotificationItem({
  notification,
  isProcessing,
  onMarkRead,
}: NotificationItemProps): JSX.Element {
  const Inner = (
    <div className="flex items-start gap-3">
      <span
        aria-hidden="true"
        className={
          notification.read
            ? 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-line'
            : 'mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-red-500'
        }
      />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-medium text-ink-primary">
          {notification.title}
          <span className="ml-2 text-body-xs font-normal text-ink-tertiary">
            {TYPE_LABEL[notification.type]}
          </span>
        </p>
        {notification.body ? (
          <p className="mt-1 text-body-sm text-ink-secondary line-clamp-2">{notification.body}</p>
        ) : null}
        <p className="mt-1.5 text-body-xs text-ink-tertiary">
          {relativeTime(notification.createdAt)}
        </p>
      </div>
      {!notification.read ? (
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={(e) => {
            e.preventDefault();
            onMarkRead();
          }}
          disabled={isProcessing}
        >
          Mark read
        </Button>
      ) : null}
    </div>
  );

  return (
    <li
      className={
        notification.read ? 'px-5 py-4' : 'bg-brand-red-50/30 px-5 py-4 hover:bg-brand-red-50/50'
      }
    >
      {notification.link ? (
        // Click-through to the linked entity. Links are server-supplied so
        // they're safe — but we treat them as same-origin only by leaving
        // `target` unset (router catches client-side routes; everything else
        // is a plain navigation).
        <Link to={notification.link} className="block">
          {Inner}
        </Link>
      ) : (
        Inner
      )}
    </li>
  );
}

const TYPE_LABEL: Readonly<Record<NotificationType, string>> = {
  article_approved: 'Article approved',
  article_rejected: 'Article rejected',
  article_published: 'Article published',
  article_unpublished: 'Article unpublished',
  new_comment: 'New comment',
  newsletter: 'Newsletter',
  system: 'System',
};

function NotificationSkeletons(): JSX.Element {
  return (
    <ul className="divide-y divide-line" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="px-5 py-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="mt-2 h-3 w-1/2" />
        </li>
      ))}
    </ul>
  );
}

function relativeTime(iso: string): string {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, 'day');
}
