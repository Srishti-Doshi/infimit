/**
 * Comments service — business logic for the comments module.
 *
 * Surface:
 *   - postComment       — any authenticated user posts; status defaults to `pending`.
 *   - listForArticle    — public read of approved comments on an article.
 *   - listPending       — editor/admin moderation queue across all articles.
 *   - moderateComment   — editor/admin sets status to approved/rejected/hidden.
 *   - deleteComment     — owner deletes their own (any status); editor/admin can delete any.
 *
 * Manual moderation only in Phase 1 (all new comments default to `pending`).
 * AI moderation (the `aiModeration` sub-doc fields) is Phase 2.
 *
 * Events:
 *   - `comment.approved` fires when a pending comment is approved. The
 *     notifications module subscribes; the audit-log stub in events.ts
 *     records the would-be recipient even if notifications fails.
 */
import { Types } from 'mongoose';

import { auditLog } from '@/shared/audit';
import { ApiError } from '@/shared/errors';
import { articlesRepo } from '@/modules/articles';
import { usersRepo } from '@/modules/users';
import type { UserRole } from '@/modules/users';

import * as commentsRepo from './repository';
import { commentEvents } from './events';
import type { CommentDocument, CommentModel, CommentStatus } from './model';

// ─── view shaping ───────────────────────────────────────────────────────

interface CommenterView {
  id: string;
  name: string;
}

interface CommentArticleRef {
  id: string;
  title: string;
  slug: string;
}

interface CommentListItemView {
  [key: string]: unknown;
  author: CommenterView | null;
  article?: CommentArticleRef | null;
}

/**
 * Batch-load commenter user docs for a set of `userId`s. Returns a Map keyed
 * by user id string so list endpoints can attach `author: { id, name }`
 * alongside the existing `userId` reference — same pattern as
 * `articles/service.ts loadAuthorsByIds`. Includes soft-deleted users so the
 * byline still renders if the commenter later deactivated their account.
 * Pins #72.
 */
async function loadCommenters(
  userIds: ReadonlyArray<Types.ObjectId>,
): Promise<Map<string, CommenterView>> {
  const seen = new Set<string>();
  const unique: Types.ObjectId[] = [];
  for (const id of userIds) {
    const k = id.toString();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(id);
    }
  }
  if (unique.length === 0) return new Map();
  const users = await usersRepo.findManyByIds(unique);
  return new Map(users.map((u) => [u._id.toString(), { id: u._id.toString(), name: u.name }]));
}

/**
 * Batch-resolve article projections for the moderation queue so editors can
 * click through from a pending comment to the article context. Same pattern
 * as `loadCommenters` — dedupe + lookup. Uses `articlesRepo.findById` per
 * unique id; for the default page size (20) that's a handful of indexed
 * lookups, well within budget. Pins the article-context half of #72.
 */
async function loadArticlesForComments(
  articleIds: ReadonlyArray<Types.ObjectId>,
): Promise<Map<string, CommentArticleRef>> {
  const seen = new Set<string>();
  const unique: Types.ObjectId[] = [];
  for (const id of articleIds) {
    const k = id.toString();
    if (!seen.has(k)) {
      seen.add(k);
      unique.push(id);
    }
  }
  if (unique.length === 0) return new Map();
  const results = await Promise.all(unique.map((id) => articlesRepo.findById(id)));
  const map = new Map<string, CommentArticleRef>();
  for (const article of results) {
    if (article) {
      map.set(article._id.toString(), {
        id: article._id.toString(),
        title: article.title,
        slug: article.slug,
      });
    }
  }
  return map;
}

// ─── post comment ───────────────────────────────────────────────────────

export interface PostCommentInput {
  articleId: string;
  userId: string;
  body: string;
  parentId?: string | null;
}

export async function postComment(input: PostCommentInput): Promise<CommentModel> {
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }

  // Article must exist + be published (you can only comment on live articles).
  const article = await articlesRepo.findById(input.articleId);
  if (!article || article.status !== 'published') {
    throw ApiError.notFound('Article not found');
  }

  // Parent comment (if any) must exist + belong to the same article + be
  // approved. Threading on rejected/hidden parents would be weird.
  if (input.parentId) {
    if (!Types.ObjectId.isValid(input.parentId)) {
      throw ApiError.validation('Invalid parentId');
    }
    const parent = await commentsRepo.findById(input.parentId);
    if (!parent || parent.articleId.toString() !== input.articleId) {
      throw ApiError.notFound('Parent comment not found');
    }
    if (parent.status !== 'approved') {
      throw ApiError.invalidState('Cannot reply to a non-approved comment');
    }
  }

  const comment = await commentsRepo.createComment({
    articleId: new Types.ObjectId(input.articleId),
    userId: new Types.ObjectId(input.userId),
    body: input.body,
    parentId: input.parentId ? new Types.ObjectId(input.parentId) : null,
  });

  auditLog(
    {
      entity: 'comment',
      entityId: comment._id.toString(),
      action: 'posted',
      actor: input.userId,
      details: {
        articleId: input.articleId,
        parentId: input.parentId ?? null,
        bodyLength: input.body.length,
      },
    },
    'comment_posted',
  );

  return comment;
}

// ─── list approved (public) ─────────────────────────────────────────────

