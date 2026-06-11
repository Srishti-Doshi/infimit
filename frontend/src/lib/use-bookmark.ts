/**
 * `useBookmark(articleId)` — encapsulates the bookmark toggle for a single
 * article so consumers (`<BookmarkButton>`, the article page header) don't
 * touch TanStack Query plumbing directly.
 *
 * Status source — the BE has no per-article membership endpoint, so we
 * derive `isBookmarked` from the user's bookmark list (`GET /v1/bookmarks`,
 * paginated with a generous limit). For the typical reader (< ~100 saves)
 * this is one cheap query that both the button and the `/dashboard/me/bookmarks`
 * page share, hydrated once and reused via the query cache.
 *
 * Optimistic toggle —
 *   - Add: insert a placeholder row at the head of the list, increment `total`.
 *   - Remove: filter the row out, decrement `total`.
 * On error the cached list rolls back via the `onMutate → onError` ctx.prev
 * snapshot. `onSettled` invalidates so the canonical server state wins.
 *
 * Auth gate — guests get `isAuthed: false`; consumers prompt sign-in instead
 * of calling `toggle()`. The hook never POSTs/DELETEs anonymously.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { trackEvent } from './analytics-api';
import {
  addBookmark,
  listBookmarks,
  removeBookmark,
  type BookmarksListResult,
} from './bookmarks-api';
import { useAuthStore } from '@/store/auth-store';
import type { Bookmark } from '@/types/bookmark';

const LIST_KEY = ['bookmarks', 'list'] as const;
const LIST_LIMIT = 100;

interface UseBookmarkReturn {
  /** Whether the current user has this article bookmarked. False while the
   * list is loading or for unauthed users. */
  isBookmarked: boolean;
  /** Whether the toggle mutation is in flight. */
  isPending: boolean;
  /** Whether the toggle is enabled — false for unauthed users + while the
   * list is loading. */
  isReady: boolean;
  /** Whether the user is signed in. Consumers prompt sign-in if false. */
  isAuthed: boolean;
  /** Fire-and-forget toggle. No-op for unauthed users. */
  toggle: () => void;
}

interface OptimisticCtx {
  prev: BookmarksListResult | undefined;
}

export function useBookmark(articleId: string): UseBookmarkReturn {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isAuthed = !!user;

  const { data: list, isPending: listIsPending } = useQuery<BookmarksListResult>({
    queryKey: LIST_KEY,
    queryFn: () => listBookmarks({ limit: LIST_LIMIT }),
    enabled: isAuthed,
    staleTime: 60_000,
  });

  const isBookmarked = isAuthed
    ? (list?.items.some((b) => b.articleId === articleId) ?? false)
    : false;

  const toggle = useMutation<void, unknown, void, OptimisticCtx>({
    mutationFn: async () => {
      if (isBookmarked) {
        await removeBookmark(articleId);
      } else {
        await addBookmark(articleId);
        // Emit only on a successful add — un-bookmarking isn't a `bookmark`
        // event, and the BE counts adds for the trending score (5-fe-1).
        void trackEvent({ type: 'bookmark', articleId });
      }
    },
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: LIST_KEY });
      const prev = queryClient.getQueryData<BookmarksListResult>(LIST_KEY);
      if (prev) {
        if (isBookmarked) {
          queryClient.setQueryData<BookmarksListResult>(LIST_KEY, {
            ...prev,
            items: prev.items.filter((b) => b.articleId !== articleId),
            total: Math.max(0, prev.total - 1),
          });
        } else {
          const optimistic: Bookmark = {
            id: `optimistic-${articleId}`,
            articleId,
            createdAt: new Date().toISOString(),
            // No FeedCard projection at this layer — the button doesn't
            // render it, and the list page will refetch via onSettled
            // invalidation before showing anything stale.
            article: null,
          };
          queryClient.setQueryData<BookmarksListResult>(LIST_KEY, {
            ...prev,
            items: [optimistic, ...prev.items],
            total: prev.total + 1,
          });
        }
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(LIST_KEY, ctx.prev);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: LIST_KEY });
    },
  });

  return {
    isBookmarked,
    isPending: toggle.isPending,
    isReady: isAuthed && !listIsPending && !toggle.isPending,
    isAuthed,
    toggle: () => {
      if (!isAuthed) return;
      toggle.mutate();
    },
  };
}
