/**
 * organisations routes — SKELETON. Implemented in Subphase 2.
 * Contract: docs/05-api-documentation.md §5.3
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 2');

router.get('/', todo);
router.get('/:id', todo);
router.post('/', todo);            // admin
router.patch('/:id', todo);
router.delete('/:id', todo);       // admin

export default router;
