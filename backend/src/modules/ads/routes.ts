/**
 * ads routes — SKELETON. Implemented in Phase 2 (per docs/09-development-phases.md §9.2).
 * Surface reserved so the module breakdown matches the canonical layout.
 * Contract: docs/05-api-documentation.md §5.10
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Phase 2');

router.get('/', todo);
router.post('/', todo);
router.patch('/:id', todo);
router.delete('/:id', todo);
router.post('/impression', todo);
router.post('/click', todo);

export default router;
