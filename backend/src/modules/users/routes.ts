/**
 * users routes — SKELETON. Real implementation in Subphase 2.
 * Contract: docs/05-api-documentation.md §5.2
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 2');

router.get('/', todo); // admin-only listing
router.get('/:id', todo);
router.patch('/me', todo);
router.patch('/:id/role', todo); // admin
router.post('/me/avatar', todo);

export default router;
