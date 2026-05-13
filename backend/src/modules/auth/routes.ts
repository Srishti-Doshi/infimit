/**
 * auth routes — SKELETON. Real implementation in Subphase 2.
 * Contract: docs/05-api-documentation.md §5.1
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 2');

router.post('/register', todo);
router.post('/login', todo);
router.post('/refresh', todo);
router.post('/logout', todo);
router.post('/forgot-password', todo);
router.post('/reset-password', todo);
router.get('/me', todo);

export default router;
