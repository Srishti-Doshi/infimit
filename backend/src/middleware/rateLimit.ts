/**
 * Rate limiter — thin wrapper over express-rate-limit.
 *
 * Subphase 1: in-process memory store. Subphase 4+ swaps to a
 * Redis store (`rate-limit-redis`) so multiple instances share counters.
 *
 * Per docs/05-api-documentation.md §5.17:
 *   - global default: 300/min per IP
 *   - login: 5/min
 *   - register: 3/min
 *   - AI endpoints: 20/min per user
 *   - comments: 10/min per user
 *
 * Always returns the envelope from docs/05-api-documentation.md §5.4.
 */
import rateLimit, { type Options } from 'express-rate-limit';
import type { Request } from 'express';
import { ApiError } from '@/shared/errors';
import { loadEnv } from '@/config/env';

const env = loadEnv();

export interface BuildLimiterOptions {
  windowMs?: number;
  max: number;
  /**
   * Optional keyGenerator override. Defaults to IP. Use req.user?.id for
   * authenticated routes where rate is per-user, not per-IP.
   */
  keyGenerator?: Options['keyGenerator'];
}

/**
 * Read `req.rateLimit.resetTime` (populated by express-rate-limit) and convert
 * it to a `retryAfterSec` integer the FE can use to format "try again in N
 * minutes" copy. Returns undefined if the property is missing — caller still
 * gets a 429, just without specific timing.
 *
 * Structural cast: express-rate-limit doesn't ambient-augment Express's Request
 * (our own `shared/types/express.d.ts` augments `user`/`requestId`/`log` only).
 */
function retryAfterSecFromReq(req: Request): number | undefined {
  const rl = (req as Request & { rateLimit?: { resetTime?: Date } }).rateLimit;
  if (!rl?.resetTime) return undefined;
  return Math.max(1, Math.ceil((rl.resetTime.getTime() - Date.now()) / 1000));
}

export function buildLimiter(opts: BuildLimiterOptions) {
  return rateLimit({
    windowMs: opts.windowMs ?? env.RATE_LIMIT_GLOBAL_WINDOW_MS,
    max: opts.max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: opts.keyGenerator,
    handler: (req, _res, next) => {
      const retryAfterSec = retryAfterSecFromReq(req);
      next(
        ApiError.rateLimited('Too many requests', retryAfterSec ? { retryAfterSec } : undefined),
      );
    },
  });
}

/**
 * The default app-wide limiter. Mounted in app.ts before module routes.
 */
export const globalLimiter = buildLimiter({
  windowMs: env.RATE_LIMIT_GLOBAL_WINDOW_MS,
  max: env.RATE_LIMIT_GLOBAL_MAX,
});

/**
 * Per-IP limiter for the /auth/* router. 10 req/min/IP per docs §5.17.
 * This is the OUTER layer of defence — caps the script rate. The INNER layer
 * (per-account brute-force counter in `auth/brute-force.ts`) defeats
 * credential-stuffing from IP-rotated attacks.
 */
export const authLimiter = buildLimiter({
  windowMs: 60_000,
  max: 10,
});

/**
 * Per-user limiter for `POST /v1/articles/:articleId/comments`. 10/min per
 * user per docs §5.17. Keyed on the authenticated user's id (not IP) so a
 * shared NAT doesn't penalise multiple readers.
 *
 * Editors and admins bypass — they need to clear moderation backlogs without
 * tripping over the limit (doc §10 explicitly calls this out). Anonymous
 * requests fall through to the auth guard and never reach this limiter.
 */
export const commentLimiter = rateLimit({
  windowMs: 60_000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // req.user is populated by requireAuth which runs BEFORE this middleware
    // on the comments routes. Fallback to IP keeps the limiter functional
    // even if the order is ever wrong.
    return req.user?.id ?? req.ip ?? 'unknown';
  },
  skip: (req) => {
    const role = req.user?.role;
    return role === 'editor' || role === 'admin';
  },
  handler: (req, _res, next) => {
    const retryAfterSec = retryAfterSecFromReq(req);
    next(ApiError.rateLimited('Too many requests', retryAfterSec ? { retryAfterSec } : undefined));
  },
});

/**
 * Per-user limiter for `GET /v1/auth/me`. 60/min keyed on user id.
 *
 * `/me` is a cheap authenticated read that the FE polls on bootstrap, focus
 * events, and after every mutation. The shared `authLimiter` (10/min/IP) trips
 * after ~5–10 dashboard refreshes — too tight for `/me`'s call pattern, and
 * the false positives flow into the 429-misinterpreted-as-logout cluster (#20).
 * 60/min per user gives plenty of headroom while still capping runaway loops.
 */
export const meLimiter = rateLimit({
  windowMs: 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    // requireAuth runs before this limiter on /me, so req.user is populated.
    // Fallback to IP keeps the limiter functional if the order is ever wrong.
    return req.user?.id ?? req.ip ?? 'unknown';
  },
  handler: (req, _res, next) => {
    const retryAfterSec = retryAfterSecFromReq(req);
    next(ApiError.rateLimited('Too many requests', retryAfterSec ? { retryAfterSec } : undefined));
  },
});
