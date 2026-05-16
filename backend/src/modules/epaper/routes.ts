/**
 * epaper routes — SKELETON. Implemented in Subphase 4.
 * Contract: docs/05-api-documentation.md §5.11
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 4');

router.get('/', todo);
router.get('/:id', todo);
router.get('/:id/download', todo);
router.post('/', todo); // admin
router.delete('/:id', todo); // admin

export default router;
