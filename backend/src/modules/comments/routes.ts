/**
 * Comments routes — Subphase 4.
 *
 * Comments mount under TWO surfaces in `src/routes.ts`:
 *
 *   /articles/:articleId/comments  → `articleScopedCommentRoutes`
 *     (public read of approved, authed post)
 *
 *   /comments                      → `commentModerationRoutes`
 *     (moderation queue + actions; owner-or-editor/admin delete)
 *
 * Using TWO routers (instead of one router shared by two mount points)
 * avoids the ambiguity where the same `router.get('/', ...)` matches both
 * `/articles/X/comments` and `/comments/`. Each surface has its own
 * dedicated set of routes.
 *
 * Express's `{ mergeParams: true }` on the article-scoped router lets its
 * handlers reach `req.params.articleId` from the parent mount.
 */
import { Router } from 'express';

import { commentLimiter, requireAuth, requireRole, validate } from '@/middleware';

import {
  approveCommentHandler,
  deleteCommentHandler,
  hideCommentHandler,
  listApprovedHandler,
  listPendingHandler,
  postCommentHandler,
  rejectCommentHandler,
} from './controller';
import {
  articleIdParamSchema,
  commentIdParamSchema,
  listCommentsQuerySchema,
  postCommentBodySchema,
} from './validator';

// ─── article-scoped: /articles/:articleId/comments ──────────────────────

const articleScopedCommentRoutes = Router({ mergeParams: true });

// GET /articles/:articleId/comments — public, returns approved comments
articleScopedCommentRoutes.get(
  '/',
  validate({ params: articleIdParamSchema, query: listCommentsQuerySchema }),
  listApprovedHandler,
);

// POST /articles/:articleId/comments — any authenticated user; per-user
// rate limit (10/min) with editor/admin bypass. Rate limit applies AFTER
// requireAuth so it can key on req.user.id.
articleScopedCommentRoutes.post(
  '/',
  requireAuth,
  commentLimiter,
  validate({ params: articleIdParamSchema, body: postCommentBodySchema }),
  postCommentHandler,
);

export { articleScopedCommentRoutes };
export default articleScopedCommentRoutes;

// ─── standalone moderation: /comments ───────────────────────────────────

const commentModerationRoutes = Router();

// GET /comments/pending — moderation queue, editor/admin only.
commentModerationRoutes.get(
  '/pending',
  requireAuth,
  requireRole('editor', 'admin'),
  validate({ query: listCommentsQuerySchema }),
  listPendingHandler,
);

// POST /comments/:id/approve|reject|hide — editor/admin moderation actions.
commentModerationRoutes.post(
  '/:id/approve',
  requireAuth,
  requireRole('editor', 'admin'),
  validate({ params: commentIdParamSchema }),
  approveCommentHandler,
);
commentModerationRoutes.post(
  '/:id/reject',
  requireAuth,
  requireRole('editor', 'admin'),
  validate({ params: commentIdParamSchema }),
  rejectCommentHandler,
);
commentModerationRoutes.post(
  '/:id/hide',
  requireAuth,
  requireRole('editor', 'admin'),
  validate({ params: commentIdParamSchema }),
  hideCommentHandler,
);

// DELETE /comments/:id — owner OR editor/admin. Service enforces the OR.
commentModerationRoutes.delete(
  '/:id',
  requireAuth,
  validate({ params: commentIdParamSchema }),
  deleteCommentHandler,
);

export { commentModerationRoutes };
