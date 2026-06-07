import { PenLine } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/auth-store';

interface WriteArticleButtonProps {
  /**
   * Called BEFORE navigation fires. The hamburger drawer passes
   * `setSidebarOpen(false)` here so the drawer closes as the user navigates.
   * The persistent `DashboardSidebar` omits this — it has nothing to close.
   */
  onBeforeNavigate?: () => void;
}

/**
 * WriteArticleButton — primary CTA for "compose a new article". Renders only
 * when the signed-in user has a role that can create drafts (`author`,
 * `editor`, `admin`). Reader role is excluded because they have no
 * authoring privileges; signed-out users see nothing (the surrounding
 * surfaces show sign-in CTAs instead).
 *
 * Shipped via #53 / F-AUTHOR-N (Finding B from PR #52 verification). Both
 * the persistent `DashboardSidebar` and the hamburger drawer `Sidebar`
 * mount this above their role nav so the primary action is one click away
 * from any dashboard or public route.
 */
export function WriteArticleButton({
  onBeforeNavigate,
}: WriteArticleButtonProps = {}): JSX.Element | null {
  const user = useAuthStore((s) => s.user);
  if (!user || user.role === 'reader') return null;
  return (
    <Link to="/dashboard/author/drafts/new" className="block" onClick={onBeforeNavigate}>
      <Button
        type="button"
        variant="primary"
        size="md"
        className="w-full"
        iconLeft={<PenLine className="h-4 w-4" aria-hidden="true" />}
      >
        Write article
      </Button>
    </Link>
  );
}
