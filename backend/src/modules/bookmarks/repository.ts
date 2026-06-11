/**
 * Bookmark repository — data access for the bookmarks collection.
 *
 * The `upsertBookmark` path is the idempotent shape promised by §5.13:
 * POSTing the same (userId, articleId) twice returns the same row both
 * times. The unique compound index enforces the constraint storage-side;
 * the upsert detects "did insert actually happen this time" so the service
 * can gate the `article.stats.bookmarks` increment behind a real insert
 * (no double-count on retry).
 */
import { type Types } from 'mongoose';

import { Bookmark, type BookmarkModel } from './model';

export interface ListBookmarksOptions {
  page?: number;
  limit?: number;
}

/**
 * Paginated "my bookmarks" list — most-recent first. Always scoped to a
 * single `userId`; the controller pre-binds it from `req.user.id`.
 */
export async function listByUser(
  userId: Types.ObjectId,
  options: ListBookmarksOptions = {},
): Promise<{ items: BookmarkModel[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const skip = (page - 1) * limit;
  const filter = { userId };

  const [items, total] = await Promise.all([
    Bookmark.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    Bookmark.countDocuments(filter).exec(),
  ]);

  return { items, total };
}

/**
 * Idempotent upsert keyed on `(userId, articleId)`. Returns the resulting
 * bookmark and a `wasInserted` flag — true only when this call created a
 * brand-new row, false when the row already existed. The flag is what the
 * service uses to gate the denorm counter bump so two POSTs don't double-
 * count.
 *
 * `updateOne(..., { upsert: true })` is a single atomic Mongo op; the
 * follow-up `findOne` materialises the doc for the response. If a concurrent
 * caller deletes the row between the upsert and the read (extremely rare
 * race), fall back to `create` and retry once — idempotency is preserved
 * either way.
 */
export async function upsertBookmark(
  userId: Types.ObjectId,
  articleId: Types.ObjectId,
): Promise<{ bookmark: BookmarkModel; wasInserted: boolean }> {
  const update = await Bookmark.updateOne(
    { userId, articleId },
    { $setOnInsert: { userId, articleId } },
    { upsert: true },
  ).exec();
  const wasInserted = update.upsertedCount > 0;

  const existing = await Bookmark.findOne({ userId, articleId }).exec();
  if (existing) {
    return { bookmark: existing, wasInserted };
  }

  // Race: row was deleted between upsert and read. Recreate; under
  // concurrent delete-retry, this still ends with one row (unique index).
  const fresh = await Bookmark.create({ userId, articleId });
  return { bookmark: fresh, wasInserted: true };
}

/**
 * Idempotent remove. Returns true when a row was actually deleted, false
 * when the bookmark didn't exist. The service uses the flag to gate the
 * `article.stats.bookmarks` decrement so two DELETEs don't double-decrement.
 */
export async function removeBookmark(
  userId: Types.ObjectId,
  articleId: Types.ObjectId,
): Promise<boolean> {
  const result = await Bookmark.deleteOne({ userId, articleId }).exec();
  return result.deletedCount > 0;
}

export async function findByUserAndArticle(
  userId: Types.ObjectId,
  articleId: Types.ObjectId,
): Promise<BookmarkModel | null> {
  return Bookmark.findOne({ userId, articleId }).exec();
}
