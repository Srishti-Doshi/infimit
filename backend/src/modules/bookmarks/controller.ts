/**
 * Bookmarks controllers — HTTP layer.
 *
 *   GET    /v1/bookmarks               list MY bookmarks (paginated)
 *   POST   /v1/bookmarks/:articleId    idempotent add
 *   DELETE /v1/bookmarks/:articleId    idempotent remove
 */
import { type Request, type Response } from 'express';

import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import { addBookmark, listMyBookmarks, removeMyBookmark } from './service';
import type { ListBookmarksQuery } from './validator';

export const listBookmarksHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const query = req.query as ListBookmarksQuery;
  const result = await listMyBookmarks(req.user.id, {
    page: query.page,
    limit: query.limit,
  });
  res.status(200).json({
    success: true,
    data: {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});

export const addBookmarkHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { articleId } = req.params as { articleId: string };
  const bookmark = await addBookmark(req.user.id, articleId);
  // 200 (not 201) because POST is idempotent — a second call returns the
  // same row, and "Created" would be misleading on the no-op repeat.
  res.status(200).json({ success: true, data: { bookmark } });
});

export const removeBookmarkHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { articleId } = req.params as { articleId: string };
  await removeMyBookmark(req.user.id, articleId);
  res.status(204).send();
});
