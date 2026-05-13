/**
 * Express app factory.
 *
 * Returns a configured Express app WITHOUT starting an HTTP server. This
 * separation lets tests import and pass to supertest without binding a port.
 *
 * Middleware order (per docs/02-system-architecture.md §2.4):
 *   1. helmet               — security headers
 *   2. cors                 — origin allow-list
 *   3. compression          — gzip responses
 *   4. requestId            — X-Request-Id correlation
 *   5. JSON / urlencoded    — body parsers (1 MB limit)
 *   6. requestLogger        — pino-http per-request line
 *   7. globalLimiter        — rate limiter (per-IP)
 *   8. healthz / readyz / version
 *   9. /v1 routes
 *  10. notFound
 *  11. errorHandler
 */
import './shared/types/express.d'; // ensure ambient declaration is loaded

import express, { type Express } from 'express';
import helmet from 'helmet';
import compression from 'compression';

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

const JSON_BODY_LIMIT = '1mb';

export function createApp(): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // honour X-Forwarded-* from one upstream proxy

  app.use(helmet());
  app.use(corsMiddleware);
  app.use(compression());

  app.use(requestId);
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(express.urlencoded({ extended: false, limit: JSON_BODY_LIMIT }));
  app.use(requestLogger);

  app.use(globalLimiter);

  // Root-mounted (not /v1) so orchestrators don't need version awareness.
  app.use(healthRoutes);

  app.use('/v1', apiV1);

  app.use(notFound);
  app.use(errorHandler);

  registerEventListeners();

  return app;
}
