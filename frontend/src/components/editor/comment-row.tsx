import { Check, EyeOff, X } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui';
import type { Comment } from '@/types/comment';

type Action = 'approve' | 'reject' | 'hide';

interface CommentRowProps {
  comment: Comment;
  /** True when this row's mutation is in flight or selected for batch. */
  isProcessing?: boolean;
  /** Triggered when one of the three moderation buttons is clicked. */
  onAction: (action: Action) => void;
  /** Multi-select state for bulk moderation (rendered when present). */
  selection?: { selected: boolean; onChange: (next: boolean) => void };
}

/**
 * `<CommentRow>` — one row in the editor moderation queue.
 *
 * Renders the comment body, author, article link, posted timestamp, and
 * three moderation actions (approve / reject / hide). Parent owns the
 * mutation state so bulk actions can lock multiple rows simultaneously.
 *
 * Article column links to the editor preview at `/dashboard/editor/approvals/:id`
 * — that's where the article + its surrounding context lives in the editor
 * portal. Public `/article/:slug` ships in FE-4d.
 */
export function CommentRow({
  comment,
  isProcessing,
  onAction,
  selection,
}: CommentRowProps): JSX.Element {
  return (
    <tr className={isProcessing ? 'bg-surface-subtle opacity-60' : 'hover:bg-surface-subtle'}>
      {selection ? (
        <td className="px-4 py-3 align-top">
          <input
            type="checkbox"
            aria-label={`Select comment by ${comment.author?.name ?? 'unknown'}`}
            className="mt-1 h-4 w-4 cursor-pointer accent-brand-red-500"
            checked={selection.selected}
            disabled={isProcessing}
            onChange={(e) => selection.onChange(e.target.checked)}
          />
        </td>
      ) : null}
      <td className="px-4 py-3 align-top">
        <p className="text-body-sm text-ink-primary line-clamp-3">{comment.body}</p>
      </td>
      <td className="px-4 py-3 align-top text-body-sm text-ink-secondary">
        {comment.author?.name ?? '—'}
      </td>
      <td className="px-4 py-3 align-top text-body-sm">
        {comment.article ? (
          <Link
            to={`/dashboard/editor/approvals/${comment.article.id}`}
            className="text-brand-red-600 hover:underline"
          >
            {comment.article.title}
          </Link>
        ) : (
          <span className="text-ink-tertiary">—</span>
        )}
      </td>
      <td className="px-4 py-3 align-top text-body-sm text-ink-tertiary">
        {relativeTime(comment.createdAt)}
      </td>
      <td className="px-4 py-3 align-top">
        <div className="flex items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onAction('approve')}
            disabled={isProcessing}
            aria-label={`Approve comment by ${comment.author?.name ?? 'unknown'}`}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<X className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onAction('reject')}
            disabled={isProcessing}
            aria-label={`Reject comment by ${comment.author?.name ?? 'unknown'}`}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="outline"
            iconLeft={<EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={() => onAction('hide')}
            disabled={isProcessing}
            aria-label={`Hide comment by ${comment.author?.name ?? 'unknown'}`}
          >
            Hide
          </Button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Same relative-time helper used by the article queue rows — kept local
 * to avoid an extra import barrel. Seconds → minutes → hours → days.
 */
function relativeTime(iso: string): string {
  const diffSec = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  if (Math.abs(diffSec) < 60) return rtf.format(diffSec, 'second');
  const diffMin = Math.round(diffSec / 60);
  if (Math.abs(diffMin) < 60) return rtf.format(diffMin, 'minute');
  const diffHr = Math.round(diffMin / 60);
  if (Math.abs(diffHr) < 24) return rtf.format(diffHr, 'hour');
  const diffDay = Math.round(diffHr / 24);
  return rtf.format(diffDay, 'day');
}
