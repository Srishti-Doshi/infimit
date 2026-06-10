/**
 * Media sweeper — periodic GC for orphan Media docs (refCount === 0).
 *
 * Why this exists: the media upload flow creates a Media doc at `refCount: 0`
 * and bumps it to 1 only when an Article (or other consumer) persists a
 * reference. If the FE abandons the upload between `/register` and
 * `/articles` (the user closes the tab mid-compose, the article create
 * fails, etc.), the Media doc + the S3 object are stranded. Without a
 * sweeper, every such abandonment leaks one S3 object + one Mongo doc
 * indefinitely. The deferred-design note at `media/service.ts:13-21` calls
 * this out explicitly; this module closes that loop. Pins #82.
 *
 * Design choices:
 *
 *   - **Grace period.** Only sweep docs older than `graceMs` (default 1 h).
 *     Freshly-created Media docs spend a brief window at `refCount: 0`
 *     while the article-create transaction is in flight; sweeping them
 *     would race the happy path.
 *
 *   - **Batched.** Each sweep tick fetches up to `batchSize` orphans
 *     (default 50), deletes their S3 objects + Mongo docs, and exits. The
 *     next tick picks up where the previous left off (ordered by oldest
 *     first via `createdAt: 1`). Avoids ever loading the entire orphan
 *     backlog into memory on a system that's been running without a
 *     sweeper for weeks.
 *
 *   - **S3 best-effort.** If `deleteObject` throws (transient S3 error,
 *     object never existed), the audit log records it and we still drop
 *     the Mongo doc. The alternative (refusing to drop the doc on S3
 *     failure) would mean the orphan stays in the sweep candidate set
 *     forever, churning the same failure every tick.
 *
 *   - **Single-instance.** Phase 1 deploys are single-replica; we don't
 *     need Mongo leases or election. A future multi-instance deploy
 *     should add either a lease (via `Media.findOneAndUpdate` with a
 *     `sweepingAt` field) or a dedicated worker process.
 *
 *   - **Off in tests by default.** Test envs disable the interval so
 *     `setInterval` doesn't keep the process alive after the suite ends.
 *     Tests can still call `sweepOrphansOnce` directly to exercise the
 *     logic.
 */
import { logger } from '@/config/logger';
import { auditLog, auditWarn } from '@/shared/audit';
import { deleteObject } from '@/config/s3';

import * as mediaRepo from './repository';

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_GRACE_MS = 60 * 60 * 1000; // 1 hour
const DEFAULT_BATCH_SIZE = 50;

export interface SweeperOptions {
  /** How often the sweeper ticks. Default 1 h. */
  intervalMs?: number;
  /** Minimum age of an orphan before it's eligible for sweep. Default 1 h. */
  graceMs?: number;
  /** Max orphans deleted per tick. Default 50. */
  batchSize?: number;
}

export interface SweepResult {
  scanned: number;
  swept: number;
  s3Failures: number;
}

/**
 * Run a single sweep pass. Exported for tests + on-demand triggers (a
 * future admin endpoint could call this to flush orphans manually).
 */
export async function sweepOrphansOnce(opts: SweeperOptions = {}): Promise<SweepResult> {
  const graceMs = opts.graceMs ?? DEFAULT_GRACE_MS;
  const batchSize = opts.batchSize ?? DEFAULT_BATCH_SIZE;

  const cutoff = new Date(Date.now() - graceMs);
  const orphans = await mediaRepo.findOrphans(cutoff, batchSize);
  if (orphans.length === 0) return { scanned: 0, swept: 0, s3Failures: 0 };

  let swept = 0;
  let s3Failures = 0;

  for (const media of orphans) {
    let s3Failed = false;
    try {
      await deleteObject(media.key);
    } catch (err) {
      s3Failed = true;
      s3Failures += 1;
      auditWarn(
        {
          entity: 'media',
          entityId: media._id.toString(),
          action: 'sweeper_s3_delete_failed',
          details: {
            key: media.key,
            error: err instanceof Error ? err.message : String(err),
          },
        },
        'media_sweeper_s3_delete_failed',
      );
    }

    const deleted = await mediaRepo.deleteById(media._id);
    if (deleted) {
      swept += 1;
      auditLog(
        {
          entity: 'media',
          entityId: media._id.toString(),
          action: 'sweeper_deleted',
          details: {
            key: media.key,
            purpose: media.purpose,
            s3Failed,
          },
        },
        'media_sweeper_deleted',
      );
    }
  }

  logger.info({ scanned: orphans.length, swept, s3Failures }, 'media_sweeper_tick_complete');

  return { scanned: orphans.length, swept, s3Failures };
}

let intervalHandle: NodeJS.Timeout | null = null;

/**
 * Start the periodic sweeper. Idempotent — calling twice is a no-op
 * (clears the old handle first, so re-calling with new options does
 * apply the new settings).
 */
export function startMediaSweeper(opts: SweeperOptions = {}): void {
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL_MS;

  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }

  intervalHandle = setInterval(() => {
    void sweepOrphansOnce(opts).catch((err: unknown) => {
      logger.error(
        { err: err instanceof Error ? err.message : String(err) },
        'media_sweeper_tick_failed',
      );
    });
  }, intervalMs);

  // Don't keep the process alive solely on the sweeper interval — a graceful
  // shutdown path should still be able to exit cleanly.
  intervalHandle.unref();

  logger.info({ intervalMs }, 'media_sweeper_started');
}

/** Stop the periodic sweeper. Safe to call when not started. */
export function stopMediaSweeper(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
    logger.info('media_sweeper_stopped');
  }
}
