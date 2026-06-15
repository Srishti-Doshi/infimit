/**
 * `/dashboard/author/published` — the author's live pieces (5-fe-3, closes #78).
 *
 * The submissions page tracks the REVIEW pipeline (submitted / approved /
 * rejected, rows link to the draft editor). This page is the other half of
 * the author's world: what's live. It lists `published` + `unpublished`
 * articles with the reader-facing signals — public link, published date,
 * views / bookmarks / comments from the denormalised `article.stats` — so
 * an author can see how their work performs without asking an admin.
 *
 * Same single-round-trip pattern as submissions: fetch `authorId: 'me'`,
 * filter client-side. Published rows link to the PUBLIC article page
 * (new tab); unpublished rows show a status badge and link to the draft
 * editor instead (no public page exists for them).
 */
import { useQuery } from '@tanstack/react-query';
import { Bookmark, ExternalLink, Eye, MessageSquare, Newspaper, Send } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { ArticleStatusBadge } from '@/components/article-status-badge';
import { Button, Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { listArticles } from '@/lib/articles-api';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import type { Article } from '@/types/article';

export default function PublishedPage(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['articles', 'mine', 'published'],
    queryFn: () => listArticles({ authorId: 'me' }),
  });

  const items = (data?.items ?? [])
    .filter((a) => a.status === 'published' || a.status === 'unpublished')
    .sort(
      (a, b) =>
        new Date(b.publishedAt ?? b.updatedAt).getTime() -
        new Date(a.publishedAt ?? a.updatedAt).getTime(),
    );

  return (
    <Container width="default" className="py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md font-semibold text-ink-primary">Published</h1>
          <p className="mt-2 text-body-base text-ink-secondary">
            Your live pieces and how they&rsquo;re performing — views, saves, and conversation.
          </p>
        </div>
        <Link to="/dashboard/author/submissions">
          <Button variant="ghost" iconLeft={<Send className="h-4 w-4" aria-hidden="true" />}>
            My submissions
          </Button>
        </Link>
      </div>

      <Card className="mt-8">
        <CardBody className="overflow-x-auto p-0">
          {isLoading ? (
            <SkeletonRows columns={6} rows={3} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Newspaper className="h-6 w-6" aria-hidden="true" />}
              title="Nothing published yet"
              description="When an editor publishes one of your submissions, it will appear here with its reader stats."
              action={
                <Link to="/dashboard/author/submissions">
                  <Button variant="primary">Track my submissions</Button>
                </Link>
              }
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <Th>Title</Th>
                  <Th>Category</Th>
                  <Th>Published</Th>
                  <Th>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" /> Views
                    </span>
                  </Th>
                  <Th>
                    <span className="inline-flex items-center gap-1">
                      <Bookmark className="h-3.5 w-3.5" aria-hidden="true" /> Saves
                    </span>
                  </Th>
                  <Th>
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" /> Comments
                    </span>
                  </Th>
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
  const isLive = article.status === 'published' && article.slug;
  return (
    <tr className="hover:bg-surface-subtle">
      <td className="px-4 py-3">
        {isLive ? (
          <a
            href={`/article/${article.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 font-medium text-ink-primary hover:text-brand-red-600"
          >
            <span>{article.title || 'Untitled article'}</span>
            <ExternalLink
              className="h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100"
              aria-hidden="true"
            />
          </a>
        ) : (
          <span className="inline-flex flex-wrap items-center gap-2">
            <Link
              to={`/dashboard/author/drafts/${article.id}`}
              className="font-medium text-ink-primary hover:text-brand-red-600"
            >
              {article.title || 'Untitled article'}
            </Link>
            <ArticleStatusBadge status={article.status} />
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">
        {ARTICLE_CATEGORY_LABELS[article.category]}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-tertiary">
        {article.publishedAt
          ? new Date(article.publishedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : '—'}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">{article.stats?.views ?? 0}</td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">{article.stats?.bookmarks ?? 0}</td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">
        {article.stats?.commentsCount ?? 0}
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
                <Skeleton className="h-4 w-24" />
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
