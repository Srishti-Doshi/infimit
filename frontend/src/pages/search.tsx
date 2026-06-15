/**
 * SearchPage — full-text search results (Sub-PR 5-fb).
 *
 * The URL `?q=…` is the source of truth — bookmarking and back-navigation
 * preserve the search. A controlled `<input>` syncs to it on submit (not
 * on keystroke — typing into the input shouldn't fire a backend query per
 * character; readers expect to press Enter or click the button).
 *
 * Results render as a divided list of `<FeedCardRow>` items, matching the
 * category page surface. The BE returns the full `Article` shape (the
 * search module hydrates the doc); `<FeedCardRow>` normalises it down to
 * the visible fields.
 */
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { Seo } from '@/components/seo';
import { Container } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { FeedCardRow } from '@/components/feed-card-row';
import { searchArticles, type SearchResult } from '@/lib/search-api';

export default function SearchPage(): JSX.Element {
  const [params, setParams] = useSearchParams();
  const q = (params.get('q') ?? '').trim();
  const [input, setInput] = useState(q);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount so arriving from the header search icon lands the
  // cursor in the field — no second click needed (UX gap fix).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data, isPending, isError, refetch } = useQuery<SearchResult>({
    queryKey: ['search', q],
    queryFn: () => searchArticles({ q }),
    // Don't query for empty `q` — the API requires the param. Render the
    // empty-prompt UI instead.
    enabled: q.length > 0,
    staleTime: 30_000,
  });

  function onSubmit(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    const next = input.trim();
    if (next === q) return;
    if (next.length === 0) {
      setParams({}, { replace: true });
    } else {
      setParams({ q: next });
    }
  }

  return (
    <Container width="wide" className="py-8">
      <Seo
        title={q ? `Search: ${q}` : 'Search'}
        description="Search published articles by title, keyword, or tag."
      />
      <header className="mb-6 border-b-2 border-brand-red-500 pb-4">
        <p className="text-body-xs font-semibold uppercase tracking-widest text-brand-red-500">
          Search
        </p>
        <h1 className="mt-1 font-display text-display-md font-bold text-ink-primary">
          Find articles
        </h1>
        <form onSubmit={onSubmit} role="search" className="mt-4 flex gap-2">
          <label htmlFor="search-input" className="sr-only">
            Search articles
          </label>
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Search by title, keyword, or tag"
            className="min-w-0 flex-1 rounded-md border border-line bg-surface px-4 py-2 text-body-base text-ink-primary placeholder:text-ink-tertiary focus:border-brand-red-500 focus:outline-none focus:ring-1 focus:ring-brand-red-500"
          />
          <button
            type="submit"
            className="inline-flex items-center rounded-md bg-brand-red-500 px-5 py-2 text-body-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-red-600"
          >
            Search
          </button>
        </form>
      </header>

      {q.length === 0 ? (
        <EmptyPrompt />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <SearchSkeleton />
      ) : data?.items.length === 0 ? (
        <NoResults query={q} />
      ) : (
        <>
          <p className="mb-4 text-body-sm text-ink-secondary">
            {data?.total ?? 0} result{(data?.total ?? 0) === 1 ? '' : 's'} for{' '}
            <span className="font-semibold text-ink-primary">&ldquo;{q}&rdquo;</span>
          </p>
          <ul className="divide-y divide-line">
            {data?.items.map((article) => (
              <li key={article.id}>
                <FeedCardRow card={article} />
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}

function EmptyPrompt(): JSX.Element {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="font-display text-display-sm text-ink-primary">Search Infimit</p>
      <p className="mt-2 text-body-base text-ink-secondary">
        Type a title, keyword, or tag above and press Enter to find articles.
      </p>
    </div>
  );
}

function NoResults({ query }: { query: string }): JSX.Element {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="font-display text-display-sm text-ink-primary">No results</p>
      <p className="mt-2 text-body-base text-ink-secondary">
        Nothing matched{' '}
        <span className="font-semibold text-ink-primary">&ldquo;{query}&rdquo;</span>. Try a
        different keyword or check your spelling.
      </p>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="mx-auto max-w-md py-12 text-center">
      <p className="font-display text-display-sm text-ink-primary">Search failed</p>
      <p className="mt-2 text-body-base text-ink-secondary">
        We couldn&apos;t reach the search service. Please try again.
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

function SearchSkeleton(): JSX.Element {
  return (
    <ul className="divide-y divide-line">
      {[0, 1, 2, 3].map((i) => (
        <li key={i} className="grid gap-5 py-6 sm:grid-cols-[1fr_200px]">
          <div className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-7 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <Skeleton className="aspect-[4/3] w-full" />
        </li>
      ))}
    </ul>
  );
}
