/**
 * Analytics service — fire-and-forget event writer + RBAC-gated stats reads.
 *
 * Contract: docs/05-api-documentation.md §5.8.
 * Schema:   docs/04-database-design.md §4.2.6.
 * Surface:  docs/03-module-breakdown.md §3.2.7.
 *
 * Writer model (`trackEvent`):
 *   - Returns immediately to the controller; the controller acks 204
 *     without awaiting the underlying inserts. The writer DOES kick off
 *     real persistence — it just doesn't block on it.
 *   - All errors are swallowed + warn-logged. The public tracking endpoint
 *     must never 5xx because analytics is down (per BE handler §7).
 *   - Trust boundaries: `userId` is ALWAYS sourced from `req.user` and
 *     never from the body. The body's `sessionId` IS trusted because it's
 *     anonymous-by-design (the FE generates it client-side).
 *   - Denormalised counter bumps:
 *       view           → `article.stats.views`            (every event)
 *       read_complete  → `article.stats.uniqueReaders`    (first-per-user)
 *       share          → `article.stats.shares`           (every event)
 *       bookmark / comment / ad_*: no denorm here — bookmarks (5-b) +
 *         comments already maintain their own counters; ads land in P2.
 *
 * Reads model:
 *   - `getArticleStats` — combines the article's denorm counters with the
 *     last-7-day rollup from the event stream.
 *   - `getAuthorStats` — sums denorm counters across every article authored
 *     by the user, plus event-stream rollup over the same set.
 *   - `getPlatformStats` — admin-only; counts events in the rolling 30-day
 *     window + total published articles.
 *
 * RBAC is enforced by the service on the read side (defence in depth — the
 * route layer also gates). 403 means a permission check failed; 404 means
 * the target doesn't exist.
 */
import { Types } from 'mongoose';

import { ApiError } from '@/shared/errors';
import { logger } from '@/config/logger';
import { articlesRepo } from '@/modules/articles';
import { usersRepo } from '@/modules/users';
import type { UserRole } from '@/modules/users';

import * as analyticsRepo from './repository';
import type { AnalyticsEventType } from './model';

const FALLBACK_USER_AGENT_LIMIT = 500;
const FALLBACK_COUNTRY_HEADER = 'cf-ipcountry';

export interface TrackEventInput {
  type: AnalyticsEventType;
  articleId?: string;
  adId?: string;
  /** Anonymous visitor id supplied by the FE. Trusted (anonymous-by-design). */
  sessionId?: string;
  /** Authenticated user id from `req.user.id`. Body-supplied userId is
   * always ignored — only the auth context drives this. */
  userId?: string;
  referrer?: string;
  userAgent?: string;
  country?: string;
  durationMs?: number;
}

/**
 * Fire-and-forget tracking entry point. Writes the raw event, then runs the
 * denorm counter bump if the event type warrants it. Both are best-effort:
 * any failure logs a warning and discards the error — analytics must never
 * take down the public tracking endpoint.
 *
 * Does NOT await persistence — callers that need a guaranteed write should
 * use the repository directly. The public `POST /v1/analytics/track` path
 * just calls this and acks 204.
 */
