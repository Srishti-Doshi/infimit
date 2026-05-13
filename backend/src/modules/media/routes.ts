/**
 * media routes — SKELETON. Implemented in Subphase 3.
 * Contract: docs/05-api-documentation.md §5.7
 */
import { Router } from 'express';
import { notImplemented } from '@/modules/_shared/notImplemented';

const router = Router();
const todo = notImplemented('Subphase 3');

router.post('/presign', todo);   // returns S3 presigned PUT URL
router.post('/confirm', todo);   // commits media metadata to DB
router.delete('/:id', todo);

export default router;
