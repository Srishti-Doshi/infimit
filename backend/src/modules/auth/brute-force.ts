/**
 * Per-account brute-force counter — defeats credential stuffing even when the
 * attacker rotates IPs (which the per-IP rate limiter alone wouldn't catch).
 *
 * State lives in Redis, keyed by lowercased email:
 *   - `bf:fail:<email>`    — running failure count (TTL = 1h sliding window)
 *   - `bf:lock:<email>`    — lockout sentinel (TTL = 15m)
 *
 * Flow (called from auth/service.ts loginUser):
 *   1. Check `isAccountLocked(email)` BEFORE looking up the user. Locked → 429.
 *   2. On a failed password check, `recordFailedLogin(email)`.
 *      Once count ≥ 10 within the window, lock the account for 15 minutes and
 *      reset the counter. Return `locked: true` so the caller can surface 429.
 *   3. On a successful login, `clearFailedLogins(email)`.
 *
 * Failures are recorded against any email — including ones that don't exist —
 * because per-account counting from "non-existent" emails would let an attacker
 * differentiate by absence-of-lockout. Defence-in-depth even against the
 * unlikely case where enumeration is otherwise possible.
 */
import { getRedis } from '@/config/redis';

const FAIL_KEY = (email: string): string => `bf:fail:${email}`;
const LOCK_KEY = (email: string): string => `bf:lock:${email}`;

const FAILURE_WINDOW_SEC = 60 * 60; // 1 hour sliding window
const LOCKOUT_THRESHOLD = 10;
const LOCKOUT_SEC = 15 * 60; // 15 minute lockout after threshold

export interface LockStatus {
  locked: boolean;
  /** Seconds until the lockout expires. Only present when locked = true. */
  retryAfterSec?: number;
}

export async function isAccountLocked(email: string): Promise<LockStatus> {
  const redis = getRedis();
  const ttl = await redis.ttl(LOCK_KEY(email));
  if (ttl > 0) {
    return { locked: true, retryAfterSec: ttl };
  }
  return { locked: false };
}

/**
 * Increment the failure counter. If the threshold is exceeded, set the lockout
 * sentinel and clear the counter.
 *
 * Returns the resulting lock status — callers may want to surface a 429
 * immediately if the just-recorded failure was the one that triggered lockout.
 */
export async function recordFailedLogin(email: string): Promise<LockStatus> {
  const redis = getRedis();
  const key = FAIL_KEY(email);
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, FAILURE_WINDOW_SEC);
  }
  if (count >= LOCKOUT_THRESHOLD) {
    await redis.set(LOCK_KEY(email), '1', 'EX', LOCKOUT_SEC);
    await redis.del(key);
    return { locked: true, retryAfterSec: LOCKOUT_SEC };
  }
  return { locked: false };
}

export async function clearFailedLogins(email: string): Promise<void> {
  const redis = getRedis();
  await redis.del(FAIL_KEY(email), LOCK_KEY(email));
}
