/**
 * Media routes — Subphase 3. Contract: docs/05-api-documentation.md §5.7.
 *
 * Endpoints:
 *   POST   /upload-url   authenticated (any role)  — request a presigned PUT URL
 *   POST   /register     authenticated (any role)  — confirm upload, persist doc
 *   GET    /:id          public                    — fetch media metadata
 *   DELETE /:id          owner / editor / admin    — delete (service enforces RBAC)
 */
import { Router } from 'express';

import { requireAuth, validate } from '@/middleware';

import {
  deleteMediaHandler,
  getMediaHandler,
  registerHandler,
  uploadUrlHandler,
} from './controller';
import { mediaIdParamSchema, registerBodySchema, uploadUrlBodySchema } from './validator';

const router = Router();

router.post('/upload-url', requireAuth, validate({ body: uploadUrlBodySchema }), uploadUrlHandler);
router.post('/register', requireAuth, validate({ body: registerBodySchema }), registerHandler);
router.get('/:id', validate({ params: mediaIdParamSchema }), getMediaHandler);
router.delete('/:id', requireAuth, validate({ params: mediaIdParamSchema }), deleteMediaHandler);

export default router;
