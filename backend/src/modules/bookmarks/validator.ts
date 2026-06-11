/**
 * Zod schemas for the bookmarks module — docs/05-api-documentation.md §5.13.
 */
import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdString = z.string().regex(objectIdRegex, 'Invalid id');

/** `GET /v1/bookmarks?page=1&limit=20` — pagination only; scope is always
 * the calling user (auth-bound). */
export const listBookmarksQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type ListBookmarksQuery = z.infer<typeof listBookmarksQuerySchema>;

/** `POST|DELETE /v1/bookmarks/:articleId` — path param shared by both. */
export const bookmarkArticleParamSchema = z.object({
  articleId: objectIdString,
});
