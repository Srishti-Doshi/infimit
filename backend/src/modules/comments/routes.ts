/**
 * comments routes — SKELETON. Implemented in Subphase 4.
 * Contract: docs/05-api-documentation.md §5.6
 *
 * Comments mount in two places:
 *  /articles/:articleId/comments  — read + post
 *  /comments/...                  — moderation actions (editor/admin)
 *
 * Subphase 1 mounts both surfaces at /comments and /articles/:articleId/comments.
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 4');

// Article-scoped routes (mounted at /articles/:articleId/comments by parent router)
router.get('/', todo);          // public — approved
router.post('/', todo);         // reader+

// Standalone moderation routes (mounted at /comments)
router.get('/pending', todo);   // editor/admin
router.post('/:id/approve', todo);
router.post('/:id/reject', todo);
router.post('/:id/hide', todo);
router.delete('/:id', todo);

export default router;
