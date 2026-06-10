/**
 * Express app factory.
 *
 * Returns a configured Express app WITHOUT starting an HTTP server. This
 * separation lets tests import and pass to supertest without binding a port.
 *
 * Middleware order (per docs/02-system-architecture.md §2.4):
 *   1. requestId            — X-Request-Id correlation (FIRST: every later
 *                              error/log line carries the id, including
 *                              CORS/helmet rejections)
 *   2. helmet               — security headers
 *   3. cors                 — origin allow-list
 *   4. compression          — gzip responses
 *   5. globalLimiter        — rate limit BEFORE body parsing (cap DoS surface)
 *   6. JSON / urlencoded    — body parsers (1 MB limit)
 *   7. requestLogger        — pino-http per-request line
 *   8. healthz / readyz / version
 *   9. /v1 routes
 *  10. notFound
 *  11. errorHandler
 *
 * Ambient declarations under src/shared/types/*.d.ts are picked up automatically
 * via tsconfig "include" — no runtime import needed.
 */
import compression from 'compression';
import cookieParser from 'cookie-parser';
import express, { type Express } from 'express';
import helmet from 'helmet';

import {
  corsMiddleware,
  errorHandler,
  globalLimiter,
  notFound,
  requestId,
  requestLogger,
} from '@/middleware';
import { healthRoutes } from '@/modules/health';
import apiV1 from './routes';
import { registerEventListeners } from '@/modules/events';
import { startMediaSweeper } from '@/modules/media/sweeper';
import { loadEnv } from '@/config/env';

const JSON_BODY_LIMIT = '1mb';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // honour X-Forwarded-* from one upstream proxy

  app.use(requestId);
  app.use(helmet());
  app.use(corsMiddleware);
  app.use(compression());
  app.use(cookieParser());

  app.use(globalLimiter);

  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: JSON_BODY_LIMIT }));
  app.use(requestLogger);

  // Root-mounted (not /v1) so orchestrators don't need version awareness.
  app.use(healthRoutes);

  app.use('/v1', apiV1);

  app.use(notFound);
  app.use(errorHandler);

  registerEventListeners();

  // Background job: GC orphan media (refCount === 0, older than the grace
  // period). Skipped in tests because `setInterval` would otherwise keep
  // the suite from exiting cleanly; tests call `sweepOrphansOnce` directly
  // when they need to exercise the logic. Pins #82.
  if (loadEnv().NODE_ENV !== 'test') {
    startMediaSweeper();
  }

  return app;
}
