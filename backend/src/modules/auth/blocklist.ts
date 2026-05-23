/**
 * Redis jti blocklist — fast O(1) revocation check for JWTs.
 *
 * Two scenarios push a jti to the blocklist:
 *   1. Refresh-token rotation: the old refresh's jti is blocked immediately
 *      after a successful rotate (so the FE's prior cookie can never be
 *      replayed even within its remaining 30-day TTL).
 *   2. Logout / password-change: every revoked session's jti is blocked.
 *
 * Each entry's Redis TTL matches the token's natural expiry. Once the JWT
 * would have expired anyway, the blocklist entry is auto-purged. The
 * `Session` collection in Mongo is the durable record; this Redis layer
 * is the hot-path read.
 *
 * Key shape: `blocklist:jti:<jti>` → value `'1'` (irrelevant, only existence matters).
 * The `infimit:` prefix from REDIS_KEY_PREFIX is added automatically by ioredis.
 */
import { getRedis } from '@/config/redis';

const BLOCKLIST_KEY = (jti: string): string => `blocklist:jti:${jti}`;

/**
 * Push a jti to the blocklist with TTL = (expiresAt - now), floored to 1 second.
 * If `expiresAt` is in the past we still write a 1-second sentinel so an
 * immediately-following check returns true (handles clock skew gracefully).
 */
export async function blocklistJti(jti: string, expiresAt: Date): Promise<void> {
  const ttlSeconds = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
  const redis = getRedis();
  await redis.set(BLOCKLIST_KEY(jti), '1', 'EX', ttlSeconds);
}

/**
 * O(1) check used by authGuard and the refresh path. Returns true if the jti
 * is currently in the blocklist (i.e., the token must be rejected).
 */
export async function isJtiBlocklisted(jti: string): Promise<boolean> {
  const redis = getRedis();
  const exists = await redis.exists(BLOCKLIST_KEY(jti));
  return exists === 1;
}
