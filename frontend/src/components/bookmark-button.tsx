/**
 * `<BookmarkButton>` — toggleable save-for-later control.
 *
 * Used on the article page header (Sub-PR 5-fd). Also reusable on feed-card
 * surfaces in 5-fe if we wire it there.
 *
 * Surfaces three states:
 *   - Saved      → solid red, BookmarkCheck icon, "Saved" copy
 *   - Not saved  → outline, Bookmark icon, "Save" copy
 *   - Pending    → solid red, Loader2 spinner replaces the icon, copy unchanged
 *
 * Guests (`isAuthed === false`) see the unsaved style and tapping fires a
 * toast prompting sign-in; we never POST anonymously, because the BE rejects
 * with 401 and the optimistic add would just roll back. Mirrors the
 * `useBookmark` hook's no-op behaviour for unauthed users.
 *
 * `aria-pressed` mirrors the saved state for screen readers — the visual
 * label flips between "Save" / "Saved" so sighted users see the same change.
 */
import { Bookmark, BookmarkCheck, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import { toast } from '@/components/ui';
import { useBookmark } from '@/lib/use-bookmark';
import { cn } from '@/lib/cn';

interface BookmarkButtonProps {
  articleId: string;
  /** Optional class applied to the root button. Used for layout overrides
   * (margin, alignment) — never for variant changes. */
  className?: string;
  /** Hide the text label, render the icon only. For dense rows like feed
   * cards. Defaults to `false` (icon + label). */
  iconOnly?: boolean;
}

export function BookmarkButton({
  articleId,
  className,
  iconOnly = false,
}: BookmarkButtonProps): JSX.Element {
  const navigate = useNavigate();
  const { isBookmarked, isPending, isAuthed, toggle } = useBookmark(articleId);

  const onClick = (): void => {
    if (!isAuthed) {
      toast.info('Sign in to save articles', {
        action: { label: 'Sign in', onClick: () => navigate('/auth/login') },
      });
      return;
    }
    toggle();
  };

  const label = isBookmarked ? 'Saved' : 'Save';
  const Icon = isBookmarked ? BookmarkCheck : Bookmark;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      aria-pressed={isBookmarked}
      aria-label={iconOnly ? label : undefined}
      title={label}
      className={cn(
        'inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-body-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60',
        isBookmarked
          ? 'border-brand-red-500 bg-brand-red-500 text-ink-inverse hover:bg-brand-red-600'
          : 'border-line bg-surface text-ink-primary hover:bg-surface-subtle',
        className,
      )}
    >
      {isPending ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      {iconOnly ? null : <span>{label}</span>}
    </button>
  );
}
