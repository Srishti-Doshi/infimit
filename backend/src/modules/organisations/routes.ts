/**
 * Organisations routes — Subphase 2.
 *
 * Endpoint matrix (contract: docs/05-api-documentation.md §5.3):
 *   GET    /                  — public   — paginated list, optional ?category=&q=
 *   GET    /by-slug/:slug     — public   — used by author-register lookup
 *   GET    /:id               — public   — single org by ObjectId
 *   POST   /                  — admin
 *   PATCH  /:id               — admin
 *   DELETE /:id               — admin
 *
 * Ordering rule: `/by-slug/:slug` must come BEFORE `/:id` so Express doesn't
 * try to match "by-slug" as an ObjectId param.
 */
import { Router } from 'express';

import { requireAuth, requireRole, validate } from '@/middleware';

import {
  createOrganisationHandler,
  deleteOrganisationHandler,
  getOrganisationByIdHandler,
  getOrganisationBySlugHandler,
  listOrganisationsHandler,
  updateOrganisationHandler,
} from './controller';
import {
  createOrganisationBodySchema,
  listOrganisationsQuerySchema,
  organisationIdParamSchema,
  organisationSlugParamSchema,
  updateOrganisationBodySchema,
} from './validator';

const router = Router();

// ─── public reads ────────────────────────────────────────────────────────
router.get('/', validate({ query: listOrganisationsQuerySchema }), listOrganisationsHandler);
router.get(
  '/by-slug/:slug',
  validate({ params: organisationSlugParamSchema }),
  getOrganisationBySlugHandler,
);
router.get('/:id', validate({ params: organisationIdParamSchema }), getOrganisationByIdHandler);

// ─── admin mutations ─────────────────────────────────────────────────────
router.post(
  '/',
  requireAuth,
  requireRole('admin'),
  validate({ body: createOrganisationBodySchema }),
  createOrganisationHandler,
);
router.patch(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validate({ params: organisationIdParamSchema, body: updateOrganisationBodySchema }),
  updateOrganisationHandler,
);
router.delete(
  '/:id',
  requireAuth,
  requireRole('admin'),
  validate({ params: organisationIdParamSchema }),
  deleteOrganisationHandler,
);

export default router;