export function trackEvent(input: TrackEventInput): void {
  // Validate shape constraints that aren't expressible at the Zod layer.
  const needsArticle: AnalyticsEventType[] = [
    'view',
    'read_complete',
    'share',
    'bookmark',
    'comment',
  ];
  if (needsArticle.includes(input.type) && !input.articleId) {
    // Throwing here would 422 the request. The controller catches Zod-level
    // missing-required at validation time; this is the rare "user typed type
    // without an id" case — surface as warn, drop the event silently to keep
    // 204 semantics.
    logger.warn({ type: input.type }, 'analytics_track_missing_articleId');
    return;
  }
  if ((input.type === 'ad_impression' || input.type === 'ad_click') && !input.adId) {
    logger.warn({ type: input.type }, 'analytics_track_missing_adId');
    return;
  }

  const articleObjectId = input.articleId ? new Types.ObjectId(input.articleId) : null;
  const adObjectId = input.adId ? new Types.ObjectId(input.adId) : null;
  const userObjectId = input.userId ? new Types.ObjectId(input.userId) : null;

  // Kick off the write and the denorm bump without awaiting at the outer
  // boundary — the controller already returned 204. We attach `.catch`
  // handlers so an unhandled rejection doesn't crash the process.
  void persistAndDenorm({
    type: input.type,
    articleObjectId,
    adObjectId,
    userObjectId,
    sessionId: input.sessionId,
    referrer: input.referrer,
    userAgent: input.userAgent ? input.userAgent.slice(0, FALLBACK_USER_AGENT_LIMIT) : undefined,
    country: input.country,
    durationMs: input.durationMs,
  }).catch((err: unknown) => {
    logger.warn({ err, type: input.type }, 'analytics_track_pipeline_failed');
  });
}

interface PersistInput {
  type: AnalyticsEventType;
  articleObjectId: Types.ObjectId | null;
  adObjectId: Types.ObjectId | null;
  userObjectId: Types.ObjectId | null;
  sessionId?: string;
  referrer?: string;
  userAgent?: string;
  country?: string;
  durationMs?: number;
}

async function persistAndDenorm(input: PersistInput): Promise<void> {
  // For read_complete we need to check whether THIS user has read THIS
  // article BEFORE recording the new event — otherwise the just-inserted
  // event would always be visible to `hasReadCompleted` and the gate would
  // never let us bump uniqueReaders. Resolve the gate first, persist
  // second, denorm third.
  let isFirstReadComplete = false;
  if (input.type === 'read_complete' && input.articleObjectId && input.userObjectId) {
    try {
      const already = await analyticsRepo.hasReadCompleted(
        input.articleObjectId,
        input.userObjectId,
      );
      isFirstReadComplete = !already;
    } catch (err) {
      // If the gate query fails, bias toward NOT double-counting — skip the
      // bump rather than risk a false positive. The event log is still the
      // source of truth and Phase 2's batch roll-up can correct.
      logger.warn({ err }, 'analytics_unique_reader_gate_failed');
      isFirstReadComplete = false;
    }
  }

  // 1. Record the raw event. Failure is logged but doesn't gate the denorm
  //    step — they're independent best-effort writes. The event log is the
  //    source of truth; the denorm is a cache.
  try {
    await analyticsRepo.recordEvent({
      type: input.type,
      articleId: input.articleObjectId,
      adId: input.adObjectId,
      userId: input.userObjectId,
      sessionId: input.sessionId,
      referrer: input.referrer,
      userAgent: input.userAgent,
      country: input.country,
      durationMs: input.durationMs,
    });
  } catch (err) {
    logger.warn({ err, type: input.type }, 'analytics_event_insert_failed');
  }

  // 2. Denorm article.stats.* for the hot-path counter types.
  if (!input.articleObjectId) return;
  try {
    switch (input.type) {
      case 'view':
        await articlesRepo.adjustViewCount(input.articleObjectId, 1);
        break;
      case 'share':
        await articlesRepo.adjustShareCount(input.articleObjectId, 1);
        break;
      case 'read_complete': {
        // Anonymous (`userObjectId === null`) reads don't count toward
        // uniqueReaders. For authed callers we use the pre-insert gate
        // resolved above. There's still an unavoidable race — two
        // concurrent read_completes from the same user could both pass
        // the gate. Acceptable for P1 (it's a metric, not a payment).
        if (isFirstReadComplete) {
          await articlesRepo.adjustUniqueReaderCount(input.articleObjectId, 1);
        }
        break;
      }
      default:
        // bookmark / comment / ad_* — counters live in their own modules
        // (bookmarks 5-b; comments; ads P2). No denorm here.
        break;
    }
  } catch (err) {
    logger.warn(
      { err, type: input.type, articleId: input.articleObjectId.toString() },
      'analytics_denorm_failed',
    );
  }
}

// ─── reads ──────────────────────────────────────────────────────────────

