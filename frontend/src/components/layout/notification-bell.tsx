import { useQuery } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';

import { listNotifications } from '@/lib/notifications-api';
import { useAuthStore } from '@/store/auth-store';

/**
 * `<NotificationBell>` — header chip that links to the notifications list.
 *
 * Minimum-viable variant per the FE handler doc (Subphase 5 will replace
 * this with a popover preview + filters + mark-all). The bell:
 *
 *   1. Polls `/v1/notifications` every 60s (when the tab is visible — Page
 *      Visibility API lives at the TanStack Query layer via
 *      `refetchOnWindowFocus`). 60s is conservative for P1: no websocket.
 *   2. Shows a red dot + count badge when `unread > 0`.
 *   3. Click → `/dashboard/notifications` (full list page).
 *
 * Rendered only when an authenticated user is signed in.
 */
export function NotificationBell(): JSX.Element | null {
  const user = useAuthStore((s) => s.user);

  const { data } = useQuery({
    queryKey: ['notifications', 'badge'],
    queryFn: () => listNotifications({ limit: 1 }),
    enabled: Boolean(user),
    // Background poll every 60s; only when the tab is focused.
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  if (!user) return null;

  const unread = data?.unread ?? 0;
  const display = unread > 9 ? '9+' : String(unread);
  const ariaLabel = unread === 0 ? 'Notifications, no unread' : `Notifications, ${unread} unread`;

  return (
    <Link
      to="/dashboard/notifications"
      aria-label={ariaLabel}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition-colors hover:bg-surface-subtle hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      <Bell className="h-5 w-5" aria-hidden="true" />
      {unread > 0 ? (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-red-500 px-1 text-[10px] font-medium leading-none text-ink-inverse"
        >
          {display}
        </span>
      ) : null}
    </Link>
  );
}
