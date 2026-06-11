/**
 * E-paper archive (`/epaper`) — Sub-PR 5-fc.
 *
 * Public, no-auth archive page that lists every published e-paper issue
 * (newest issueDate first). Each issue tile renders the cover image
 * (`Epaper.coverImageUrl`, hydrated server-side as of BE PR #117) above
 * its title + issue date + page count, and links to the per-issue reader
 * at `/epaper/:id`.
 *
 * Layout choice — magazine-style portrait tiles in a responsive grid
 * (1 col on mobile, 2 on `sm`, 3 on `md`, 4 on `lg+`). The cover is
 * pinned to `aspect-[3/4]` so missing or off-spec uploads don't shift
 * the grid. Newspaper conventions from 5-fa / 5-fb (hairline dividers,
 * no card shadows, bold uppercase eyebrows, font-display headings)
 * carry over.
 *
 * Data flow:
 *   - TanStack Query against `listEpapers()` from `lib/epaper-api`.
 *   - 60 s staleTime — the archive doesn't change second-to-second;
 *     readers re-visiting the page within a minute reuse the cache.
 *   - Empty state when `total === 0`. Error state with retry button.
 */
import { useQuery } from '@tanstack/react-query';
import { Newspaper } from 'lucide-react';
import { Link } from 'react-router-dom';

import { Button, Container, EmptyState, Skeleton } from '@/components/ui';
import { listEpapers, type EpapersListResult } from '@/lib/epaper-api';
import type { Epaper } from '@/types/epaper';

function formatIssueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function EpaperPage(): JSX.Element {
  const { data, isPending, isError, refetch } = useQuery<EpapersListResult>({
    queryKey: ['epapers', 'list'],
    queryFn: () => listEpapers(),
    staleTime: 60_000,
  });

  return (
    <Container width="wide" className="py-8">
      <header className="mb-8 border-b-2 border-brand-red-500 pb-6">
        <p className="text-body-xs font-semibold uppercase tracking-widest text-brand-red-500">
          E-paper
        </p>
        <h1 className="mt-1 font-display text-display-lg font-bold text-ink-primary">Archive</h1>
        <p className="mt-2 max-w-2xl text-body-base text-ink-secondary">
          Every issue of the Infimit daily and weekly editions. Tap an issue to read it online or
          download the PDF.
        </p>
      </header>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <ArchiveSkeleton />
      ) : data.total === 0 ? (
        <EmptyState
          icon={<Newspaper className="h-6 w-6" aria-hidden="true" />}
          title="No issues yet"
          description="The first edition will land here as soon as it's published."
        />
      ) : (
        <ul className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {data.items.map((epaper) => (
            <li key={epaper.id}>
              <IssueTile epaper={epaper} />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

function IssueTile({ epaper }: { epaper: Epaper }): JSX.Element {
  return (
    <Link to={`/epaper/${epaper.id}`} className="group block">
      <CoverArea epaper={epaper} />
      <div className="mt-3 space-y-1">
        <p className="text-body-xs font-semibold uppercase tracking-wide text-brand-red-500">
          <time dateTime={epaper.issueDate}>{formatIssueDate(epaper.issueDate)}</time>
        </p>
        <h2 className="font-display text-body-lg font-semibold leading-tight text-ink-primary transition-colors group-hover:text-brand-red-600">
          {epaper.title}
        </h2>
        {epaper.pageCount > 0 ? (
          <p className="text-body-xs text-ink-tertiary">
            {epaper.pageCount} page{epaper.pageCount === 1 ? '' : 's'}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

/**
 * Cover image with category-tinted gradient fallback. Mirrors the home /
 * category page treatment so missing covers stay consistent across surfaces.
 * Portrait 3:4 aspect — magazine convention; landscape covers will letterbox
 * gracefully since `object-cover` crops to fill.
 */
function CoverArea({ epaper }: { epaper: Epaper }): JSX.Element {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-brand-red-100 to-brand-red-300 ring-1 ring-line">
      {epaper.coverImageUrl ? (
        <img
          src={epaper.coverImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center"
          aria-hidden="true"
        >
          <Newspaper className="h-8 w-8 text-brand-red-600" />
          <span className="font-display text-body-xs font-semibold uppercase tracking-wide text-brand-red-700">
            Infimit
          </span>
        </div>
      )}
    </div>
  );
}

function ArchiveSkeleton(): JSX.Element {
  return (
    <ul
      className="grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
      aria-busy="true"
    >
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <li key={i}>
          <Skeleton className="aspect-[3/4] w-full" />
          <div className="mt-3 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-display-sm text-ink-primary">Something went wrong</p>
      <p className="mt-2 text-body-base text-ink-secondary">
        We couldn&apos;t load the archive. Please try again.
      </p>
      <Button type="button" variant="primary" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}
