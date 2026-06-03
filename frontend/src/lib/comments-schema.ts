import { z } from 'zod';

/**
 * Client-side Zod schemas for comments.
 *
 * Mirror the backend validators at `backend/src/modules/comments/validator.ts`
 * so the FE catches shape errors before round-tripping a 422.
 *
 * - `postCommentSchema` matches `postCommentBodySchema` (1–2000 chars + optional parentId).
 * - Moderation actions (approve / reject / hide) take no body; nothing to validate.
 */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/** Plain-text comment body. Backend trims + caps at 2000 chars. */
export const postCommentSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, 'Write something before posting')
    .max(2000, 'Comments are capped at 2000 characters'),
  parentId: objectIdSchema.nullish(),
});
export type PostCommentInput = z.infer<typeof postCommentSchema>;
