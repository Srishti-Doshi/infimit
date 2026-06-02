/**
 * Cache-key conventions.
 *
 * Single source of truth so callers don't hand-craft prefixes and end up with
 * `article:slug:foo` vs `articleslug:foo`. Adding a new key family: extend
 * `cacheKeys` here, set a sensible TTL in `CACHE_TTL`, and use both from the
 * call site.
 *
 * Prefixes:
 *   - `article:slug:<slug>`           — single article view; invalidate on
 *                                       publish / unpublish / regenerate-AI /
 *                                       any other public-facing update.
 *   - `feed:home`                     — home feed payload (Subphase 5).
 *   - `feed:trending`                 — trending feed (Subphase 5).
 *   - `feed:category:<slug>`          — per-category feed (Subphase 5).
 *
 * Keys do NOT need the `infimit:` prefix that `REDIS_KEY_PREFIX` adds —
 * ioredis applies it automatically (see config/redis.ts).
 */

export const cacheKeys = {
  articleSlug: (slug: string): string => `article:slug:${slug}`,
  feedHome: (): string => 'feed:home',
  feedTrending: (): string => 'feed:trending',
  feedCategory: (category: string): string => `feed:category:${category}`,
} as const;

/**
 * Default TTLs (seconds). Tune deliberately and in one place — never inline
 * a number in a call site.
 */
export const CACHE_TTL = {
  articleSlug: 5 * 60, // 5 minutes; reader feed reads cluster around publish time
  feedHome: 60, // 1 minute; near-real-time freshness for trending homepage
  feedTrending: 60,
  feedCategory: 60,
} as const;
