import { Menu, Search } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Container } from '@/components/ui';
import { useUIStore } from '@/store';

import { BreakingNewsTicker } from './breaking-news-ticker';
import { Logo } from './logo';
import { NotificationBell } from './notification-bell';
import { PrimaryNav } from './primary-nav';
import { UtilityBar } from './utility-bar';

/**
 * Header — full application chrome. Composes:
 *   - UtilityBar (md+ only): date · location · weather
 *   - Main row: hamburger (lg-) · logo · search/notifications/auth (md+)
 *   - BreakingNewsTicker: animated headline marquee
 *   - PrimaryNav (lg+ only): top-level category links
 *
 * Sticky-top so the chrome stays visible during reading. The hamburger only
 * shows below lg; lg+ uses the inline `PrimaryNav` instead. Sidebar open
 * state is read from `useUIStore` directly — no prop drilling.
 */
export function Header(): JSX.Element {
  const openSidebar = useUIStore((s) => s.openSidebar);
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface">
      <UtilityBar />

      <Container width="wide">
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 py-3 sm:gap-4 sm:py-4">
          {/* Left cluster — hamburger trigger only below lg */}
          <div className="flex items-center">
            <button
              type="button"
              onClick={openSidebar}
              className="-ml-2 inline-flex h-10 w-10 items-center justify-center rounded-md text-ink-primary transition-colors hover:bg-surface-subtle lg:hidden"
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
            <button
              type="button"
              className="hidden h-10 w-10 items-center justify-center rounded-md text-ink-primary transition-colors hover:bg-surface-subtle sm:inline-flex"
              aria-label="Search"
            >
              <Search className="h-5 w-5" aria-hidden="true" />
            </button>
            <NotificationBell />
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
          </div>
        </div>
      </Container>

      <BreakingNewsTicker />
      <PrimaryNav />
    </header>
  );
}
