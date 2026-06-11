/**
 * Bookmarks service — list / add / remove with end-to-end idempotency.
 *
 * Contract: docs/05-api-documentation.md §5.13.
 * Schema:   docs/04-database-design.md §4.2.12.
 * Edge cases: docs/13-feature-documentation.md A10.
 *
 * Idempotency model:
 *   - POST twice with the same (userId, articleId) returns the same row both
 *     times. Only the FIRST call bumps `article.stats.bookmarks`.
 *   - DELETE on a non-existent bookmark is a 204 no-op. Only a real deletion
 *     decrements the counter.
 *
 * Bookmarkability: only PUBLISHED articles can be added. Drafts / submitted /
 * approved articles aren't on the public reader surface yet, so they can't
 * be saved-for-later. An already-bookmarked article that later moves to
 * `unpublished` stays in the user's list — A10 says "still listed with
 * Unavailable badge", which we represent by returning `article: null` for
 * that row in the list response.
 */
import { Types } from 'mongoose';

import { ApiError } from '@/shared/errors';
import { auditLog } from '@/shared/audit';
import { logger } from '@/config/logger';
import { articlesRepo, getCardViewsByArticleIds, type FeedCardView } from '@/modules/articles';

import * as bookmarksRepo from './repository';
import type { BookmarkModel } from './model';

export interface BookmarkView {
  id: string;
  articleId: string;
  createdAt: Date;
  /** Compact reader-card view of the bookmarked article. `null` when the
   * article is no longer published (unpublished or soft-deleted) — the FE
   * renders an "Unavailable" placeholder. */
  article: FeedCardView | null;
}

export interface ListBookmarksResult {
  items: BookmarkView[];
  total: number;
  page: number;
  limit: number;
}

function shapeBookmark(bookmark: BookmarkModel, cards: Map<string, FeedCardView>): BookmarkView {
  const articleIdStr = bookmark.articleId.toString();
  return {
    id: bookmark._id.toString(),
    articleId: articleIdStr,
    createdAt: bookmark.createdAt,
    article: cards.get(articleIdStr) ?? null,
  };
}

export async function listMyBookmarks(
  userId: string,
  options: { page?: number; limit?: number } = {},
): Promise<ListBookmarksResult> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const userObjectId = new Types.ObjectId(userId);

  const { items, total } = await bookmarksRepo.listByUser(userObjectId, { page, limit });
  const cards = await getCardViewsByArticleIds(items.map((b) => b.articleId.toString()));

  return {
    items: items.map((b) => shapeBookmark(b, cards)),
    total,
    page,
    limit,
  };
}

/**
 * Idempotent add. Throws 404 if the article doesn't exist or isn't published.
 * Returns the bookmark with its embedded card so the FE can update its
 * local state without a follow-up read.
 */
export async function addBookmark(userId: string, articleId: string): Promise<BookmarkView> {
  if (!Types.ObjectId.isValid(articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(articleId);
  if (!article || article.status !== 'published') {
    throw ApiError.notFound('Article not found');
  }

  const userObjectId = new Types.ObjectId(userId);
  const articleObjectId = new Types.ObjectId(articleId);

  const { bookmark, wasInserted } = await bookmarksRepo.upsertBookmark(
    userObjectId,
    articleObjectId,
  );

  if (wasInserted) {
    // Denorm the bookmark count on the article. Best-effort: a failed counter
    // write doesn't undo the bookmark — the user's intent has been recorded.
    try {
      await articlesRepo.adjustBookmarkCount(articleObjectId, +1);
    } catch (err) {
      logger.warn({ err, articleId, userId }, 'bookmark_counter_increment_failed');
    }
    auditLog(
      {
        entity: 'bookmark',
        entityId: bookmark._id.toString(),
        action: 'created',
        actor: userId,
        details: { articleId },
      },
      'bookmark_created',
    );
  }

  const cards = await getCardViewsByArticleIds([articleId]);
  return shapeBookmark(bookmark, cards);
}

/**
 * Idempotent remove. Returns void either way (`204 No Content` at the HTTP
 * layer); only a real deletion decrements the denorm counter.
 */
export async function removeMyBookmark(userId: string, articleId: string): Promise<void> {
  if (!Types.ObjectId.isValid(articleId)) {
    // Invalid id → no row could exist → idempotent no-op.
    return;
  }
  const userObjectId = new Types.ObjectId(userId);
  const articleObjectId = new Types.ObjectId(articleId);

  const wasRemoved = await bookmarksRepo.removeBookmark(userObjectId, articleObjectId);
  if (wasRemoved) {
    try {
      await articlesRepo.adjustBookmarkCount(articleObjectId, -1);
    } catch (err) {
      logger.warn({ err, articleId, userId }, 'bookmark_counter_decrement_failed');
    }
    auditLog(
      {
        entity: 'bookmark',
        entityId: `${userId}:${articleId}`,
        action: 'removed',
        actor: userId,
        details: { articleId },
      },
      'bookmark_removed',
    );
  }
}
