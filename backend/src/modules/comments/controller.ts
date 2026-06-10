/**
 * Comments controllers — HTTP layer.
 *
 * Article-scoped handlers read `req.params.articleId` (set by the parent
 * `/articles/:articleId/comments` mount via `mergeParams: true`). Standalone
 * moderation handlers read `req.params.id` (the comment id).
 *
 * Validation is centralised in routes via `validate()`; controllers receive
 * parsed payloads.
 */
import { type Request, type Response } from 'express';

import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import {
  deleteComment,
  listForArticle,
  listPending,
  moderateComment,
  postComment,
} from './service';
import type { ListCommentsQuery, PostCommentBody } from './validator';

// ─── article-scoped handlers ────────────────────────────────────────────

export const postCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { articleId } = req.params as { articleId: string };
  const body = req.body as PostCommentBody;
  const comment = await postComment({
    articleId,
    userId: req.user.id,
    body: body.body,
    parentId: body.parentId ?? null,
  });
  res.status(201).json({ success: true, data: { comment: comment.toJSON() } });
});

export const listApprovedHandler = asyncHandler(async (req: Request, res: Response) => {
  const { articleId } = req.params as { articleId: string };
  const query = req.query as ListCommentsQuery;
  const result = await listForArticle(articleId, { page: query.page, limit: query.limit });
  res.status(200).json({
    success: true,
    data: {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});

// ─── moderation handlers (standalone /comments mount) ───────────────────

export const listPendingHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const query = req.query as ListCommentsQuery;
  const result = await listPending({
    actorRole: req.user.role,
    page: query.page,
    limit: query.limit,
  });
  res.status(200).json({
    success: true,
    data: {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});

export const approveCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const comment = await moderateComment({
    commentId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
    status: 'approved',
  });
  res.status(200).json({ success: true, data: { comment: comment.toJSON() } });
});

export const rejectCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const comment = await moderateComment({
    commentId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
    status: 'rejected',
  });
  res.status(200).json({ success: true, data: { comment: comment.toJSON() } });
});

export const hideCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const comment = await moderateComment({
    commentId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
    status: 'hidden',
  });
  res.status(200).json({ success: true, data: { comment: comment.toJSON() } });
});

export const deleteCommentHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  await deleteComment({
    commentId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  res.status(204).send();
});
