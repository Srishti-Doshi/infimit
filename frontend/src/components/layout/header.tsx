import { Menu, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Container } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';
import { useUIStore } from '@/store';

import { BreakingNewsTicker } from './breaking-news-ticker';
import { Logo } from './logo';
import { NotificationBell } from './notification-bell';
import { PrimaryNav } from './primary-nav';
import { ProfileMenu } from './profile-menu';
import { UtilityBar } from './utility-bar';

/**
 * Header — full application chrome. Composes:
 *   - UtilityBar (md+ only): date · location · weather
 *   - Main row: hamburger (always visible) · logo · search/notifications/auth-or-profile (md+)
 *   - BreakingNewsTicker: animated headline marquee
 *   - PrimaryNav (lg+ only): top-level category links
 *
 * Sticky-top so the chrome stays visible during reading. The hamburger
 * trigger is intentionally NOT `lg:hidden` (#56) — the drawer holds the
 * E-paper link plus a few other secondary items that wouldn't be reachable
 * on desktop otherwise. PrimaryNav still renders inline at lg+ alongside
 * the hamburger.
 *
 * Right cluster swaps between guest CTAs (Login / Sign up) and the
 * `<ProfileMenu>` based on `useAuthStore.user` (#37 + #38) — gives Sign out
 * a globally reachable surface instead of only `/dashboard/me`.
 */
export function Header(): JSX.Element {
  const openSidebar = useUIStore((s) => s.openSidebar);
  const user = useAuthStore((s) => s.user);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <UtilityBar />

      <Container width="wide">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 sm:gap-4 sm:py-4">
          {/* Left cluster — hamburger trigger is always visible (#56) */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={openSidebar}
              className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-primary transition-colors hover:bg-surface-subtle"
              aria-label="Open navigation menu"
            >
              <Menu className="h-6 w-6" aria-hidden="true" />
            </button>
          </div>

          {/* Centered logo */}
          <div className="flex items-center justify-center text-center">
            <Logo />
          </div>

          {/* Right cluster */}
          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <Link
              to="/search"
              className="hidden h-10 w-10 items-center justify-center rounded-md text-ink-primary transition-colors hover:bg-surface-subtle sm:inline-flex"
              aria-label="Search"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </Link>
            <NotificationBell />
            {user ? (
              <ProfileMenu user={user} />
            ) : (
              <div className="ml-1 hidden items-center gap-2 md:flex">
                <Link
                  to="/auth/login"
                  className="text-body-sm font-medium text-ink-primary transition-colors hover:text-brand-red-500"
                >
                  Login
                </Link>
                <Link to="/auth/register">
                  <Button variant="primary" size="sm">
                    Sign up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </Container>

      <BreakingNewsTicker />
      <PrimaryNav />
    </header>
  );
}
