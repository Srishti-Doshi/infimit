/**
 * E-paper routes — Subphase 4. Contract: docs/05-api-documentation.md §5.11.
 *
 * Endpoints:
 *   POST   /v1/epapers              admin only
 *   GET    /v1/epapers              public (paginated archive)
 *   GET    /v1/epapers/:id          public
 *   GET    /v1/epapers/:id/download public — 302 redirect to presigned S3 GET
 *   DELETE /v1/epapers/:id          admin only
 *
 * Ordering rule: `/:id/download` must be registered AFTER `/:id` only if
 * Express needed disambiguation — but they don't conflict because the
 * router matches them as distinct paths.
 */
import { Router } from 'express';

import { requireAuth, requireRole, validate } from '@/middleware';

import {
  createEpaperHandler,
  deleteEpaperHandler,
  downloadEpaperHandler,
  getEpaperHandler,
  listEpapersHandler,
} from './controller';
import { createEpaperBodySchema, epaperIdParamSchema, listEpapersQuerySchema } from './validator';

const router = Router();

// ─── public reads ────────────────────────────────────────────────────────
router.get('/', validate({ query: listEpapersQuerySchema }), listEpapersHandler);
router.get('/:id/download', validate({ params: epaperIdParamSchema }), downloadEpaperHandler);
router.get('/:id', validate({ params: epaperIdParamSchema }), getEpaperHandler);

// ─── admin mutations ────────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validate({ body: createEpaperBodySchema }),
  createEpaperHandler,
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validate({ params: epaperIdParamSchema }),
  deleteEpaperHandler,
);

export default router;
