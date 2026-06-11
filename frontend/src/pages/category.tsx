/**
 * CategoryPage — public category landing (Sub-PR 5-fb).
 *
 * Renders all published articles in the selected category. Wires
 * `GET /v1/articles?category=:slug&page=:n` (the 5-a dual-mode public list
 * path) to a divided list using `<FeedCardRow>`. Pagination is the simplest
 * possible form: a "Load more" button that increments page and concatenates
 * results. Infinite scroll (intersection observer) is deferred to 5-fe so
 * Lighthouse measurements can drive whether it's worth the complexity.
 *
 * Invalid category slugs land on a friendly "No articles in this category"
 * message rather than 404 — the URL is the source of truth, and editors
 * may legitimately point at an empty category before any article ships
 * there.
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';

import { Container } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { FeedCardRow, FEED_CATEGORY_LABEL } from '@/components/feed-card-row';
import { listPublicArticles, type PublicListResult } from '@/lib/articles-api';
import { ARTICLE_CATEGORIES, type ArticleCategory } from '@/types/article';

const PAGE_SIZE = 20;

function isValidCategory(slug: string | undefined): slug is ArticleCategory {
  return !!slug && (ARTICLE_CATEGORIES as readonly string[]).includes(slug);
}

export default function CategoryPage(): JSX.Element {
  const { slug } = useParams<{ slug: string }>();
  const category = isValidCategory(slug) ? slug : null;
  const label = category ? FEED_CATEGORY_LABEL[category] : (slug ?? 'Category');

  const [page, setPage] = useState(1);

  // Re-running the query for every (slug, page) tuple gives us paginated
  // accumulation via the resolved `items` collection below. TanStack caches
  // each page separately so back-navigation restores instantly.
  const { data, isPending, isError, refetch } = useQuery<PublicListResult>({
    queryKey: ['articles', 'category', category ?? slug, page],
    queryFn: () =>
      category
        ? listPublicArticles({ category, page, limit: PAGE_SIZE })
        : Promise.resolve({ items: [], total: 0, page: 1, limit: PAGE_SIZE }),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  // Accumulator: previous pages stay in view while the next loads. Pure-
  // local — leaving and re-entering the page resets pagination, which is
  // the right call for a category landing.
  const [accumulated, setAccumulated] = useState<PublicListResult['items']>([]);
  useMemo(() => {
    if (!data) return;
    setAccumulated((prev) => {
      if (page === 1) return data.items;
      // Dedup on id in case the server returns overlap on the page boundary.
      const seen = new Set(prev.map((c) => c.id));
      return [...prev, ...data.items.filter((c) => !seen.has(c.id))];
    });
  }, [data, page]);

  if (!category) {
    return (
      <Container width="wide" className="py-10">
        <CategoryHeader label={label} description="That category isn't on our list." />
        <p className="border-y border-line py-6 text-center text-body-sm text-ink-secondary">
          No articles in this category. Try the{' '}
          <Link to="/" className="font-medium text-brand-red-500 hover:text-brand-red-600">
            home page
          </Link>{' '}
          or one of the categories in the navigation bar.
        </p>
      </Container>
    );
  }

  return (
    <Container width="wide" className="py-8">
      <CategoryHeader label={label} description={`Latest reporting and analysis in ${label}.`} />
      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending && accumulated.length === 0 ? (
        <CategorySkeleton />
      ) : accumulated.length === 0 ? (
        <p className="border-y border-line py-10 text-center text-body-sm text-ink-secondary">
          No published articles in {label} yet. Check back soon.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-line">
            {accumulated.map((card) => (
              <li key={card.id}>
                <FeedCardRow card={card} />
              </li>
            ))}
          </ul>
          {data && accumulated.length < data.total ? (
            <div className="flex justify-center pt-8">
              <button
                type="button"
                onClick={() => setPage((p) => p + 1)}
                disabled={isPending}
                className="inline-flex items-center rounded-md border border-line bg-surface px-5 py-2 text-body-sm font-medium text-ink-primary shadow-sm transition-colors hover:bg-surface-subtle disabled:opacity-60"
              >
                {isPending ? 'Loading…' : 'Load more'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </Container>
  );
}

function CategoryHeader({
  label,
  description,
}: {
  label: string;
  description: string;
}): JSX.Element {
  return (
    <header className="mb-6 border-b-2 border-brand-red-500 pb-4">
      <p className="text-body-xs font-semibold uppercase tracking-widest text-brand-red-500">
        Category
      </p>
      <h1 className="mt-1 font-display text-display-md font-bold text-ink-primary">{label}</h1>
      <p className="mt-1 text-body-base text-ink-secondary">{description}</p>
    </header>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="font-display text-display-sm text-ink-primary">Something went wrong</p>
      <p className="mt-2 text-body-base text-ink-secondary">
        We couldn&apos;t load this category. Please try again in a moment.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center rounded-md bg-brand-red-500 px-4 py-2 text-body-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-red-600"
      >
        Retry
      </button>
    </div>
  );
}

function CategorySkeleton(): JSX.Element {
  return (
    <ul className="divide-y divide-line">
      {[0, 1, 2, 3, 4].map((i) => (
        <li key={i} className="grid gap-5 py-6 sm:grid-cols-[1fr_200px]">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          <Skeleton className="aspect-[4/3] w-full" />
        </li>
      ))}
    </ul>
  );
}
