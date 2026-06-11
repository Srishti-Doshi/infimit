/**
 * Bookmarks routes — docs/05-api-documentation.md §5.13.
 *
 *   GET    /v1/bookmarks               👤 paginated "my bookmarks"
 *   POST   /v1/bookmarks/:articleId    👤 idempotent add (200 on first +
 *                                          repeat)
 *   DELETE /v1/bookmarks/:articleId    👤 idempotent remove (204 either way)
 *
 * All three require auth — bookmarks are always scoped to the calling
 * user. The route never accepts a userId param; scope is bound from
 * `req.user.id` in the controller.
 */
import { Router } from 'express';

import { requireAuth, validate } from '@/middleware';

import { addBookmarkHandler, listBookmarksHandler, removeBookmarkHandler } from './controller';
import { bookmarkArticleParamSchema, listBookmarksQuerySchema } from './validator';

const router = Router();

router.get('/', requireAuth, validate({ query: listBookmarksQuerySchema }), listBookmarksHandler);
router.post(
  '/:articleId',
  requireAuth,
  validate({ params: bookmarkArticleParamSchema }),
  addBookmarkHandler,
);
router.delete(
  '/:articleId',
  requireAuth,
  validate({ params: bookmarkArticleParamSchema }),
  removeBookmarkHandler,
);

export default router;
