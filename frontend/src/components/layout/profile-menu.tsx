import { useMutation } from '@tanstack/react-query';
import { ChevronDown, LogOut, User as UserIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { toast } from '@/components/ui';
import { logout } from '@/lib/auth-api';
import { useAuthStore } from '@/store/auth-store';
import type { User } from '@/types/auth';

interface ProfileMenuProps {
  user: User;
}

/**
 * Header-mounted profile dropdown.
 *
 * Replaces the public "Login / Sign up" CTAs whenever a user is in the auth
 * store. Visible across every route — including all dashboard surfaces —
 * which gives Sign out a global affordance that #38 flagged as missing
 * (pre-fix it lived only on `/dashboard/me`). The trigger button shows the
 * user's initials in a circular avatar; the open menu surfaces full name +
 * email + a Profile link + a Sign out button.
 *
 * No Radix DropdownMenu dependency — kept lightweight with a manual outside-
 * click + Escape handler since the menu is just 2 entries. If we add a
 * third or fourth surface that needs a proper keyboard-navigable popover,
 * promote to `@radix-ui/react-dropdown-menu` at that point.
 *
 * Closes #37 (CTAs persist after auth) + #38 (Sign out global).
 */
export function ProfileMenu({ user }: ProfileMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Outside-click + Escape close. Mouse-down (not click) so a same-tick
  // toggle on the trigger doesn't immediately re-close the menu.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent): void {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const logoutMutation = useMutation({
    mutationFn: logout,
    // Same pattern as `pages/dashboard/me.tsx`: clear the local store on
    // settled regardless of server outcome — the user has signaled intent.
    onSettled: () => {
      useAuthStore.getState().clear();
      setOpen(false);
      toast.success('Signed out');
      navigate('/', { replace: true });
    },
  });

  const initials = initialsOf(user.name);

  return (
    <div ref={wrapperRef} className="relative ml-1 hidden md:flex">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Open profile menu"
        className="inline-flex items-center gap-1.5 rounded-md p-0.5 text-ink-primary transition-colors hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red-500"
      >
        <span
          aria-hidden="true"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface-rose-tint font-display text-body-sm font-semibold text-brand-red-600"
        >
          {initials}
        </span>
        <ChevronDown className="h-4 w-4 text-ink-tertiary" aria-hidden="true" />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Profile actions"
          className="absolute right-0 top-full z-40 mt-2 w-64 overflow-hidden rounded-md border border-line bg-surface shadow-elev-2"
        >
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-body-sm font-medium text-ink-primary">{user.name}</p>
            <p className="mt-0.5 truncate text-body-xs text-ink-tertiary">{user.email}</p>
            <p className="mt-1 text-body-xs font-medium uppercase tracking-wide text-brand-red-500">
              {user.role}
            </p>
          </div>
          <ul className="py-1">
            <li role="none">
              <Link
                to="/dashboard/me"
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2 text-body-sm text-ink-primary transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none"
              >
                <UserIcon className="h-4 w-4 text-ink-tertiary" aria-hidden="true" />
                Profile
              </Link>
            </li>
            <li role="none">
              <button
                type="button"
                role="menuitem"
                disabled={logoutMutation.isPending}
                onClick={() => logoutMutation.mutate()}
                className="flex w-full items-center gap-2 px-4 py-2 text-left text-body-sm text-ink-primary transition-colors hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <LogOut className="h-4 w-4 text-ink-tertiary" aria-hidden="true" />
                {logoutMutation.isPending ? 'Signing out…' : 'Sign out'}
              </button>
            </li>
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** First letters of up to two name tokens (matches `pages/dashboard/me.tsx`). */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}
