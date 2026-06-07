import { useMutation } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';

import { Button, toast } from '@/components/ui';
import { logout } from '@/lib/auth-api';
import { cn } from '@/lib/cn';
import { useRoleNav } from '@/lib/use-role-nav';
import { useAuthStore } from '@/store/auth-store';

import { WriteArticleButton } from './write-article-button';

/**
 * DashboardSidebar — persistent left-rail navigation on `/dashboard/*` routes.
 *
 * Hidden below `lg` (mobile users get the hamburger drawer `Sidebar` instead);
 * visible from `lg` as a sticky `w-64` column. Reads the role-aware link set
 * from `useRoleNav` so the same list of entries shows in both surfaces.
 *
 * Sign-out follows the same mutation shape as `/dashboard/me` — clear the
 * store on `onSettled` so a network blip during logout doesn't leave the
 * user in a half-signed-in state.
 */
export function DashboardSidebar(): JSX.Element | null {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { roleLabel, items } = useRoleNav();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      useAuthStore.getState().clear();
      toast.success('Signed out');
      navigate('/', { replace: true });
    },
  });

  // `RequireAuth` gates dashboard routes, so `user` is normally non-null —
  // bail safely if the store is momentarily empty during a logout flush.
  if (!user) return null;

  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-line bg-surface-subtle lg:flex">
      {/* Sticky behavior intentionally deferred: would slide behind the existing
          sticky <Header> (z-30, ~170px tall at lg+). Properly fixing it needs a
          header-height CSS variable or AppLayout restructuring — filed as a
          follow-up polish item (Subphase 5 chrome scope). */}
      <div className="border-b border-line px-4 py-4">
        <p className="text-body-xs font-semibold uppercase tracking-wider text-ink-tertiary">
          Signed in as
        </p>
        <p className="mt-0.5 font-display text-body-lg font-semibold text-ink-primary">
          {roleLabel}
        </p>
        <p className="truncate text-body-sm text-ink-secondary" title={user.name}>
          {user.name}
        </p>
      </div>

      {/* Primary CTA — only renders for roles that can create drafts. Closes #53. */}
      <div className="border-b border-line p-3">
        <WriteArticleButton />
      </div>

      <nav aria-label="Dashboard navigation" className="flex-1 overflow-y-auto py-3">
        <ul>
          {items.map((item) => (
            <li key={item.href}>
              <NavLink
                to={item.href}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-3 px-4 py-2.5 text-body-sm transition-colors',
                    isActive
                      ? 'bg-surface font-semibold text-ink-primary'
                      : 'text-ink-secondary hover:bg-surface hover:text-ink-primary',
                  )
                }
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="border-t border-line p-3">
        <Button
          type="button"
          variant="outline"
          size="md"
          className="w-full"
          iconLeft={<LogOut className="h-4 w-4" aria-hidden="true" />}
          loading={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          Sign out
        </Button>
      </div>
    </aside>
  );
}
