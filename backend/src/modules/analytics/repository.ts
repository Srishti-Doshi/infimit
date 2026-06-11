/**
 * Analytics repository — data access for the analytics_events collection.
 *
 * Writes are fire-and-forget — the service calls `recordEvent(...)` and
 * returns 204 to the caller without awaiting the insert. The repository
 * never throws on a failed insert; failures bubble up to the service
 * `.catch(() => log)` so a Mongo blip can't 5xx the public tracking
 * endpoint.
 *
 * Reads are intentionally lightweight in P1 — `countByArticle`,
 * `countUniqueReadersByArticle`, `countByAuthor`, `countPlatform`. Phase 2
 * will swap these for `analytics_daily` roll-up reads once the daily cron
 * lands.
 */
import { type Types } from 'mongoose';

import {
  AnalyticsEvent,
  type AnalyticsEventDocument,
  type AnalyticsEventModel,
  type AnalyticsEventType,
} from './model';

export interface RecordEventInput {
  type: AnalyticsEventType;
  articleId?: Types.ObjectId | null;
  adId?: Types.ObjectId | null;
  userId?: Types.ObjectId | null;
  sessionId?: string;
  referrer?: string;
  userAgent?: string;
  country?: string;
  durationMs?: number | null;
}

export async function recordEvent(input: RecordEventInput): Promise<AnalyticsEventModel> {
  return AnalyticsEvent.create({
    type: input.type,
    articleId: input.articleId ?? null,
    adId: input.adId ?? null,
    userId: input.userId ?? null,
    sessionId: input.sessionId ?? '',
    referrer: input.referrer ?? '',
    userAgent: input.userAgent ?? '',
    country: input.country ?? '',
    durationMs: input.durationMs ?? null,
  });
}

/**
 * Has THIS user already logged a `read_complete` on THIS article? Used to
 * gate the `stats.uniqueReaders` denorm bump so a reader scrolling past 90 %
 * twice doesn't double-count.
 */
export async function hasReadCompleted(
  articleId: Types.ObjectId,
  userId: Types.ObjectId,
): Promise<boolean> {
  const existing = await AnalyticsEvent.exists({
    articleId,
    userId,
    type: 'read_complete',
  }).exec();
  return existing !== null;
}

/**
 * Per-article event counts over the rolling 7-day window. Combined at the
 * service layer with the article's denorm `stats.*` counters (which are
 * cumulative, not windowed).
 */
export async function getArticleEventCounts(
  articleId: Types.ObjectId,
): Promise<{ viewsLast7Days: number; readsLast7Days: number }> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const filter = { articleId, createdAt: { $gte: since } };
  const [viewsLast7Days, readsLast7Days] = await Promise.all([
    AnalyticsEvent.countDocuments({ ...filter, type: 'view' }).exec(),
    AnalyticsEvent.countDocuments({ ...filter, type: 'read_complete' }).exec(),
  ]);
  return { viewsLast7Days, readsLast7Days };
}

/**
 * Aggregate event counts over a set of article ids (the author's portfolio).
 * Each total is a single indexed countDocuments — fine for P1 portfolio
 * sizes (≤200 articles per author).
 */
export async function getEventCountsForArticles(
  articleIds: ReadonlyArray<Types.ObjectId>,
): Promise<{ views: number; reads: number; shares: number; bookmarks: number }> {
  if (articleIds.length === 0) {
    return { views: 0, reads: 0, shares: 0, bookmarks: 0 };
  }
  const base = { articleId: { $in: articleIds } } as const;
  const [views, reads, shares, bookmarks] = await Promise.all([
    AnalyticsEvent.countDocuments({ ...base, type: 'view' }).exec(),
    AnalyticsEvent.countDocuments({ ...base, type: 'read_complete' }).exec(),
    AnalyticsEvent.countDocuments({ ...base, type: 'share' }).exec(),
    AnalyticsEvent.countDocuments({ ...base, type: 'bookmark' }).exec(),
  ]);
  return { views, reads, shares, bookmarks };
}

/**
 * Platform-wide event counts over the rolling 30-day window. Admin-only
 * surface (gated at the controller) for the global dashboard.
 */
export async function getPlatformEventCounts(): Promise<{
  views: number;
  reads: number;
  shares: number;
  bookmarks: number;
  commentEvents: number;
}> {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const filter = { createdAt: { $gte: since } };
  const [views, reads, shares, bookmarks, commentEvents] = await Promise.all([
    AnalyticsEvent.countDocuments({ ...filter, type: 'view' }).exec(),
    AnalyticsEvent.countDocuments({ ...filter, type: 'read_complete' }).exec(),
    AnalyticsEvent.countDocuments({ ...filter, type: 'share' }).exec(),
    AnalyticsEvent.countDocuments({ ...filter, type: 'bookmark' }).exec(),
    AnalyticsEvent.countDocuments({ ...filter, type: 'comment' }).exec(),
  ]);
  return { views, reads, shares, bookmarks, commentEvents };
}

/**
 * Exact count over the full collection. Used by integration tests'
 * `waitForCount` helper after the fire-and-forget tracking writes — must
 * reflect post-insert state immediately, so we use `countDocuments({})`
 * (live scan) rather than `estimatedDocumentCount()` (cached metadata that
 * lags writes + `deleteMany`-driven resets between test cases).
 */
export async function countAll(): Promise<number> {
  return AnalyticsEvent.countDocuments({}).exec();
}

export type { AnalyticsEventDocument, AnalyticsEventModel, AnalyticsEventType };
