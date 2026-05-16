/**
 * notifications routes — SKELETON. Implemented in Subphase 4.
 * Contract: docs/05-api-documentation.md §5.9
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 4');

router.get('/', todo);
router.post('/:id/read', todo);
router.post('/read-all', todo);

export default router;
