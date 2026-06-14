import { NavLink } from 'react-router-dom';

import { Container } from '@/components/ui';
import { cn } from '@/lib/cn';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import { ARTICLE_CATEGORIES } from '@/types/article';

// Derived from the single source of truth (the 5-category enum) so the nav
// always links to real, resolvable category pages. The category route
// validates the slug directly against ARTICLE_CATEGORIES, so the href must be
// the enum value (e.g. `/category/education_policy`).
const NAV_ITEMS = ARTICLE_CATEGORIES.map((category) => ({
  label: ARTICLE_CATEGORY_LABELS[category],
  href: `/category/${category}`,
}));

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
              </NavLink>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}
