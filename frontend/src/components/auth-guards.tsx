import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { Spinner } from '@/components/ui';
import { roleLanding } from '@/lib/role-landing';
import { useAuthStore } from '@/store/auth-store';
import type { Role } from '@/types/auth';

/**
 * Centered route-level spinner shown while boot hydration is in flight on a
 * protected route. Inside the AppLayout chrome, so header/footer stay visible.
 */
function RouteSpinner(): JSX.Element {
  return (
    <div className="flex min-h-[50vh] items-center justify-center text-brand-red-500">
      <Spinner size="lg" label="Loading" />
    </div>
  );
}

/**
 * `RequireAuth` — protect everything authenticated. Pre-hydration shows a
 * spinner; post-hydration redirects guests to `/auth/login?next=<here>`.
 */
export function RequireAuth(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  const location = useLocation();

  if (!isHydrated) return <RouteSpinner />;
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }
  return <Outlet />;
}

/**
 * `RequireRole` — assumes a parent `<RequireAuth>` has already enforced
 * authentication. Sends mismatched roles to `/forbidden` (403 page).
 */
export function RequireRole({ roles }: { roles: Role[] }): JSX.Element {
  const user = useAuthStore((s) => s.user);
  if (!user) return <RouteSpinner />;
  if (!roles.includes(user.role)) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}

/**
 * `RedirectIfAuthed` — guard wrapping guest-only routes (login/register).
 * While hydrating we render the page so guests aren't blocked; if hydration
 * later resolves with a user, this re-renders and bounces them to their
 * role-based landing.
 */
export function RedirectIfAuthed(): JSX.Element {
  const user = useAuthStore((s) => s.user);
  const isHydrated = useAuthStore((s) => s.isHydrated);
  if (isHydrated && user) return <Navigate to={roleLanding(user.role)} replace />;
  return <Outlet />;
}
