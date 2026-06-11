import { apiClient } from './api-client';
import type { ApiSuccess } from '@/types/api';
import type { Bookmark } from '@/types/bookmark';

/**
 * Bookmarks resource client (Subphase 5).
 *
 * Backend surface:
 *   - `GET    /v1/bookmarks`                authed; paginated my-bookmarks list
 *   - `POST   /v1/bookmarks/:articleId`     authed; idempotent add (returns the row)
 *   - `DELETE /v1/bookmarks/:articleId`     authed; idempotent remove (204)
 *
 * Idempotency contract (per BE service.ts): repeat POSTs return the same
 * row both times and only the first bumps `article.stats.bookmarks`.
 * Repeat DELETEs are 204 no-ops. The FE relies on this for its
 * optimistic-toggle hook in `use-bookmark.ts`.
 */

export interface BookmarksListResult {
  items: Bookmark[];
  total: number;
  page: number;
  limit: number;
}

export interface ListBookmarksQuery {
  page?: number;
  limit?: number;
}

export async function listBookmarks(query: ListBookmarksQuery = {}): Promise<BookmarksListResult> {
  const res = await apiClient.get<ApiSuccess<BookmarksListResult>>('/bookmarks', {
    params: query,
  });
  return res.data.data;
}

export async function addBookmark(articleId: string): Promise<Bookmark> {
  const res = await apiClient.post<ApiSuccess<{ bookmark: Bookmark }>>(`/bookmarks/${articleId}`);
  return res.data.data.bookmark;
}

export async function removeBookmark(articleId: string): Promise<void> {
  await apiClient.delete(`/bookmarks/${articleId}`);
}
