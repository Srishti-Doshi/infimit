import { z } from 'zod';

import type { Article, ArticleCategory } from '@/types/article';

/**
 * Client-side Zod schemas for articles.
 *
 * Two layers, deliberately separate:
 *
 * - **Transport schemas** (`createDraftSchema`, `updateDraftSchema`) mirror the
 *   backend validator (`backend/src/modules/articles/validator.ts`). Used to
 *   form-validate before sending.
 * - **Submit-readiness checklist** (`submitReadiness`) mirrors the stricter
 *   service-layer rules the backend enforces on `POST /:id/submit`. Used to
 *   gate the "Submit for review" CTA + render the validation sidebar.
 *
 * Keep these in sync with the backend's validator and the submit rules in
 * docs/07-workflows.md §7.1.
 */

const BODY_MAX_BYTES = 500 * 1024;

// Inline literal tuple — zod v4's `z.enum` overload resolution prefers the
// inline tuple form over a re-imported `as const` readonly tuple. Keep in sync
// with `ARTICLE_CATEGORIES` in `@/types/article`; a 5-string drift risk is fine.
const categorySchema = z.enum([
  'education_policy',
  'campus_news',
  'research_innovation',
  'student_achievements',
  'tech_in_education',
]);

const tagsSchema = z.array(z.string().trim().min(1).max(50)).max(20);

const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/** Display label per category — used by `<CategorySelect>`. */
export const ARTICLE_CATEGORY_LABELS: Readonly<Record<ArticleCategory, string>> = {
  education_policy: 'Education Policy',
  campus_news: 'Campus News',
  research_innovation: 'Research & Innovation',
  student_achievements: 'Student Achievements',
  tech_in_education: 'Tech in Education',
};

/** Title-only mirror of the backend `createArticleBodySchema`. */
export const createDraftSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200, 'Title is too long'),
  subtitle: z.string().trim().max(500).optional(),
  body: z.string().max(BODY_MAX_BYTES, 'Body exceeds the 500 KB limit').optional(),
  plainText: z.string().optional(),
  category: categorySchema,
  subcategory: z.string().trim().max(100).nullish(),
  location: z.string().trim().max(100).optional(),
  tags: tagsSchema.optional(),
  coverImageMediaId: objectIdSchema.nullish(),
  mediaIds: z.array(objectIdSchema).max(50).optional(),
});
export type CreateDraftInput = z.infer<typeof createDraftSchema>;

/**
 * PATCH body — every field optional, plus the REQUIRED `version` token for
 * optimistic concurrency.
 */
export const updateDraftSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    subtitle: z.string().trim().max(500).optional(),
    body: z.string().max(BODY_MAX_BYTES).optional(),
    plainText: z.string().optional(),
    category: categorySchema.optional(),
    subcategory: z.string().trim().max(100).nullish(),
    location: z.string().trim().max(100).optional(),
    tags: tagsSchema.optional(),
    coverImageMediaId: objectIdSchema.nullish(),
    mediaIds: z.array(objectIdSchema).max(50).optional(),
    version: z.number().int().nonnegative(),
  })
  .refine((d) => Object.keys(d).some((k) => k !== 'version'), {
    message: 'At least one field must change',
  });
export type UpdateDraftInput = z.infer<typeof updateDraftSchema>;

/**
 * `POST /v1/articles/:id/reject` body — editor / admin rejects a submitted
 * article. The reason becomes a notification to the author, so the floor is
 * 10 chars (discourage drive-by "no"s) and the ceiling 500 (keep the
 * notification body manageable).
 *
 * Wire-shape note: the backend field is `rejectionReason`, NOT `reason` —
 * matches the persisted column on the article doc.
 */
export const rejectArticleSchema = z.object({
  rejectionReason: z
    .string()
    .trim()
    .min(10, 'Rejection reason must be at least 10 characters')
    .max(500, 'Rejection reason must be at most 500 characters'),
});
export type RejectArticleInput = z.infer<typeof rejectArticleSchema>;

/**
 * `PATCH /v1/articles/:id/placement` body — placement flags + priority for
 * a published article. `version` is required for optimistic concurrency
 * (placement edits race with publish/unpublish + with other editors).
 *
 * The refine matches the backend rule: at least one mutable field beyond
 * `version` must be present.
 */
export const placementSchema = z
  .object({
    featured: z.boolean().optional(),
    trending: z.boolean().optional(),
    trail: z.boolean().optional(),
    priority: z.coerce.number().int().min(0).max(100).optional(),
    version: z.number().int().nonnegative(),
  })
  .refine((data) => Object.keys(data).some((k) => k !== 'version'), {
    message: 'At least one placement field must change',
  });
export type PlacementInput = z.infer<typeof placementSchema>;

/**
 * Submit-readiness checklist. Renders directly as the validation sidebar; the
 * "Submit" CTA is enabled iff every flag is true.
 */
export interface SubmitReadiness {
  title: boolean;
  body: boolean;
  category: boolean;
  cover: boolean;
  tags: boolean;
  /** Convenience aggregate — true iff every other flag is true. */
  ready: boolean;
}

/** Minimum plain-text length the backend enforces at submit (per workflows §7.1). */
export const SUBMIT_MIN_PLAIN_TEXT = 300;

/**
 * Compute readiness for a draft. Accepts a partial Article-shape so a fresh
 * `useForm` draft (no `id`, no `version`) can be inspected before the first save.
 */
export function submitReadiness(draft: Partial<Article>): SubmitReadiness {
  const title = !!draft.title && draft.title.trim().length > 0 && draft.title.length <= 200;
  const body = (draft.plainText ?? '').length >= SUBMIT_MIN_PLAIN_TEXT;
  const category = !!draft.category;
  const cover = !!draft.coverImageMediaId;
  const tagCount = draft.tags?.length ?? 0;
  const tags = tagCount >= 1 && tagCount <= 10;

  return { title, body, category, cover, tags, ready: title && body && category && cover && tags };
}
