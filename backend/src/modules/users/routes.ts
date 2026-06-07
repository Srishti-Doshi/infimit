/**
 * Users routes — Subphase 2.
 *
 * Endpoint matrix (contract: docs/05-api-documentation.md §5.3):
 *   GET    /me                 — authenticated  (any role)
 *   PATCH  /me                 — authenticated  (any role)
 *   POST   /me/avatar          — authenticated  (any role)   — 501 until Subphase 3
 *   GET    /authors            — public                       — paginated author list
 *   GET    /authors/:slug      — public                       — single author profile
 *   GET    /editors            — admin                        — paginated editor list
 *   POST   /editors            — admin                        — create editor + welcome email
 *   DELETE /editors/:id        — admin                        — soft-delete editor
 *   PATCH  /:id/role           — admin                        — change a user's role
 *
 * Ordering rule: `/authors` and `/editors` literal routes go BEFORE param routes
 * so Express doesn't treat "authors" as a slug. The `:id/role` pattern lives at
 * the bottom for the same reason — it would otherwise greedily capture literal
 * segments above it.
 */
import { Router } from 'express';

import { requireAuth, requireRole, validate } from '@/middleware';

import {
  createEditorHandler,
  getAuthorBySlugHandler,
  getMeHandler,
  listAuthorsHandler,
  listEditorsHandler,
  removeEditorHandler,
  updateMeHandler,
  updateUserRoleHandler,
  uploadAvatarHandler,
} from './controller';
import {
  createEditorBodySchema,
  objectIdParamSchema,
  paginationQuerySchema,
  slugParamSchema,
  updateMeBodySchema,
  updateRoleBodySchema,
} from './validator';

const router = Router();

// ─── self-service ────────────────────────────────────────────────────────
router.get('/me', requireAuth, getMeHandler);
router.patch('/me', requireAuth, validate({ body: updateMeBodySchema }), updateMeHandler);
router.post('/me/avatar', requireAuth, uploadAvatarHandler);

// ─── public authors ──────────────────────────────────────────────────────
router.get('/authors', validate({ query: paginationQuerySchema }), listAuthorsHandler);
router.get('/authors/:slug', validate({ params: slugParamSchema }), getAuthorBySlugHandler);

// ─── admin: editors ──────────────────────────────────────────────────────
router.get(
  '/editors',
  requireAuth,
  requireRole('admin'),
  validate({ query: paginationQuerySchema }),
  listEditorsHandler,
);
router.post(
  '/editors',
  requireAuth,
  requireRole('admin'),
  validate({ body: createEditorBodySchema }),
  createEditorHandler,
);
router.delete(
  '/editors/:id',
  requireAuth,
  requireRole('admin'),
  validate({ params: objectIdParamSchema }),
  removeEditorHandler,
);

// ─── admin: any-user role change ─────────────────────────────────────────
// Belongs at the bottom so the literal-prefix routes above (`/me`, `/authors`,
// `/editors`) match first; `/:id/role` would otherwise capture them as ids.
router.patch(
  '/:id/role',
  requireAuth,
  requireRole('admin'),
  validate({ params: objectIdParamSchema, body: updateRoleBodySchema }),
  updateUserRoleHandler,
);

export default router;
