/**
 * articles routes — SKELETON. Implemented across Subphases 3, 4 and 5.
 * Contract: docs/05-api-documentation.md §5.5
 *
 *   Subphase 3: create (draft), update, submit, list-mine, get-by-id
 *   Subphase 4: approve, reject, publish, unpublish, placement, regenerate-ai
 *   Subphase 5: feeds (home/trending/category), pdf, slug-read
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();

// Subphase 3
router.post('/', notImplemented('Subphase 3'));
router.get('/', notImplemented('Subphase 5'));
router.get('/feed/home', notImplemented('Subphase 5'));
router.get('/feed/trending', notImplemented('Subphase 5'));
router.get('/mine', notImplemented('Subphase 3'));
router.get('/:id', notImplemented('Subphase 3'));
router.get('/slug/:slug', notImplemented('Subphase 4'));
router.patch('/:id', notImplemented('Subphase 3'));
router.delete('/:id', notImplemented('Subphase 3'));
router.post('/:id/submit', notImplemented('Subphase 3'));

// Subphase 4
router.post('/:id/approve', notImplemented('Subphase 4'));
router.post('/:id/reject', notImplemented('Subphase 4'));
router.post('/:id/publish', notImplemented('Subphase 4'));
router.post('/:id/unpublish', notImplemented('Subphase 4'));
router.patch('/:id/placement', notImplemented('Subphase 4'));
router.post('/:id/ai/summary', notImplemented('Subphase 4'));

// Subphase 5
router.get('/:id/pdf', notImplemented('Subphase 5'));

export default router;
