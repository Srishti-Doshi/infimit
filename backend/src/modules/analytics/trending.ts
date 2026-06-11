/**
 * Trending compute — Sub-PR 5-d.
 *
 * Every 5 min, the cron:
 *   1. Reads the rolling 24h window of `view` / `bookmark` / `share` events
 *      grouped by articleId, scored with `view = 1`, others = 5
 *      (per docs/Phase_1/Subphase_5_Reader_Launch/Backend_Handler_Documentation.md §4).
 *   2. Writes the top N article ids to the `feed:trending` Redis key (JSON
 *      array, TTL 10 min — survives a single missed tick).
 *   3. Denormalises the score onto `article.stats.trendingScore` so the
 *      home-feed cold-cache fallback (5-a) can sort by it without re-running
 *      the aggregation.
 *
 * Design choices:
 *
 *   - **Reset before write.** Each tick zeroes `stats.trendingScore` across
 *     every non-soft-deleted published article BEFORE writing the new
 *     top-N. Without the reset, articles that fall out of trending keep
 *     their stale score and out-rank the genuinely-current trending set in
 *     the `stats.trendingScore desc` sort.
 *
 *   - **Soft-deleted articles are excluded.** The `$match` adds
 *     `articleId !== null` and the lookup-style filter on stats writes
 *     skips soft-deleted; the Redis key is also filtered against the
 *     current published set on read (5-a `findByIdsPreservingOrder`).
 *
 *   - **setInterval with `.unref()`** — matches the media sweeper pattern.
 *     No new dependency on node-cron just for one job.
 *
 *   - **Off in tests by default.** Test envs start `app.ts` without the
 *     cron so a `setInterval` doesn't keep Jest's process alive after the
 *     suite ends. Tests can still call `computeTrendingOnce` directly to
 *     exercise the pipeline.
 */
import { type Types } from 'mongoose';

import { logger } from '@/config/logger';
import { auditLog, auditWarn } from '@/shared/audit';
import { cache } from '@/shared';
import { getRedis } from '@/config/redis';
import { Article } from '@/modules/articles';

import { AnalyticsEvent } from './model';

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const DEFAULT_TOP_N = 30;
const DEFAULT_REDIS_TTL_SEC = 10 * 60; // 10 minutes (survives one missed tick)

// Score weights. Views are the volume signal; shares + bookmarks are intent.
const SCORE_VIEW = 1;
const SCORE_INTENT = 5; // applies to share + bookmark

export interface TrendingComputeOptions {
  /** How often the cron ticks. Default 5 min. */
  intervalMs?: number;
  /** Rolling window for the score. Default 24 h. */
  windowMs?: number;
  /** How many articles land in the Redis key + the score denorm. Default 30. */
  topN?: number;
  /** Redis key TTL. Default 10 min. */
  redisTtlSec?: number;
}

export interface TrendingComputeResult {
  considered: number;
  written: number;
  topIds: string[];
}

interface AggregationRow {
  _id: Types.ObjectId;
  score: number;
}

/**
 * Run a single trending compute pass. Exported for tests + on-demand
 * triggers (a future admin endpoint could force a recompute).
 */
export async function computeTrendingOnce(
  opts: TrendingComputeOptions = {},
): Promise<TrendingComputeResult> {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const topN = opts.topN ?? DEFAULT_TOP_N;
  const redisTtlSec = opts.redisTtlSec ?? DEFAULT_REDIS_TTL_SEC;

  const since = new Date(Date.now() - windowMs);
  const rows = (await AnalyticsEvent.aggregate([
    {
      $match: {
        type: { $in: ['view', 'bookmark', 'share'] },
        createdAt: { $gte: since },
        articleId: { $ne: null },
      },
    },
    {
      $group: {
        _id: '$articleId',
        score: {
          $sum: {
            $cond: [{ $eq: ['$type', 'view'] }, SCORE_VIEW, SCORE_INTENT],
          },
        },
      },
    },
    { $sort: { score: -1 } },
    { $limit: topN },
  ]).exec()) as AggregationRow[];

  // Always reset the denorm — keeps stale-but-once-trending articles from
  // permanently out-ranking the genuinely current set. Cheap single update
  // touching only published, non-deleted articles.
  await Article.updateMany(
    { status: 'published', deletedAt: null, 'stats.trendingScore': { $gt: 0 } },
    { $set: { 'stats.trendingScore': 0 } },
  ).exec();

  // Then write the new top-N scores. Bulk via `updateMany` keyed on the id
  // wouldn't carry per-row scores, so we issue one update per row — bounded
  // by `topN` so this is at most 30 ops per tick.
  let written = 0;
  for (const row of rows) {
    const res = await Article.updateOne(
      { _id: row._id, status: 'published', deletedAt: null },
      { $set: { 'stats.trendingScore': row.score } },
    ).exec();
    if (res.matchedCount > 0) written += 1;
  }

  // Write the ordered id list to Redis. Even if the previous step missed
  // some articles (already unpublished), we still cache what we have —
  // `findByIdsPreservingOrder` (5-a) drops stale ids during hydration.
  const topIds = rows.map((r) => r._id.toString());
  try {
    const redis = getRedis();
    await redis.set(cache.cacheKeys.feedTrending(), JSON.stringify(topIds), 'EX', redisTtlSec);
  } catch (err) {
    auditWarn(
      {
        entity: 'article',
        action: 'trending_cache_write_failed',
        details: {
          error: err instanceof Error ? err.message : String(err),
          topCount: topIds.length,
        },
      },
      'trending_cache_write_failed',
    );
  }

  auditLog(
    {
      entity: 'article',
      action: 'trending_recomputed',
      details: {
        considered: rows.length,
        written,
        windowHours: windowMs / (60 * 60 * 1000),
      },
    },
    'trending_recomputed',
  );

  logger.info(
    {
      considered: rows.length,
      written,
      topN,
      windowMs,
    },
    'trending_recomputed',
  );

  return { considered: rows.length, written, topIds };
}

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Start the periodic trending cron. Idempotent — calling twice clears the
 * previous handle so option changes take effect on re-call. Skipped in
 * tests via the `NODE_ENV !== 'test'` gate in `app.ts`.
 */
export function startTrendingCron(opts: TrendingComputeOptions = {}): void {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  intervalHandle = setInterval(() => {
    void computeTrendingOnce(opts).catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'trending_cron_tick_failed',
      );
    });
  }, intervalMs);

  // Don't keep the process alive solely on this interval.
  intervalHandle.unref();

  logger.info({ intervalMs }, 'trending_cron_started');
}

/** Stop the periodic trending cron. Safe to call when not started. */
export function stopTrendingCron(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('trending_cron_stopped');
  }
}
