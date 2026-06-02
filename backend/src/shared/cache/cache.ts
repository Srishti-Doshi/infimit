/**
 * Redis-backed cache wrapper.
 *
 * `getOrSet(key, ttl, fn)` is the workhorse — checks Redis, returns the
 * cached value if present, otherwise runs `fn`, stores the result, and
 * returns it. Single-flight: if N concurrent callers ask for the same key
 * during a cache miss, only ONE runs `fn`; the others await the same
 * in-flight promise. This kills cache-stampede on publish-time invalidation
 * (the doc'd risk from Subphase 4 §10).
 *
 * Single-flight is process-local — fine in P1 with one Node process per
 * region. Scaling to multiple replicas would need a Redis SETNX lock; track
 * for P2.
 *
 * Values are JSON-serialised. Anything that survives `JSON.stringify` +
 * `JSON.parse` round-trips. Don't put Mongoose documents in here without
 * calling `.toJSON()` first.
 */
import { getRedis } from '@/config/redis';
import { logger } from '@/config/logger';

const inFlight = new Map<string, Promise<unknown>>();

export interface GetOrSetOptions {
  /**
   * Skip the cache read and force the loader. Used for `force=true`
   * regenerate flows where the caller WANTS a fresh value. Still writes
   * the result back to the cache.
   */
  forceRefresh?: boolean;
}

export async function getOrSet<T>(
  key: string,
  ttlSeconds: number,
  loader: () => Promise<T>,
  options: GetOrSetOptions = {},
): Promise<T> {
  const redis = getRedis();

  if (!options.forceRefresh) {
    try {
      const cached = await redis.get(key);
      if (cached !== null) {
        return JSON.parse(cached) as T;
      }
    } catch (err) {
      // Cache read failed (redis down, parse error). Log + fall through to
      // recompute — never let a cache hiccup break the request path.
      logger.warn({ err, key }, 'cache_get_failed');
    }
  }

  // Single-flight: coalesce concurrent misses on the same key onto one
  // loader invocation. Critical for cache-stampede prevention when a
  // popular article gets invalidated.
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = (async (): Promise<T> => {
    try {
      const value = await loader();
      try {
        await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
      } catch (err) {
        // Cache write failed — log and continue. The caller still gets
        // their value; the cache just misses again next time.
        logger.warn({ err, key }, 'cache_set_failed');
      }
      return value;
    } finally {
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, promise);
  return promise;
}

/**
 * Drop one or more keys from the cache. Safe to call with zero keys (no-op).
 * Used by state-changing flows (publish, unpublish, regenerate-AI) to
 * invalidate the views that depend on the changed article.
 *
 * Failures are swallowed + logged — a stale cache entry for 5 minutes is a
 * worse user experience than a failed state transition.
 */
export async function del(...keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  try {
    const redis = getRedis();
    await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, keys }, 'cache_del_failed');
  }
}

/**
 * Test-only: clears the in-flight map so an aborted test doesn't leak
 * promises into the next case. Does NOT touch Redis — pair with the
 * existing `_redisMock.__resetRedisMock()` for full reset.
 */
export function resetCacheForTests(): void {
  inFlight.clear();
}
