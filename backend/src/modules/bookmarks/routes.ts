/**
 * bookmarks routes — SKELETON. Implemented in Subphase 5.
 * Contract: docs/05-api-documentation.md §5.13
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 5');

router.get('/', todo);
router.post('/:articleId', todo);
router.delete('/:articleId', todo);

export default router;
