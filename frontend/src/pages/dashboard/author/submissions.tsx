import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Inbox, PencilLine } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { ArticleStatusBadge } from '@/components/article-status-badge';
import { Button, Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { listArticles } from '@/lib/articles-api';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import type { Article } from '@/types/article';

/**
 * "My submissions" — read-only tracker for everything the author has sent
 * for review. The backend list endpoint takes a single `status`, so we fetch
 * all of the user's articles and filter out drafts on the client. That keeps
 * the page a single round-trip and lets a rejected article reappear in the
 * drafts list (status flips to draft) without race-y refetches.
 *
 * Rejected rows render the rejection reason inline so the author can act on
 * the feedback without re-opening the article.
 */
export default function SubmissionsPage(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['articles', 'mine', 'submissions'],
    queryFn: () => listArticles({ authorId: 'me' }),
  });

  const items = (data?.items ?? [])
    .filter((a) => a.status !== 'draft')
    .sort((a, b) => sortKey(b) - sortKey(a));

  return (
    <Container width="default" className="py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md font-semibold text-ink-primary">
            My submissions
          </h1>
          <p className="mt-2 text-body-base text-ink-secondary">
            Articles you&rsquo;ve sent for review. Track status, see editor feedback, and revisit
            published pieces.
          </p>
        </div>
        <Link to="/dashboard/author/drafts">
          <Button
            variant="outline"
            iconLeft={<PencilLine className="h-4 w-4" aria-hidden="true" />}
          >
            My drafts
          </Button>
        </Link>
      </div>

      <Card className="mt-8">
        <CardBody className="overflow-x-auto p-0">
          {isLoading ? (
            <SkeletonRows columns={4} rows={3} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
              title="Nothing submitted yet"
              description="When you submit a draft for review, it will appear here with its status."
              action={
                <Link to="/dashboard/author/drafts">
                  <Button variant="primary">Go to drafts</Button>
                </Link>
              }
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <Th>Title</Th>
                  <Th>Category</Th>
                  <Th>Status</Th>
                  <Th>Submitted</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((article) => (
                  <Row key={article.id} article={article} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </Container>
  );
}

function Row({ article }: { article: Article }): JSX.Element {
  const showRejection = article.status === 'rejected' && article.rejectionReason;

  return (
    <>
      <tr className="hover:bg-surface-subtle">
        <td className="px-4 py-3">
          <Link
            to={`/dashboard/author/drafts/${article.id}`}
            className="group inline-flex items-center gap-2 font-medium text-ink-primary hover:text-brand-red-600"
          >
            <span>{article.title || 'Untitled article'}</span>
            <ArrowRight
              className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </Link>
        </td>
        <td className="px-4 py-3 text-body-sm text-ink-secondary">
          {ARTICLE_CATEGORY_LABELS[article.category]}
        </td>
        <td className="px-4 py-3">
          <ArticleStatusBadge status={article.status} />
        </td>
        <td className="px-4 py-3 text-body-sm text-ink-tertiary">
          {article.submittedAt ? relativeTime(article.submittedAt) : '—'}
        </td>
      </tr>
      {showRejection && (
        <tr className="bg-status-error-bg/40">
          <td colSpan={4} className="px-4 py-3 text-body-sm text-status-error-text">
            <span className="font-medium">Editor feedback:</span> {article.rejectionReason}
          </td>
        </tr>
      )}
    </>
  );
}

function SkeletonRows({ columns, rows }: { columns: number; rows: number }): JSX.Element {
  return (
    <table className="min-w-full divide-y divide-line" aria-busy="true">
      <tbody className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c} className="px-4 py-3">
                <Skeleton className="h-4 w-32" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-left text-body-xs font-medium uppercase tracking-wide text-ink-tertiary ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

/**
 * Sort key — newest activity first. Prefer `submittedAt` (the action that put
 * the article on this page); fall back to `updatedAt` for rare rows that lost
 * `submittedAt` (e.g. legacy data, or a rejected→draft→resubmit cycle in flight).
 */
function sortKey(a: Article): number {
  return new Date(a.submittedAt ?? a.updatedAt).getTime();
}

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
