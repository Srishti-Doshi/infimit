/**
 * Search routes — Subphase 4. Contract: docs/05-api-documentation.md §5.14.
 *
 * Public endpoint, no auth. Returns published articles ranked by Mongo's
 * text score. Semantic search (`/search/semantic`) is Phase 2.
 */
import { Router } from 'express';

import { validate } from '@/middleware';
import { notImplemented } from '@/modules/_shared/notImplemented';

import { searchHandler } from './controller';
import { searchQuerySchema } from './validator';

const router = Router();

router.get('/', validate({ query: searchQuerySchema }), searchHandler);

// Semantic search — Phase 2 deliverable. Keep the stub so the route surface
// is reachable for FE mocking.
router.get('/semantic', notImplemented('Phase 2'));

export default router;
