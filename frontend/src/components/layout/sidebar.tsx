import * as Dialog from '@radix-ui/react-dialog';
import { useMutation } from '@tanstack/react-query';
import {
  BookOpen,
  Facebook,
  FileText,
  Home,
  Info,
  Linkedin,
  LogOut,
  Mail,
  Search,
  Twitter,
  X,
} from 'lucide-react';
import { type ComponentType, type SVGProps } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';

import { Button, Input, toast } from '@/components/ui';
import { logout } from '@/lib/auth-api';
import { cn } from '@/lib/cn';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import { useRoleNav } from '@/lib/use-role-nav';
import { useAuthStore } from '@/store/auth-store';
import { useUIStore } from '@/store';
import { ARTICLE_CATEGORIES } from '@/types/article';

import { WriteArticleButton } from './write-article-button';

interface NavItem {
  label: string;
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  /** Use `end` for routes like `/` that should only match exactly. */
  end?: boolean;
}

const PRIMARY_ITEMS: NavItem[] = [
  { label: 'Home', href: '/', icon: Home, end: true },
  { label: 'E-paper', href: '/epaper', icon: BookOpen },
  { label: 'About Us', href: '/about', icon: Info },
  { label: 'Contact Us', href: '/contact', icon: Mail },
];

// Derived from the 5-category enum so every link resolves to a real category
// page (the category route validates the slug against ARTICLE_CATEGORIES).
const CATEGORY_ITEMS: NavItem[] = ARTICLE_CATEGORIES.map((category) => ({
  label: ARTICLE_CATEGORY_LABELS[category],
  href: `/category/${category}`,
  icon: FileText,
}));

const SOCIAL_LINKS = [
  { label: 'Facebook', href: '#', icon: Facebook },
  { label: 'Twitter / X', href: '#', icon: Twitter },
  { label: 'LinkedIn', href: '#', icon: Linkedin },
];

/**
 * Sidebar — mobile / tablet navigation drawer (Radix Dialog).
 *
 * Slides in from the left, traps focus, restores focus to trigger on close,
 * blocks page scroll while open, and dismisses on overlay tap or Escape.
 * NavLink reflects the active route automatically; `Dialog.Close asChild`
 * wrapping each link closes the drawer when the user navigates.
 *
 * When the user is signed in, a role-aware section renders at the top of
 * the drawer (role badge + per-role items from `useRoleNav`). The existing
 * reader categories remain below so signed-in users can still browse the
 * public site from within their dashboard context. Sign-out replaces the
 * sign-in/register CTAs at the bottom when signed in.
 */
export function Sidebar(): JSX.Element {
  const navigate = useNavigate();
  const isOpen = useUIStore((s) => s.isSidebarOpen);
  const setSidebarOpen = useUIStore((s) => s.setSidebarOpen);
  const user = useAuthStore((s) => s.user);
  const { isAuthed, roleLabel, items: roleItems } = useRoleNav();

  const logoutMutation = useMutation({
    mutationFn: logout,
    onSettled: () => {
      useAuthStore.getState().clear();
      setSidebarOpen(false);
      toast.success('Signed out');
      navigate('/', { replace: true });
    },
  });

  // Dedup: when signed-in, `roleItems[0]` is "Home" (from useRoleNav). Drop
  // the duplicate from `PRIMARY_ITEMS` so the drawer doesn't list "Home" twice.
  // Polish from PR #51 (F-NAV-1) verification — see #49 fix-PR.
  const primaryItems = isAuthed ? PRIMARY_ITEMS.filter((i) => i.href !== '/') : PRIMARY_ITEMS;

  return (
    <Dialog.Root open={isOpen} onOpenChange={setSidebarOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-primary/50 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed left-0 top-0 z-50 flex h-full w-[85vw] max-w-sm flex-col bg-surface shadow-elev-3 outline-none data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:animate-in data-[state=open]:slide-in-from-left"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <Dialog.Close
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-ink-primary transition-colors hover:bg-surface-subtle"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Dialog.Close>
            <Dialog.Title className="font-display text-body-lg font-bold uppercase tracking-tight text-ink-primary">
              The Infimit
            </Dialog.Title>
            <span aria-hidden="true" className="w-9" />
          </div>

          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-line p-4">
              <Input
                aria-label="Search news"
                placeholder="Search news, topics, and more…"
                iconLeft={<Search className="h-4 w-4" />}
              />
            </div>

            {isAuthed && user ? (
              <div className="border-b border-line">
                <div className="px-4 pt-4">
                  <p className="text-body-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                    Signed in as {roleLabel}
                  </p>
                  <p
                    className="mt-0.5 truncate text-body-sm font-medium text-ink-primary"
                    title={user.name}
                  >
                    {user.name}
                  </p>
                </div>
                {/* Primary CTA — only renders for roles that can create drafts. Closes #53. */}
                <div className="px-4 pt-3">
                  <WriteArticleButton onBeforeNavigate={() => setSidebarOpen(false)} />
                </div>
                <NavList items={roleItems} onItemClick={() => setSidebarOpen(false)} />
              </div>
            ) : null}

            <NavList items={primaryItems} onItemClick={() => setSidebarOpen(false)} />

            <div className="border-t border-line">
              <p className="px-4 pt-4 text-body-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Categories
              </p>
              <NavList items={CATEGORY_ITEMS} onItemClick={() => setSidebarOpen(false)} />
            </div>

            <div className="space-y-3 border-t border-line p-4">
              {isAuthed ? (
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
              ) : (
                <>
                  <Dialog.Close asChild>
                    <Link to="/auth/login" className="block">
                      <Button variant="outline" size="md" className="w-full">
                        Sign in
                      </Button>
                    </Link>
                  </Dialog.Close>
                  <Dialog.Close asChild>
                    <Link to="/auth/register" className="block">
                      <Button variant="primary" size="md" className="w-full">
                        Create account
                      </Button>
                    </Link>
                  </Dialog.Close>
                </>
              )}
            </div>

            <div className="border-t border-line bg-surface-subtle px-4 py-5">
              <p className="text-body-xs font-semibold uppercase tracking-wider text-ink-tertiary">
                Follow us
              </p>
              <ul className="mt-3 flex items-center gap-3">
                {SOCIAL_LINKS.map((social) => (
                  <li key={social.label}>
                    <a
                      href={social.href}
                      aria-label={social.label}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface text-ink-primary ring-1 ring-line transition-colors hover:bg-brand-red-500 hover:text-ink-inverse hover:ring-brand-red-500"
                    >
                      <social.icon className="h-4 w-4" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function NavList({
  items,
  onItemClick,
}: {
  items: NavItem[];
  /**
   * Called when a NavLink is clicked. The drawer passes `setSidebarOpen(false)`
   * here so the drawer closes on navigation. Previously this was done by
   * wrapping each NavLink in `Dialog.Close asChild`, but Radix's Slot mechanism
   * stringifies NavLink's function-returning className (turns the function
   * source into the literal `class` attribute) — leaving items completely
   * unstyled. Surfaced during #53 verification; fixed inline here.
   */
  onItemClick?: () => void;
}): JSX.Element {
  return (
    <ul className="py-2">
      {items.map((item) => (
        <li key={item.href}>
          <NavLink
            to={item.href}
            end={item.end}
            onClick={onItemClick}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 px-5 py-3 text-body-sm transition-colors',
                isActive
                  ? 'bg-surface-subtle font-semibold text-ink-primary'
                  : 'text-ink-secondary hover:bg-surface-subtle hover:text-ink-primary',
              )
            }
          >
            <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{item.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
