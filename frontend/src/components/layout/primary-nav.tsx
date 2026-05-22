import { NavLink } from 'react-router-dom';

import { Container } from '@/components/ui';
import { cn } from '@/lib/cn';

const NAV_ITEMS = [
  { label: 'India', href: '/category/india' },
  { label: 'Elections', href: '/category/elections' },
  { label: 'World', href: '/category/world' },
  { label: 'Sport', href: '/category/sport' },
  { label: 'Data', href: '/category/data' },
  { label: 'Health', href: '/category/health' },
  { label: 'Opinion', href: '/category/opinion' },
  { label: 'Science', href: '/category/science' },
  { label: 'Entertainment', href: '/category/entertainment' },
  { label: 'Premium', href: '/premium', accent: true },
] as const;

/**
 * PrimaryNav — top-level category navigation. Shown inline on lg+ only;
 * below lg the same items live inside the mobile drawer Sidebar.
 * Active route is reflected via NavLink's isActive — accent color +
 * underline mark the current category.
 */
export function PrimaryNav(): JSX.Element {
  return (
    <nav
      className="hidden border-t border-line bg-surface lg:block"
      aria-label="Primary navigation"
    >
      <Container width="wide">
        <ul className="flex items-center gap-7 overflow-x-auto py-3">
          {NAV_ITEMS.map((item) => (
            <li key={item.href}>
              <NavLink
                to={item.href}
                className={({ isActive }) =>
                  cn(
                    'inline-flex items-center gap-1 whitespace-nowrap font-display text-body-base font-medium transition-colors',
                    isActive ? 'text-brand-red-500' : 'text-ink-primary hover:text-brand-red-500',
                  )
                }
              >
                {item.label}
                {'accent' in item && item.accent ? (
                  <span className="ml-0.5 text-brand-red-500" aria-hidden="true">
                    ◆
                  </span>
                ) : null}
              </NavLink>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}
