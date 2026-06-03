import { z } from 'zod';

/**
 * Client-side Zod schemas for the e-paper module.
 *
 * Mirrors `backend/src/modules/epaper/validator.ts`. The create body is
 * JSON (not multipart) — the PDF + cover are uploaded separately via
 * the media `/upload-url` + `/register` flow first, then their ids are
 * referenced here.
 */

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid media id');

/**
 * `POST /v1/epapers` body. `issueDate` arrives as an ISO date string from
 * the form's `<input type="date">` (`YYYY-MM-DD`) — backend `z.coerce.date`
 * accepts both that and full ISO timestamps.
 */
export const createEpaperSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(255, 'Title is too long'),
  issueDate: z
    .string()
    .min(1, 'Issue date is required')
    // YYYY-MM-DD or full ISO — both parse via `new Date()` on the wire.
    .refine((s) => !Number.isNaN(Date.parse(s)), 'Invalid date'),
  pdfMediaId: objectIdSchema,
  coverMediaId: objectIdSchema,
  pageCount: z.coerce.number().int().nonnegative().max(10_000).optional(),
});
export type CreateEpaperInput = z.infer<typeof createEpaperSchema>;
