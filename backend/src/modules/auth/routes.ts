/**
 * Auth routes — all endpoints wired as of Subphase 2 Step 7.
 * Contract: docs/05-api-documentation.md §5.2.
 *
 * Rate limiting (10 req/min/IP) attaches at the router level in Step 8.
 */
import { Router } from 'express';

import { requireAuth } from '@/middleware/authGuard';

import {
  forgotPassword,
  login,
  logout,
  me,
  refresh,
  register,
  resetPasswordHandler,
  verifyEmailHandler,
} from './controller';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.post('/refresh', refresh);
router.post('/logout', requireAuth, logout);
router.get('/me', requireAuth, me);

// Email verification + password reset (single-use signed JWTs).
router.post('/verify-email', verifyEmailHandler);
router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPasswordHandler);

export default router;
