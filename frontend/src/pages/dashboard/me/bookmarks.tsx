/**
 * `/dashboard/me/bookmarks` — My Bookmarks (Sub-PR 5-fd).
 *
 * Authenticated reader page that lists every article the current user has
 * saved. Newest first (BE sorts by `(userId, createdAt:-1)` via the compound
 * index from PR #107). Rows reuse the shared `<FeedCardRow>` so the look
 * mirrors the category / search pages.
 *
 * Behaviour:
 *   - Shares the `['bookmarks', 'list']` query cache with `<BookmarkButton>`
 *     — toggling a bookmark from an article page updates this list with no
 *     extra round-trip on revisit (60 s staleTime).
 *   - Article is `null` when the row references an unpublished / removed
 *     article. We render an "Unavailable" placeholder per
 *     `docs/13-feature-documentation.md` A10.
 *   - Per-row Remove action — same idempotent DELETE the button fires.
 *     Optimistically updates the cached list via the same hook plumbing.
 *
 * Route is wrapped in `<RequireAuth>` at the router layer; this page never
 * receives an unauthed user.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bookmark as BookmarkIcon, FileX, Trash2 } from 'lucide-react';

import { Button, Container, EmptyState, Skeleton, toast } from '@/components/ui';
import { FeedCardRow } from '@/components/feed-card-row';
import { listBookmarks, removeBookmark, type BookmarksListResult } from '@/lib/bookmarks-api';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Bookmark } from '@/types/bookmark';

const LIST_KEY = ['bookmarks', 'list'] as const;
const LIST_LIMIT = 100;

export default function BookmarksPage(): JSX.Element {
  const queryClient = useQueryClient();

  const { data, isPending, isError, refetch } = useQuery<BookmarksListResult>({
    queryKey: LIST_KEY,
    queryFn: () => listBookmarks({ limit: LIST_LIMIT }),
    staleTime: 60_000,
  });

  const remove = useMutation<
    void,
    ApiError['error'],
    string,
    { prev: BookmarksListResult | undefined }
  >({
    mutationFn: (articleId: string) => removeBookmark(articleId),
    onMutate: async (articleId) => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const prev = queryClient.getQueryData<BookmarksListResult>(LIST_KEY);
      if (prev) {
        queryClient.setQueryData<BookmarksListResult>(LIST_KEY, {
          ...prev,
          items: prev.items.filter((b) => b.articleId !== articleId),
          total: Math.max(0, prev.total - 1),
        });
      }
      return { prev };
    },
    onError: (error, _articleId, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(LIST_KEY, ctx.prev);
      toastError(error);
    },
    onSuccess: () => toast.success('Removed from bookmarks'),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });

  return (
    <Container width="default" className="py-8">
      <header className="mb-6 border-b border-line pb-4">
        <p className="text-body-xs font-semibold uppercase tracking-widest text-brand-red-500">
          My library
        </p>
        <h1 className="mt-1 font-display text-display-md font-bold text-ink-primary">Bookmarks</h1>
        <p className="mt-2 text-body-base text-ink-secondary">
          Articles you&apos;ve saved for later. Newest first.
        </p>
      </header>

      {isError ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : isPending ? (
        <BookmarksSkeleton />
      ) : data.total === 0 ? (
        <EmptyState
          icon={<BookmarkIcon className="h-6 w-6" aria-hidden="true" />}
          title="No bookmarks yet"
          description="Tap Save on any article and it'll land here for later."
        />
      ) : (
        <ul className="divide-y divide-line">
          {data.items.map((bookmark) => (
            <li key={bookmark.id}>
              <BookmarkRow
                bookmark={bookmark}
                onRemove={() => remove.mutate(bookmark.articleId)}
                isRemoving={remove.isPending && remove.variables === bookmark.articleId}
              />
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}

function BookmarkRow({
  bookmark,
  onRemove,
  isRemoving,
}: {
  bookmark: Bookmark;
  onRemove: () => void;
  isRemoving: boolean;
}): JSX.Element {
  if (bookmark.article === null) {
    return (
      <UnavailableRow articleId={bookmark.articleId} onRemove={onRemove} isRemoving={isRemoving} />
    );
  }
  return (
    <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
      <FeedCardRow card={bookmark.article} />
      <div className="pb-6 sm:border-l sm:border-line sm:py-0 sm:pl-5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onRemove}
          disabled={isRemoving}
          aria-label="Remove from bookmarks"
          iconLeft={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          {isRemoving ? 'Removing…' : 'Remove'}
        </Button>
      </div>
    </div>
  );
}

function UnavailableRow({
  articleId,
  onRemove,
  isRemoving,
}: {
  articleId: string;
  onRemove: () => void;
  isRemoving: boolean;
}): JSX.Element {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 py-6">
      <div className="flex items-start gap-3">
        <span className="mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-subtle text-ink-tertiary">
          <FileX className="h-4 w-4" aria-hidden="true" />
        </span>
        <div>
          <p className="font-display text-body-base font-semibold text-ink-primary">
            Article unavailable
          </p>
          <p className="text-body-xs text-ink-tertiary">
            This article is no longer published. (Bookmark id: {articleId.slice(-6)})
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onRemove}
        disabled={isRemoving}
        aria-label="Remove unavailable bookmark"
        iconLeft={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
      >
        {isRemoving ? 'Removing…' : 'Remove'}
      </Button>
    </div>
  );
}

function BookmarksSkeleton(): JSX.Element {
  return (
    <ul className="divide-y divide-line" aria-busy="true">
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

function ErrorState({ onRetry }: { onRetry: () => void }): JSX.Element {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <p className="font-display text-display-sm text-ink-primary">Something went wrong</p>
      <p className="mt-2 text-body-base text-ink-secondary">
        We couldn&apos;t load your bookmarks. Please try again.
      </p>
      <Button type="button" variant="primary" onClick={onRetry} className="mt-4">
        Retry
      </Button>
    </div>
  );
}
