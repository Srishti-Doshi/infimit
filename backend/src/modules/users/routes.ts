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
 *
 * Ordering rule: `/authors` and `/editors` literal routes go BEFORE param routes
 * so Express doesn't treat "authors" as a slug.
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
  uploadAvatarHandler,
} from './controller';
import {
  createEditorBodySchema,
  objectIdParamSchema,
  paginationQuerySchema,
  slugParamSchema,
  updateMeBodySchema,
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

export default router;
