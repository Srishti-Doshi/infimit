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

import { optionalAuth, requireAuth, requireRole, validate } from '@/middleware';
import { notImplemented } from '@/modules/_shared/notImplemented';

import {
  approveArticleHandler,
  createArticleHandler,
  deleteArticleHandler,
  getArticleBySlugHandler,
  getArticleHandler,
  getHomeFeedHandler,
  getTrendingFeedHandler,
  listArticlesHandler,
  publishArticleHandler,
  regenerateSummaryHandler,
  rejectArticleHandler,
  setPlacementHandler,
  submitArticleHandler,
  unpublishArticleHandler,
  updateArticleHandler,
} from './controller';
import {
  articleIdParamSchema,
  articleSlugParamSchema,
  createArticleBodySchema,
  listArticlesQuerySchema,
  placementBodySchema,
  regenerateSummaryBodySchema,
  rejectArticleBodySchema,
  updateArticleBodySchema,
} from './validator';

const router = Router();

// ─── Subphase 5 — public reader feeds (no auth) ────────────────────────
// Must come BEFORE the `/:id` route so Express doesn't match "feed" as an
// ObjectId. `/search` is served by the dedicated search module at
// `/v1/search` per docs/05-api-documentation.md §5.14; the placeholder here
// stays as a routing reminder for any straggler call that lands on it.
router.get('/feed/home', getHomeFeedHandler);
router.get('/feed/trending', getTrendingFeedHandler);
router.get('/search', notImplemented('Subphase 5'));

// ─── Subphase 4 — public slug read (cached) ─────────────────────────────
// Public, no auth — returns a PUBLISHED article via the article:slug:<slug>
// Redis cache. Cache invalidation runs on publish/unpublish/regenerate.
router.get('/slug/:slug', validate({ params: articleSlugParamSchema }), getArticleBySlugHandler);

// ─── Subphase 3 — implemented now ───────────────────────────────────────
// Role gates mirror the docs/05-api-documentation.md §5.5 matrix, with two
// pragmatic widenings from the strict ✍️ icon read:
//   - submit accepts admin so platform owners can dogfood the full author flow
//     (Day-13 follow-up from PR #7 — service-layer ownership check still
//     prevents admin from submitting someone ELSE's draft).
//   - submit accepts editor (Subphase 4 QA follow-up — see issue #32). The
//     COI concern that originally kept editor out is now handled at the
//     approve step: `approveArticle` rejects when actor === article.authorId.
//
//   POST /articles            ✍️📝👑   (no readers)
//   GET  /articles, /:id      👤        (any authenticated; service narrows)
//   PATCH /:id                ✍️📝👑   (service further enforces ownership)
//   POST /:id/submit          ✍️📝👑   (author, editor, or admin; service
//                                          confirms actor owns the article;
//                                          approve step blocks self-approve)
//   DELETE /:id               ✍️📝👑   (service further enforces ownership)
router.post(
  '/',
  requireAuth,
  requireRole('author', 'editor', 'admin'),
  validate({ body: createArticleBodySchema }),
  createArticleHandler,
);
// `GET /v1/articles` is dual-mode (see controller doc). `optionalAuth`
// populates `req.user` if a valid Bearer is present, otherwise passes
// through; the controller decides between the dashboard list and the
// public reader list based on query shape + auth presence.
router.get('/', optionalAuth, validate({ query: listArticlesQuerySchema }), listArticlesHandler);
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
  requireRole('author', 'editor', 'admin'),
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

// ─── Subphase 4 — editorial lifecycle ───────────────────────────────────
// Role gates per docs/05-api-documentation.md §5.5:
//   POST /:id/approve         📝👑       (editor or admin; cannot approve a
//                                          submission you authored — COI guard
//                                          in approveArticle service)
//   POST /:id/reject          📝👑       (editor or admin)
//   POST /:id/publish         📝👑       (editor or admin)
//   POST /:id/unpublish       👑          (admin ONLY — bigger blast radius)
//   PATCH /:id/placement      📝👑       (editor or admin)
//   POST /:id/ai/summary      📝✍️👑    (editor, admin, OR author-of-own —
//                                          service further enforces ownership)
router.post(
  '/:id/approve',
  requireAuth,
  requireRole('editor', 'admin'),
  validate({ params: articleIdParamSchema }),
  approveArticleHandler,
);
router.post(
  '/:id/reject',
  requireAuth,
  requireRole('editor', 'admin'),
  validate({ params: articleIdParamSchema, body: rejectArticleBodySchema }),
  rejectArticleHandler,
);
router.post(
  '/:id/publish',
  requireAuth,
  requireRole('editor', 'admin'),
  validate({ params: articleIdParamSchema }),
  publishArticleHandler,
);
router.post(
  '/:id/unpublish',
  requireAuth,
  requireRole('admin'),
  validate({ params: articleIdParamSchema }),
  unpublishArticleHandler,
);
router.patch(
  '/:id/placement',
  requireAuth,
  requireRole('editor', 'admin'),
  validate({ params: articleIdParamSchema, body: placementBodySchema }),
  setPlacementHandler,
);
router.post(
  '/:id/ai/summary',
  requireAuth,
  requireRole('author', 'editor', 'admin'),
  validate({ params: articleIdParamSchema, body: regenerateSummaryBodySchema }),
  regenerateSummaryHandler,
);

// TTS regeneration is Subphase 4+ but doesn't ship in PR #10 — kept as a stub.
router.post('/:id/ai/tts', notImplemented('Subphase 4'));

// ─── Subphase 5 stubs ───────────────────────────────────────────────────
router.get('/:id/pdf', notImplemented('Subphase 5'));

export default router;
