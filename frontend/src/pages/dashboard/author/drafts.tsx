import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FilePlus, FileText } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button, Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { listArticles } from '@/lib/articles-api';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import type { Article } from '@/types/article';

/**
 * "My drafts" — Subphase 3 author surface. Lists only in-progress drafts;
 * once submitted, an article graduates to the Submissions tracker
 * (`/dashboard/author/submissions`).
 *
 * The two-page split landed Day 12 — keeping drafts focused on "what's still
 * mine to write" makes the table denser and the empty-state copy honest.
 */
export default function DraftsPage(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['articles', 'mine', 'draft'],
    queryFn: () => listArticles({ authorId: 'me', status: ['draft'] }),
  });

  const items = data?.items ?? [];

  return (
    <Container width="default" className="py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md font-semibold text-ink-primary">My drafts</h1>
          <p className="mt-2 text-body-base text-ink-secondary">
            Pieces you&rsquo;re still working on.{' '}
            <Link to="/dashboard/author/submissions" className="text-brand-red-600 hover:underline">
              View submissions
            </Link>{' '}
            for anything you&rsquo;ve sent for review.
          </p>
        </div>
        <Link to="/dashboard/author/drafts/new">
          <Button variant="primary" iconLeft={<FilePlus className="h-4 w-4" aria-hidden="true" />}>
            New draft
          </Button>
        </Link>
      </div>

      <Card className="mt-8">
        <CardBody className="p-0">
          {isLoading ? (
            <SkeletonRows columns={3} rows={3} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" aria-hidden="true" />}
              title="No drafts yet"
              description="Start a new draft to publish your first article."
              action={
                <Link to="/dashboard/author/drafts/new">
                  <Button
                    variant="primary"
                    iconLeft={<FilePlus className="h-4 w-4" aria-hidden="true" />}
                  >
                    Start writing
                  </Button>
                </Link>
              }
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <Th>Title</Th>
                  <Th>Category</Th>
                  <Th>Last edited</Th>
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
  return (
    <tr className="hover:bg-surface-subtle">
      <td className="px-4 py-3">
        <Link
          to={`/dashboard/author/drafts/${article.id}`}
          className="group inline-flex items-center gap-2 font-medium text-ink-primary hover:text-brand-red-600"
        >
          <span>{article.title || 'Untitled draft'}</span>
          <ArrowRight
            className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
        </Link>
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">
        {ARTICLE_CATEGORY_LABELS[article.category]}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-tertiary">
        {relativeTime(article.updatedAt)}
      </td>
    </tr>
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
 * Tiny relative-time helper. Avoids pulling in date-fns / dayjs just for one
 * column. Granularity: seconds → minutes → hours → days.
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
