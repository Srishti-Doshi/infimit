/**
 * Zod schemas for the users module's request bodies + path params.
 *
 * Reuses the password / email schemas from auth/validator where possible —
 * password policy is global, not per-module.
 */
import { z } from 'zod';

// Import directly from the validator file (not the auth barrel) — the barrel
// also re-exports `authRoutes`, which transitively pulls users back, creating
// a CJS cycle that crashes `tsx watch` at boot. The repo's `no-restricted-imports`
// rule normally forbids deep imports; this is the documented exception until the
// auth barrel is split (routes vs schemas) in Subphase 3.
// eslint-disable-next-line no-restricted-imports
import { emailSchema, passwordSchema } from '@/modules/auth/validator';

/**
 * Self-update — readers + authors can edit their own name (and authors their
 * public slug). Slug uniqueness is enforced at the DB; conflicts surface as 409.
 */
export const updateMeBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .min(1)
      .max(100)
      .regex(/^[a-z0-9-]+$/)
      .optional(),
  })
  .refine((data) => data.name !== undefined || data.slug !== undefined, {
    message: 'At least one of name or slug is required',
  });

export type UpdateMeBody = z.infer<typeof updateMeBodySchema>;

/**
 * Admin creates an editor with a starter password + optional section scoping.
 * Editor receives a welcome email with their login credentials (stub logs it).
 *
 * `sectionsOwned` corresponds to the 5 categories enum from the seed
 * (education_policy / campus_news / research_innovation / student_achievements
 * / tech_in_education). Empty array means the editor has cross-section reach.
 */
export const createEditorBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  email: emailSchema,
  password: passwordSchema,
  sectionsOwned: z.array(z.string().trim().min(1).max(64)).default([]),
});

export type CreateEditorBody = z.infer<typeof createEditorBodySchema>;

/** ObjectId-shaped path param for /editors/:id. */
export const objectIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid id'),
});

/** Slug path param for /authors/:slug. */
export const slugParamSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(100),
});

/** Common pagination query. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
