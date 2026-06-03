import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';

import { ArticleStatusBadge } from '@/components/article-status-badge';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import type { Article } from '@/types/article';

/**
 * One row in the editor approvals queue. Row click navigates to the preview
 * page where the editor can approve / reject / publish. Visual conventions
 * match the author drafts table for consistency.
 *
 * The `submittedAt` timestamp is preferred over `updatedAt` here — it's what
 * editors care about ("how long has this been waiting?"). Falls back to
 * `updatedAt` if the backend hasn't projected `submittedAt`.
 */
export function ApprovalQueueRow({ article }: { article: Article }): JSX.Element {
  const submittedIso = article.submittedAt ?? article.updatedAt;

  return (
    <tr className="hover:bg-surface-subtle">
      <td className="px-4 py-3">
        <Link
          to={`/dashboard/editor/approvals/${article.id}`}
          className="group inline-flex items-center gap-2 font-medium text-ink-primary hover:text-brand-red-600"
        >
          <span>{article.title || 'Untitled submission'}</span>
          <ArrowRight
            className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        </Link>
        {article.subtitle ? (
          <p className="mt-1 text-body-sm text-ink-tertiary line-clamp-1">{article.subtitle}</p>
        ) : null}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">
        {article.author?.name ?? '—'}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">
        {ARTICLE_CATEGORY_LABELS[article.category]}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-tertiary">
        {relativeTime(submittedIso)}
      </td>
      <td className="px-4 py-3">
        <ArticleStatusBadge status={article.status} />
      </td>
    </tr>
  );
}

/**
 * Relative-time helper duplicated from drafts.tsx — keeps both surfaces free
 * of date-fns / dayjs. Granularity: seconds → minutes → hours → days.
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
