/**
 * tags routes — SKELETON. Implemented in Subphase 3.
 * Contract: docs/05-api-documentation.md §5.15
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 3');

router.get('/', todo);
router.get('/suggest', todo); // typeahead

export default router;