export interface ArticleStatsView {
  articleId: string;
  cumulative: {
    views: number;
    uniqueReaders: number;
    shares: number;
    bookmarks: number;
    commentsCount: number;
  };
  last7Days: {
    views: number;
    reads: number;
  };
}

export async function getArticleStats(
  articleId: string,
  viewer: { id: string; role: UserRole },
): Promise<ArticleStatsView> {
  if (!Types.ObjectId.isValid(articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(articleId);
  if (!article) throw ApiError.notFound('Article not found');

  // RBAC: author of the article OR editor OR admin. Readers cannot see
  // someone else's piece's analytics.
  const isOwner = article.authorId.toString() === viewer.id;
  const isPrivileged = viewer.role === 'editor' || viewer.role === 'admin';
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('Not permitted to view these analytics');
  }

  const articleObjectId = article._id;
  const last7 = await analyticsRepo.getArticleEventCounts(articleObjectId);

  return {
    articleId: article._id.toString(),
    cumulative: {
      views: article.stats.views,
      uniqueReaders: article.stats.uniqueReaders,
      shares: article.stats.shares,
      bookmarks: article.stats.bookmarks,
      commentsCount: article.stats.commentsCount,
    },
    last7Days: {
      views: last7.viewsLast7Days,
      reads: last7.readsLast7Days,
    },
  };
}

export interface AuthorStatsView {
  authorId: string;
  articles: { total: number; published: number };
  cumulative: {
    views: number;
    reads: number;
    shares: number;
    bookmarks: number;
  };
}

export async function getAuthorStats(
  authorId: string,
  viewer: { id: string; role: UserRole },
): Promise<AuthorStatsView> {
  if (!Types.ObjectId.isValid(authorId)) {
    throw ApiError.notFound('Author not found');
  }

  // RBAC: the author themselves, OR editor / admin.
  const isOwner = authorId === viewer.id;
  const isPrivileged = viewer.role === 'editor' || viewer.role === 'admin';
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('Not permitted to view these analytics');
  }

  const author = await usersRepo.findById(authorId);
  if (!author) throw ApiError.notFound('Author not found');

  const articleIds = await articlesRepo.listIdsByAuthor(authorId);
  const counts = await analyticsRepo.getEventCountsForArticles(articleIds);

  // For "published" we'd ideally have a denorm; for P1, do a quick count.
  // Articles list is small per author (<200 in P1 expectations).
  const publishedIds = (await articlesRepo.listPublicByFilter({}, { page: 1, limit: 1000 })).items
    .filter((a) => a.authorId.toString() === authorId)
    .map((a) => a._id);

  return {
    authorId,
    articles: { total: articleIds.length, published: publishedIds.length },
    cumulative: {
      views: counts.views,
      reads: counts.reads,
      shares: counts.shares,
      bookmarks: counts.bookmarks,
    },
  };
}

export interface PlatformStatsView {
  window: { sinceDays: number };
  events: {
    views: number;
    reads: number;
    shares: number;
    bookmarks: number;
    commentEvents: number;
  };
}

export async function getPlatformStats(viewer: { role: UserRole }): Promise<PlatformStatsView> {
  if (viewer.role !== 'admin') {
    throw ApiError.forbidden('Platform analytics are admin-only');
  }

  const events = await analyticsRepo.getPlatformEventCounts();
  return {
    window: { sinceDays: 30 },
    events,
  };
}

// ─── helper: extract trust-context fields from an Express Request ──────

import type { Request } from 'express';

/**
 * Pull the trust-context fields off the request — IP-country header, UA,
 * referrer. Pure helper so the controller stays thin.
 */
export function contextFromRequest(req: Request): {
  userAgent?: string;
  country?: string;
  referrer?: string;
} {
  const ua = req.get('user-agent') ?? undefined;
  const country = req.get(FALLBACK_COUNTRY_HEADER) ?? undefined;
  const referrer = req.get('referer') ?? req.get('referrer') ?? undefined;
  return { userAgent: ua, country, referrer };
}
