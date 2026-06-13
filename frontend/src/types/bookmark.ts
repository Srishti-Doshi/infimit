/**
 * Bookmark domain types. Mirror the backend `BookmarkView`
 * (`backend/src/modules/bookmarks/service.ts`).
 *
 * The `article` field is the same compact `FeedCard` shape returned by
 * the public list/feed endpoints — bookmarks list rendering reuses the
 * shared `<FeedCardRow>` row treatment.
 *
 * `article: null` means the article is no longer published (unpublished
 * or soft-deleted). Per `docs/13-feature-documentation.md` A10 those
 * stay in the user's list with an "Unavailable" badge so they aren't
 * silently lost.
 */
import type { FeedCard } from './article';

export interface Bookmark {
  id: string;
  articleId: string;
  createdAt: string;
  article: FeedCard | null;
}
