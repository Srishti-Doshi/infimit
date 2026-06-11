/**
 * Zod schemas for the articles module.
 *
 * Hard limits enforced here are TRANSPORT-level (request shape, attack-surface
 * size caps). Semantic submit-time rules (plainText ≥ 300 chars, cover image
 * required, etc.) live in the service so the controller doesn't fail validation
 * before the service can emit a precise `details` payload the FE renders.
 *
 * Body is capped at 500 KB at the validator per Subphase 3 doc §7
 * ("HTML body size cap. Hard reject body > 500 KB at validator.").
 */
import { z } from 'zod';

import type { ARTICLE_CATEGORIES } from '@/shared/constants/articleCategories';

const objectIdRegex = /^[0-9a-fA-F]{24}$/;
const objectIdString = z.string().regex(objectIdRegex, 'Invalid id');

const BODY_MAX_BYTES = 500 * 1024;

const articleCategorySchema = z.enum([
  'education_policy',
  'campus_news',
  'research_innovation',
  'student_achievements',
  'tech_in_education',
] as const) satisfies z.ZodType<(typeof ARTICLE_CATEGORIES)[number]>;

const tagsSchema = z.array(z.string().trim().min(1).max(50)).max(20);

/**
 * `POST /v1/articles` — create draft.
 *
 * Most fields are optional at create-time so the FE can save partial drafts
 * (Tiptap auto-save flows). The strict bar is at SUBMIT, not CREATE; that's
 * where the service enforces the submit-time validation table.
 */
export const createArticleBodySchema = z.object({
  title: z.string().trim().min(1).max(200),
  subtitle: z.string().trim().max(500).optional(),
  body: z
    .string()
    .max(BODY_MAX_BYTES, `body exceeds the ${BODY_MAX_BYTES / 1024} KB hard limit`)
    .optional(),
  category: articleCategorySchema,
  subcategory: z.string().trim().max(100).nullish(),
  location: z.string().trim().max(100).optional(),
  tags: tagsSchema.optional(),
  coverImageMediaId: objectIdString.nullish(),
  mediaIds: z.array(objectIdString).max(50).optional(),
});
export type CreateArticleBody = z.infer<typeof createArticleBodySchema>;

/**
 * `PATCH /v1/articles/:id` — update draft.
 *
 * Every mutable field is optional. The required `version` is the caller's
 * snapshot of the article's optimistic-concurrency token; the repository
 * rejects with 409 VERSION_CONFLICT if it doesn't match the current row.
 */
export const updateArticleBodySchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    subtitle: z.string().trim().max(500).optional(),
    body: z
      .string()
      .max(BODY_MAX_BYTES, `body exceeds the ${BODY_MAX_BYTES / 1024} KB hard limit`)
      .optional(),
    category: articleCategorySchema.optional(),
    subcategory: z.string().trim().max(100).nullish(),
    location: z.string().trim().max(100).optional(),
    tags: tagsSchema.optional(),
    coverImageMediaId: objectIdString.nullish(),
    mediaIds: z.array(objectIdString).max(50).optional(),
    /** Caller's read-time version of the article (for optimistic concurrency). */
    version: z.coerce.number().int().nonnegative(),
  })
  .refine(
    (data) => {
      // Must include at least one mutable field besides `version`.
      const keys = Object.keys(data).filter((k) => k !== 'version');
      return keys.length > 0;
    },
    { message: 'At least one field must be updated' },
  );
export type UpdateArticleBody = z.infer<typeof updateArticleBodySchema>;

/**
 * `GET /v1/articles` query for list-mine (the Subphase 3 surface). Public list
 * filters (published articles, sorted, paginated, with category/location) land
 * in later subphases — the schema is purposefully tight here.
 */
const ARTICLE_STATUS_VALUES = [
  'draft',
  'submitted',
  'approved',
  'published',
  'rejected',
  'unpublished',
] as const;

