import { apiClient } from './api-client';
import type { PostCommentInput } from './comments-schema';
import type { ApiSuccess } from '@/types/api';
import type { Comment } from '@/types/comment';

/**
 * Comments resource client (Subphase 4 surface).
 *
 * Two surface families mounted under different paths:
 *
 *   /v1/articles/:articleId/comments  — public read of approved + authed post.
 *   /v1/comments                       — moderation queue + per-comment actions
 *                                        (editor/admin), plus owner-or-mod delete.
 *
 * Lists wrap as `data: { items, total, page?, limit? }`; singles wrap as
 * `data: { comment }`. All routes go through the apiClient interceptor for
 * bearer + single-flight refresh.
 */

export interface CommentsListResult {
  items: Comment[];
  total: number;
  page?: number;
  limit?: number;
}

export interface ListCommentsQuery {
  page?: number;
  limit?: number;
}

// ─── article-scoped reads + writes ──────────────────────────────────────

/**
 * `GET /v1/articles/:articleId/comments` — public; returns only approved.
 * Status filter is enforced server-side; FE doesn't get to ask for pending.
 */
export async function listArticleComments(
  articleId: string,
  query: ListCommentsQuery = {},
): Promise<CommentsListResult> {
  const res = await apiClient.get<ApiSuccess<CommentsListResult>>(
    `/articles/${articleId}/comments`,
    { params: query },
  );
  return res.data.data;
}

/**
 * `POST /v1/articles/:articleId/comments` — authed; body 1–2000 chars.
 * Comments land with `status: 'pending'` and surface in moderation queue.
 */
export async function postComment(articleId: string, body: PostCommentInput): Promise<Comment> {
  const res = await apiClient.post<ApiSuccess<{ comment: Comment }>>(
    `/articles/${articleId}/comments`,
    body,
  );
  return res.data.data.comment;
}

// ─── moderation queue + actions ─────────────────────────────────────────

/** `GET /v1/comments/pending` — editor/admin; paginated. */
export async function listPendingComments(
  query: ListCommentsQuery = {},
): Promise<CommentsListResult> {
  const res = await apiClient.get<ApiSuccess<CommentsListResult>>('/comments/pending', {
    params: query,
  });
  return res.data.data;
}

/** `POST /v1/comments/:id/approve` — editor/admin. */
export async function approveComment(id: string): Promise<Comment> {
  const res = await apiClient.post<ApiSuccess<{ comment: Comment }>>(`/comments/${id}/approve`);
  return res.data.data.comment;
}

/** `POST /v1/comments/:id/reject` — editor/admin. */
export async function rejectComment(id: string): Promise<Comment> {
  const res = await apiClient.post<ApiSuccess<{ comment: Comment }>>(`/comments/${id}/reject`);
  return res.data.data.comment;
}

/** `POST /v1/comments/:id/hide` — editor/admin; soft-removes an already-approved comment. */
export async function hideComment(id: string): Promise<Comment> {
  const res = await apiClient.post<ApiSuccess<{ comment: Comment }>>(`/comments/${id}/hide`);
  return res.data.data.comment;
}

/** `DELETE /v1/comments/:id` — owner OR editor/admin. */
export async function deleteComment(id: string): Promise<void> {
  await apiClient.delete(`/comments/${id}`);
}
