/**
 * Zod schemas for the comments module.
 *
 * Transport-layer shape checks. Semantic rules (rate limit, ownership,
 * status-transition validity) live in the service.
 */
import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdString = z.string().regex(objectIdRegex, 'Invalid id');

/**
 * `POST /v1/articles/:articleId/comments`
 *
 * Body content cap matches the Mongoose schema (2000 chars). `parentId`
 * supports threaded replies (one level deep is enough for P1; the schema
 * doesn't enforce depth, so the FE caps recursion if it wants visual order).
 */
export const postCommentBodySchema = z.object({
  body: z.string().trim().min(1, 'Comment body is required').max(2000),
  parentId: objectIdString.nullish(),
});
export type PostCommentBody = z.infer<typeof postCommentBodySchema>;

/**
 * Pagination + status filter for comment list endpoints. Used by both the
 * public article-scoped GET (status fixed to `approved` server-side) and
 * the moderation queue GET (status defaults to `pending`).
 */
export const listCommentsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type ListCommentsQuery = z.infer<typeof listCommentsQuerySchema>;

/** Path-param: 24-char hex ObjectId for `:articleId`. */
export const articleIdParamSchema = z.object({
  articleId: objectIdString,
});

/** Path-param: 24-char hex ObjectId for the moderation `/:id` routes. */
export const commentIdParamSchema = z.object({
  id: objectIdString,
});
