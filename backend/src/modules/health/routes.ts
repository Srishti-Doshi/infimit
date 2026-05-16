import { Router } from 'express';
import { asyncHandler } from '@/shared/utils/asyncHandler';
import { getHealth, getReady, getVersion } from './controller';

/**
 * Health probes are intentionally mounted at the root, NOT under /v1, so
 * orchestrators don't need to know our API version.
 *
 * Routes:
 *   GET /healthz   — liveness
 *   GET /readyz    — readiness (mongo + redis)
 *   GET /version   — build/runtime info
 */
const router = Router();

router.get('/healthz', getHealth);
router.get('/readyz', asyncHandler(getReady));
router.get('/version', getVersion);

export default router;
