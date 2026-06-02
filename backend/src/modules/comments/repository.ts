/**
 * Comment repository — data access for the comments collection.
 *
 * Thin Mongoose wrappers. Moderation transitions are NOT optimistic-
 * concurrency-guarded (a comment's moderation state isn't multi-writer
 * sensitive the way an article's editorial state is — at most one moderator
 * acts on a pending comment, and the moderation queue list naturally
 * filters out already-moderated rows on the next refresh).
 */
import { type FilterQuery, type Types } from 'mongoose';

import { Comment, type CommentDocument, type CommentModel, type CommentStatus } from './model';

export interface CreateCommentInput {
  articleId: Types.ObjectId;
  userId: Types.ObjectId;
  body: string;
  parentId?: Types.ObjectId | null;
}

export async function createComment(input: CreateCommentInput): Promise<CommentModel> {
  return Comment.create({
    articleId: input.articleId,
    userId: input.userId,
    body: input.body,
    parentId: input.parentId ?? null,
    status: 'pending',
  });
}

export async function findById(id: Types.ObjectId | string): Promise<CommentModel | null> {
  return Comment.findById(id).exec();
}

export interface ListCommentsOptions {
  page?: number;
  limit?: number;
}

/**
 * Generic paginated list. Callers supply the filter — article-scoped reads
 * pass `{ articleId, status: 'approved' }`; the moderation queue passes
 * `{ status: 'pending' }`.
 */
export async function listByFilter(
  filter: FilterQuery<CommentDocument>,
  options: ListCommentsOptions = {},
): Promise<{ items: CommentModel[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    // Newest first — matches how readers expect threaded comments to flow and
    // matches how editors triage the moderation queue.
    Comment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).exec(),
    Comment.countDocuments(filter).exec(),
  ]);

  return { items, total };
}

/**
 * Flip a comment's status (moderation action). Records who moderated and
 * when. Returns null if no row matched the id — the service maps that to
 * 404. Idempotent on retry: if status is already the target, the document
 * still gets `moderatedBy` / `moderatedAt` rewritten with current values,
 * which is fine (no double-emit because the service-level guard checks
 * the prior status before calling).
 */
export async function setStatus(
  id: Types.ObjectId | string,
  status: CommentStatus,
  moderatedBy: Types.ObjectId,
): Promise<CommentModel | null> {
  return Comment.findByIdAndUpdate(
    id,
    {
      $set: {
        status,
        moderatedBy,
        moderatedAt: new Date(),
      },
    },
    { new: true },
  ).exec();
}

export async function deleteById(id: Types.ObjectId | string): Promise<boolean> {
  const result = await Comment.deleteOne({ _id: id }).exec();
  return result.deletedCount === 1;
}

/**
 * Count comments a user has posted in the last `windowMs` milliseconds.
 * Belt-and-braces backup for the middleware-level express-rate-limit: if
 * Redis is down and the in-process limiter resets, the service can still
 * refuse based on Mongo state.
 */
export async function countRecentByUser(userId: Types.ObjectId, windowMs: number): Promise<number> {
  const since = new Date(Date.now() - windowMs);
  return Comment.countDocuments({ userId, createdAt: { $gte: since } }).exec();
}
