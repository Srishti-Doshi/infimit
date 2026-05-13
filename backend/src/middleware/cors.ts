/**
 * CORS middleware — strict allow-list from env.
 *
 * Per docs/10-security.md §10.2:
 *  - Production: only configured origins
 *  - Development: localhost:5173 (Vite) by default
 *  - Credentials enabled so cookies (refresh token) flow
 */
import cors from 'cors';
import { loadEnv } from '@/config/env';
import { ApiError } from '@/shared/errors';

const env = loadEnv();

const allowed = new Set(env.CORS_ORIGINS);

export const corsMiddleware = cors({
  origin(origin, callback) {
    // Same-origin / non-browser requests (curl, server-to-server) have no Origin.
    if (!origin) return callback(null, true);
    if (allowed.has(origin)) return callback(null, true);
    if (env.NODE_ENV === 'development' && origin.startsWith('http://localhost')) {
      return callback(null, true);
    }
    // Forward as ApiError so the global errorHandler emits the standard 403
    // envelope instead of a generic 500 INTERNAL_ERROR.
    return callback(ApiError.forbidden(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Internal-Key'],
  exposedHeaders: ['X-Request-Id'],
  maxAge: 86_400,
});
