/**
 * Zod schemas for the e-paper module.
 *
 * Per docs/05-api-documentation.md §5.11. The endpoint takes JSON (not
 * multipart) — the PDF + cover are uploaded separately via
 * `/v1/media/upload-url` and `/v1/media/register`; the create body just
 * carries the resulting media ids.
 */
import { z } from 'zod';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdString = z.string().regex(objectIdRegex, 'Invalid id');

/**
 * `POST /v1/epapers` — admin creates a new issue.
 *
 * Dates accept ISO strings (FE sends `new Date().toISOString()`) or
 * anything z.coerce.date can parse. `pageCount` is optional — admins
 * often don't know it at upload time and let the FE derive it later.
 */
export const createEpaperBodySchema = z.object({
  title: z.string().trim().min(1).max(255),
  issueDate: z.coerce.date(),
  pdfMediaId: objectIdString,
  coverMediaId: objectIdString,
  pageCount: z.coerce.number().int().nonnegative().max(10_000).optional(),
});
export type CreateEpaperBody = z.infer<typeof createEpaperBodySchema>;

/** Pagination + optional date-range filters for the archive list. */
export const listEpapersQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});
export type ListEpapersQuery = z.infer<typeof listEpapersQuerySchema>;

/** Path-param: 24-char hex ObjectId. */
export const epaperIdParamSchema = z.object({
  id: objectIdString,
});
