/**
 * E-paper issue detail (`/epaper/:id`) — Sub-PR 5-fc.
 *
 * Per-issue reader page. The backend doesn't render the PDF inline
 * (Phase 2 may add a page-flip viewer); for MVP, this page presents the
 * cover prominently with metadata + a "Download PDF" CTA that opens the
 * `epaperDownloadUrl(id)` in a new tab. The browser follows the BE's
 * 302 to the presigned S3 URL and either previews the PDF inline
 * (Chrome / Firefox built-in viewer) or kicks off a download — both
 * behaviours are acceptable and depend on user preference, not us.
 *
 * Layout — split: cover (left, 5/12) + metadata block (right, 7/12) on
 * `lg+`, stacked on smaller. Mirrors a magazine masthead so readers
 * recognise the issue at a glance.
 *
 * Data flow:
 *   - TanStack Query against `getEpaper(id)`. 60 s staleTime —
 *     stats may tick but the issue body is immutable.
 *   - 404 surfaces an explicit not-found state with a link back to the
 *     archive (no router redirect — readers may have followed a stale
 *     bookmark and benefit from explicit copy).
 */
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Eye, FileText, Newspaper } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { Seo } from '@/components/seo';
import { Button, Container, Skeleton } from '@/components/ui';
import { epaperDownloadUrl, getEpaper } from '@/lib/epaper-api';
import type { Epaper } from '@/types/epaper';

function formatIssueDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function EpaperIssuePage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const epaperId = id ?? '';

  const { data, isPending, isError, error, refetch } = useQuery<Epaper>({
    queryKey: ['epaper', epaperId],
    queryFn: () => getEpaper(epaperId),
    enabled: epaperId.length > 0,
    staleTime: 60_000,
  });

  // Reuses the global axios 404 status-mapping (PR #90) — error.details.status
  // is `404` when the BE returns NOT_FOUND. Treat that distinctly so the
  // not-found path doesn't show a generic "something went wrong".
  const isNotFound =
    isError && (error as { details?: { status?: number } } | null)?.details?.status === 404;

  return (
    <Container width="default" className="py-8">
      <Link
        to="/epaper"
        className="inline-flex items-center gap-1.5 text-body-sm text-ink-secondary transition-colors hover:text-brand-red-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Back to archive
      </Link>

      {isNotFound ? (
        <NotFoundState />
      ) : isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <DetailSkeleton />
      ) : (
        <>
          <Seo
            title={data.title}
            description={`E-paper issue dated ${formatIssueDate(data.issueDate)} — read online or download the PDF.`}
            image={data.coverImageUrl ?? null}
          />
          <IssueLayout epaper={data} />
        </>
      )}
    </Container>
  );
}

function IssueLayout({ epaper }: { epaper: Epaper }): JSX.Element {
  return (
    <article className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12">
      <div className="lg:col-span-5">
        <CoverArea epaper={epaper} />
      </div>
      <div className="lg:col-span-7">
        <p className="text-body-xs font-semibold uppercase tracking-widest text-brand-red-500">
          <time dateTime={epaper.issueDate}>{formatIssueDate(epaper.issueDate)}</time>
        </p>
        <h1 className="mt-2 font-display text-display-lg font-bold leading-tight text-ink-primary">
          {epaper.title}
        </h1>

        <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-line py-4 text-body-sm">
          <MetaRow
            label="Pages"
            value={epaper.pageCount > 0 ? `${epaper.pageCount}` : '—'}
            icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          />
          <MetaRow
            label="Downloads"
            value={epaper.stats.downloads.toLocaleString()}
            icon={<Download className="h-4 w-4" aria-hidden="true" />}
          />
          <MetaRow
            label="Views"
            value={epaper.stats.views.toLocaleString()}
            icon={<Eye className="h-4 w-4" aria-hidden="true" />}
          />
        </dl>

        <p className="mt-6 text-body-base text-ink-secondary">
          Download the full PDF to read this issue offline, or open it in your browser&apos;s
          built-in PDF viewer.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href={epaperDownloadUrl(epaper.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-brand-red-500 px-5 py-2.5 text-body-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-red-500 focus-visible:ring-offset-2"
          >
            <Download className="h-4 w-4" aria-hidden="true" />
            Download PDF
          </a>
          <Link
            to="/epaper"
            className="inline-flex items-center gap-2 rounded-md border border-line bg-surface px-5 py-2.5 text-body-sm font-medium text-ink-primary transition-colors hover:bg-surface-subtle"
          >
            Browse archive
          </Link>
        </div>
      </div>
    </article>
  );
}

function MetaRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: JSX.Element;
}): JSX.Element {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 text-ink-tertiary">{icon}</span>
      <div>
        <dt className="text-body-xs uppercase tracking-wide text-ink-tertiary">{label}</dt>
        <dd className="mt-0.5 font-display text-body-lg font-semibold text-ink-primary">{value}</dd>
      </div>
    </div>
  );
}

function CoverArea({ epaper }: { epaper: Epaper }): JSX.Element {
  return (
    <div className="relative aspect-[3/4] w-full overflow-hidden bg-gradient-to-br from-brand-red-100 to-brand-red-300 ring-1 ring-line">
      {epaper.coverImageUrl ? (
        <img
          src={epaper.coverImageUrl}
          alt=""
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center"
          aria-hidden="true"
        >
          <Newspaper className="h-12 w-12 text-brand-red-600" />
          <span className="font-display text-body-sm font-semibold uppercase tracking-wide text-brand-red-700">
            Infimit
          </span>
        </div>
      )}
    </div>
  );
}

function DetailSkeleton(): JSX.Element {
  return (
    <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-12" aria-busy="true">
      <div className="lg:col-span-5">
        <Skeleton className="aspect-[3/4] w-full" />
      </div>
      <div className="lg:col-span-7 space-y-4">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-10 w-40" />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-display-sm text-ink-primary">Something went wrong</p>
      <p className="mt-2 text-body-base text-ink-secondary">
        We couldn&apos;t load this issue. Please try again.
      </p>
      <Button type="button" variant="primary" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}

function NotFoundState(): JSX.Element {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-display-sm text-ink-primary">Issue not found</p>
      <p className="mt-2 text-body-base text-ink-secondary">
        This issue may have been removed from the archive, or the link is incorrect.
      </p>
      <Link
        to="/epaper"
        className="mt-4 inline-flex items-center gap-2 rounded-md bg-brand-red-500 px-5 py-2.5 text-body-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-red-600"
      >
        Browse archive
      </Link>
    </div>
  );
}
