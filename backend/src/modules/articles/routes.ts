/**
 * Articles routes — implemented across Subphases 3, 4 and 5.
 * Contract: docs/05-api-documentation.md §5.5
 *
 *   Subphase 3 (now): create / update / list / get-by-id / submit / delete
 *   Subphase 4:        approve / reject / publish / unpublish / placement / ai
 *   Subphase 5:        public feeds (home/trending/category), slug-read, pdf
 *
 * Ordering rule: literal-segment routes (e.g. `/feed/*`) MUST come before
 * `/:id` so Express doesn't match "feed" as an ObjectId.
 */
import { Router } from 'express';

import { requireAuth, requireRole, validate } from '@/middleware';
import { notImplemented } from '@/modules/_shared/notImplemented';

import {
  createArticleHandler,
  deleteArticleHandler,
  getArticleHandler,
  listArticlesHandler,
  submitArticleHandler,
  updateArticleHandler,
} from './controller';
import {
  articleIdParamSchema,
  createArticleBodySchema,
  listArticlesQuerySchema,
  updateArticleBodySchema,
} from './validator';

const router = Router();

// ─── Subphase 5 stubs (must come BEFORE /:id so they don't shadow it) ───
router.get('/feed/home', notImplemented('Subphase 5'));
router.get('/feed/trending', notImplemented('Subphase 5'));
router.get('/search', notImplemented('Subphase 5'));
router.get('/slug/:slug', notImplemented('Subphase 4'));

// ─── Subphase 3 — implemented now ───────────────────────────────────────
// Role gates mirror the docs/05-api-documentation.md §5.5 matrix:
//   POST /articles            ✍️📝👑   (no readers)
//   GET  /articles, /:id      👤        (any authenticated; service narrows)
//   PATCH /:id                ✍️📝👑   (service further enforces ownership)
//   POST /:id/submit          ✍️        (author-only; service confirms it's
//                                          the article's author)
//   DELETE /:id               ✍️📝👑   (service further enforces ownership)
router.post(
  '/',
  requireAuth,
  requireRole('author', 'editor', 'admin'),
  validate({ body: createArticleBodySchema }),
  createArticleHandler,
);
router.get('/', requireAuth, validate({ query: listArticlesQuerySchema }), listArticlesHandler);
router.get('/:id', requireAuth, validate({ params: articleIdParamSchema }), getArticleHandler);
router.patch(
  '/:id',
  requireAuth,
  requireRole('author', 'editor', 'admin'),
  validate({ params: articleIdParamSchema, body: updateArticleBodySchema }),
  updateArticleHandler,
);
router.post(
  '/:id/submit',
  requireAuth,
  requireRole('author'),
  validate({ params: articleIdParamSchema }),
  submitArticleHandler,
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('author', 'editor', 'admin'),
  validate({ params: articleIdParamSchema }),
  deleteArticleHandler,
);

// ─── Subphase 4 stubs ───────────────────────────────────────────────────
router.post('/:id/approve', notImplemented('Subphase 4'));
router.post('/:id/reject', notImplemented('Subphase 4'));
router.post('/:id/publish', notImplemented('Subphase 4'));
router.post('/:id/unpublish', notImplemented('Subphase 4'));
router.patch('/:id/placement', notImplemented('Subphase 4'));
router.post('/:id/ai/summary', notImplemented('Subphase 4'));
router.post('/:id/ai/tts', notImplemented('Subphase 4'));

// ─── Subphase 5 stubs ───────────────────────────────────────────────────
router.get('/:id/pdf', notImplemented('Subphase 5'));

export default router;
