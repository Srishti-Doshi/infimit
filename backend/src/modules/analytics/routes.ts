/**
 * analytics routes — SKELETON. Implemented in Subphase 5.
 * Contract: docs/05-api-documentation.md §5.8
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 5');

router.post('/track', todo);
router.get('/articles/:id', todo);
router.get('/authors/:id', todo);
router.get('/platform', todo); // admin

export default router;
