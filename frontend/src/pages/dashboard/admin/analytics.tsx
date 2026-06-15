/**
 * `/dashboard/admin/analytics` — Articles analytics (admin).
 *
 * The platform-wide counterpart to the author Published page
 * (`/dashboard/author/published`): every `published` + `unpublished` article
 * across ALL authors, with the author byline and the denormalised reader
 * signals (views / saves / comments from `article.stats`). Admin-only.
 *
 * Single round-trip: `listArticles({ status: ['published', 'unpublished'] })`
 * is role-scoped server-side — admins get every article, not just their own.
 * Every column is click-to-sort (numeric + date default to descending, text to
 * ascending; clicking the active column toggles direction). Published rows link
 * to the public article (new tab); unpublished rows link to the editor preview.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Bookmark,
  ChevronDown,
  ChevronsUpDown,
  ChevronUp,
  ExternalLink,
  Eye,
  FileText,
  MessageSquare,
  Newspaper,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { ArticleStatusBadge } from '@/components/article-status-badge';
import { Button, Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { listArticles } from '@/lib/articles-api';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import type { Article } from '@/types/article';

type SortKey = 'title' | 'author' | 'category' | 'publishedAt' | 'views' | 'bookmarks' | 'comments';
interface SortState {
  key: SortKey;
  dir: 'asc' | 'desc';
}

/** Numeric/date columns read most-useful-first (desc); text columns A→Z. */
const DEFAULT_DESC: ReadonlySet<SortKey> = new Set([
  'publishedAt',
  'views',
  'bookmarks',
  'comments',
]);

function sortValue(article: Article, key: SortKey): string | number {
  switch (key) {
    case 'title':
      return (article.title || '').toLowerCase();
    case 'author':
      return (article.author?.name || '').toLowerCase();
    case 'category':
      return ARTICLE_CATEGORY_LABELS[article.category].toLowerCase();
    case 'publishedAt':
      return new Date(article.publishedAt ?? article.updatedAt).getTime();
    case 'views':
      return article.stats?.views ?? 0;
    case 'bookmarks':
      return article.stats?.bookmarks ?? 0;
    case 'comments':
      return article.stats?.commentsCount ?? 0;
  }
}

export default function AdminAnalyticsPage(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['articles', 'admin', 'analytics'],
    queryFn: () => listArticles({ status: ['published', 'unpublished'] }),
  });

  const [sort, setSort] = useState<SortState>({ key: 'publishedAt', dir: 'desc' });

  function toggleSort(key: SortKey): void {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: DEFAULT_DESC.has(key) ? 'desc' : 'asc' },
    );
  }

  const items = useMemo(() => {
    const rows = [...(data?.items ?? [])];
    rows.sort((a, b) => {
      const va = sortValue(a, sort.key);
      const vb = sortValue(b, sort.key);
      let cmp: number;
      if (typeof va === 'number' && typeof vb === 'number') cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb));
      return sort.dir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data?.items, sort]);

  return (
    <Container width="default" className="py-12">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-display-md font-semibold text-ink-primary">
            Articles analytics
          </h1>
          <p className="mt-2 text-body-base text-ink-secondary">
            Every published article across the platform and how it&rsquo;s performing — views,
            saves, and conversation. Click any column to sort.
          </p>
        </div>
        <Link to="/dashboard/admin/articles">
          <Button variant="outline" iconLeft={<FileText className="h-4 w-4" aria-hidden="true" />}>
            Manage articles
          </Button>
        </Link>
      </div>

      <Card className="mt-8">
        <CardBody className="overflow-x-auto p-0">
          {isLoading ? (
            <SkeletonRows columns={7} rows={4} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Newspaper className="h-6 w-6" aria-hidden="true" />}
              title="Nothing published yet"
              description="When an article is published, it will appear here with its reader stats."
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <SortableTh label="Title" sortKey="title" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Author" sortKey="author" sort={sort} onSort={toggleSort} />
                  <SortableTh label="Category" sortKey="category" sort={sort} onSort={toggleSort} />
                  <SortableTh
                    label="Published"
                    sortKey="publishedAt"
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Views"
                    sortKey="views"
                    icon={<Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Saves"
                    sortKey="bookmarks"
                    icon={<Bookmark className="h-3.5 w-3.5" aria-hidden="true" />}
                    sort={sort}
                    onSort={toggleSort}
                  />
                  <SortableTh
                    label="Comments"
                    sortKey="comments"
                    icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
                    sort={sort}
                    onSort={toggleSort}
                  />
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
              to={`/dashboard/editor/approvals/${article.id}`}
              className="font-medium text-ink-primary hover:text-brand-red-600"
            >
              {article.title || 'Untitled article'}
            </Link>
            <ArticleStatusBadge status={article.status} />
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">{article.author?.name ?? '—'}</td>
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

/** Click-to-sort column header. `aria-sort` lives on the `<th>`; the button
 *  carries the click target + the directional chevron. */
function SortableTh({
  label,
  sortKey,
  icon,
  sort,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  icon?: ReactNode;
  sort: SortState;
  onSort: (key: SortKey) => void;
}): JSX.Element {
  const active = sort.key === sortKey;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className="px-4 py-3 text-left"
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 text-body-xs font-medium uppercase tracking-wide transition-colors ${
          active ? 'text-brand-red-600' : 'text-ink-tertiary hover:text-ink-secondary'
        }`}
      >
        {icon}
        <span>{label}</span>
        {active ? (
          sort.dir === 'asc' ? (
            <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
          )
        ) : (
          <ChevronsUpDown className="h-3.5 w-3.5 opacity-30" aria-hidden="true" />
        )}
      </button>
    </th>
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