/**
 * `?status=` accepts either a single value (back-compat with Subphase 3
 * callers) OR a comma-separated list (`?status=published,unpublished`) OR
 * repeated query params (`?status=published&status=unpublished`). The Zod
 * preprocess normalises to a deduped array; the service applies `$in` when
 * the array has more than one element. Pins #77 — the admin articles surface
 * no longer needs to over-fetch and filter client-side.
 */
const statusFilter = z
  .union([z.string(), z.array(z.string())])
  .transform((v) =>
    (Array.isArray(v) ? v : v.split(','))
      .map((s) => s.trim())
      .filter((s, i, arr) => s.length > 0 && arr.indexOf(s) === i),
  )
  .pipe(z.array(z.enum(ARTICLE_STATUS_VALUES)).min(1).max(ARTICLE_STATUS_VALUES.length));

/**
 * Shared query schema for `GET /v1/articles`. The route is dual-mode:
 *   - Authenticated + (`status` OR `authorId`) → dashboard list (role-scoped)
 *   - No auth or no dashboard params → public reader list (status=published
 *     implicit, public reader filters apply)
 *
 * The controller branches on `req.user` + presence of dashboard params; the
 * schema accepts the union so both paths share a single validation step.
 */
export const listArticlesQuerySchema = z
  .object({
    // Dashboard-only filters
    status: statusFilter.optional(),
    authorId: z.union([z.literal('me'), objectIdString]).optional(),
    // Public reader filters (Subphase 5)
    category: articleCategorySchema.optional(),
    location: z.string().trim().min(1).max(100).optional(),
    dateFrom: z.coerce.date().optional(),
    dateTo: z.coerce.date().optional(),
    // Shared pagination
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
  })
  .refine((data) => !data.dateFrom || !data.dateTo || data.dateFrom <= data.dateTo, {
    message: 'dateFrom must be on or before dateTo',
    path: ['dateFrom'],
  });
export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;

/** Path-param: 24-char hex ObjectId. */
export const articleIdParamSchema = z.object({
  id: objectIdString,
});

/** Path-param: article slug for the public read endpoint (Subphase 4 GET /:slug). */
export const articleSlugParamSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(200),
});

/**
 * `POST /v1/articles/:id/reject` — editor/admin rejects a submitted article.
 *
 * Rejection reason is required and visible to the author (it's the message
 * they'll act on when revising). Min 10 chars to discourage drive-by "no"s,
 * max 500 to keep the notification body manageable.
 */
export const rejectArticleBodySchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(10, 'Rejection reason must be at least 10 characters')
    .max(500, 'Rejection reason must be at most 500 characters'),
});
export type RejectArticleBody = z.infer<typeof rejectArticleBodySchema>;

/**
 * `PATCH /v1/articles/:id/placement` — editor/admin sets editorial-surface
 * placement flags + priority for a PUBLISHED article. Service-layer rejects
 * the transition if the article isn't published.
 *
 * `version` is required for optimistic concurrency (placement edits race
 * with publish/unpublish + with other editors editing placement
 * simultaneously).
 */
export const placementBodySchema = z
  .object({
    featured: z.boolean().optional(),
    trending: z.boolean().optional(),
    trail: z.boolean().optional(),
    priority: z.coerce.number().int().min(0).max(100).optional(),
    version: z.coerce.number().int().nonnegative(),
  })
  .refine(
    (data) => {
      const keys = Object.keys(data).filter((k) => k !== 'version');
      return keys.length > 0;
    },
    { message: 'At least one placement field is required' },
  );
export type PlacementBody = z.infer<typeof placementBodySchema>;

/**
 * `POST /v1/articles/:id/ai/summary` — force-regenerate the AI summary.
 *
 * `force=true` (default) is the only way the FE invokes this — there's no
 * other reason to hit the endpoint. Kept as a body field so a future
 * "cache only" variant can be added without breaking the URL.
 */
export const regenerateSummaryBodySchema = z
  .object({
    force: z.boolean().optional().default(true),
  })
  .default({ force: true });
export type RegenerateSummaryBody = z.infer<typeof regenerateSummaryBodySchema>;