export async function listForArticle(
  articleId: string,
  options: { page?: number; limit?: number } = {},
): Promise<{ items: CommentListItemView[]; total: number; page: number; limit: number }> {
  if (!Types.ObjectId.isValid(articleId)) {
    throw ApiError.notFound('Article not found');
  }

  const filter = {
    articleId: new Types.ObjectId(articleId),
    status: 'approved' as CommentStatus,
  };

  const { items, total } = await commentsRepo.listByFilter(filter, options);
  const commenters = await loadCommenters(items.map((c) => c.userId));
  const shaped: CommentListItemView[] = items.map((c) => ({
    ...(c.toJSON() as Record<string, unknown>),
    author: commenters.get(c.userId.toString()) ?? null,
  }));
  return {
    items: shaped,
    total,
    page: options.page ?? 1,
    limit: options.limit ?? 20,
  };
}

// ─── list pending (moderation queue) ────────────────────────────────────

export async function listPending(input: {
  actorRole: UserRole;
  page?: number;
  limit?: number;
}): Promise<{ items: CommentListItemView[]; total: number; page: number; limit: number }> {
  if (input.actorRole !== 'editor' && input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only editors or admins can view the moderation queue');
  }

  const { items, total } = await commentsRepo.listByFilter(
    { status: 'pending' },
    { page: input.page, limit: input.limit },
  );
  const [commenters, articles] = await Promise.all([
    loadCommenters(items.map((c) => c.userId)),
    loadArticlesForComments(items.map((c) => c.articleId)),
  ]);
  const shaped: CommentListItemView[] = items.map((c) => ({
    ...(c.toJSON() as Record<string, unknown>),
    author: commenters.get(c.userId.toString()) ?? null,
    article: articles.get(c.articleId.toString()) ?? null,
  }));

  return {
    items: shaped,
    total,
    page: input.page ?? 1,
    limit: input.limit ?? 20,
  };
}

// ─── moderation ─────────────────────────────────────────────────────────

export interface ModerateCommentInput {
  commentId: string;
  actorId: string;
  actorRole: UserRole;
  status: 'approved' | 'rejected' | 'hidden';
}

export async function moderateComment(input: ModerateCommentInput): Promise<CommentModel> {
  if (input.actorRole !== 'editor' && input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only editors or admins can moderate comments');
  }
  if (!Types.ObjectId.isValid(input.commentId)) {
    throw ApiError.notFound('Comment not found');
  }

  const existing = await commentsRepo.findById(input.commentId);
  if (!existing) {
    throw ApiError.notFound('Comment not found');
  }

  // Same-status no-op: still record the moderation but don't re-emit the
  // approval event (would cause duplicate notifications).
  const wasAlreadyApproved = existing.status === 'approved';

  const updated = await commentsRepo.setStatus(
    existing._id,
    input.status,
    new Types.ObjectId(input.actorId),
  );
  if (!updated) {
    throw ApiError.notFound('Comment not found');
  }

  auditLog(
    {
      entity: 'comment',
      entityId: updated._id.toString(),
      action: `moderated_${input.status}`,
      actor: input.actorId,
      details: {
        articleId: updated.articleId.toString(),
        prevStatus: existing.status,
        nextStatus: input.status,
      },
    },
    'comment_moderated',
  );

  // Maintain the denormalised approved-comment count: +1 when a comment enters
  // `approved`, -1 when an approved comment leaves it (rejected/hidden). Other
  // transitions (e.g. pending → rejected) don't change the visible count.
  let commentDelta = 0;
  if (input.status === 'approved' && !wasAlreadyApproved) commentDelta = 1;
  else if (input.status !== 'approved' && wasAlreadyApproved) commentDelta = -1;
  if (commentDelta !== 0) {
    await articlesRepo.adjustCommentCount(updated.articleId, commentDelta);
  }

  // Emit `comment.approved` only when this transition crossed into approved
  // from a non-approved prior state. Re-approving an already-approved comment
  // is idempotent and must not refire the event.
  if (input.status === 'approved' && !wasAlreadyApproved) {
    // Load article + commenter for the payload — notifications listener needs
    // the article author's id and the commenter's display name.
    const [article, commenter] = await Promise.all([
      articlesRepo.findById(updated.articleId),
      usersRepo.findById(updated.userId),
    ]);

    if (article && commenter) {
      commentEvents.emit('comment.approved', {
        commentId: updated._id.toString(),
        articleId: updated.articleId.toString(),
        articleAuthorId: article.authorId.toString(),
        commenterId: updated.userId.toString(),
        commenterName: commenter.name,
        slug: article.slug,
      });
    }
  }

  return updated;
}

// ─── delete ─────────────────────────────────────────────────────────────

export interface DeleteCommentInput {
  commentId: string;
  actorId: string;
  actorRole: UserRole;
}

export async function deleteComment(input: DeleteCommentInput): Promise<void> {
  if (!Types.ObjectId.isValid(input.commentId)) {
    throw ApiError.notFound('Comment not found');
  }

  const existing = await commentsRepo.findById(input.commentId);
  if (!existing) {
    throw ApiError.notFound('Comment not found');
  }

  const isOwner = existing.userId.toString() === input.actorId;
  const isPrivileged = input.actorRole === 'editor' || input.actorRole === 'admin';
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('Not permitted to delete this comment');
  }

  const deleted = await commentsRepo.deleteById(existing._id);
  if (!deleted) {
    // Concurrent delete — treat as success.
    return;
  }

  auditLog(
    {
      entity: 'comment',
      entityId: existing._id.toString(),
      action: 'deleted',
      actor: input.actorId,
      details: {
        articleId: existing.articleId.toString(),
        priorStatus: existing.status,
        byOwner: isOwner,
      },
    },
    'comment_deleted',
  );

  // Keep the denormalised approved-comment count in sync — only an APPROVED
  // comment was contributing to it.
  if (existing.status === 'approved') {
    await articlesRepo.adjustCommentCount(existing.articleId, -1);
  }
}

// Re-export the document type so callers (controller) can reference it
// without a deep import.
export type { CommentDocument };
