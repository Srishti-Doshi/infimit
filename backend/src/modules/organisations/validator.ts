/**
 * Zod schemas for the organisations module.
 *
 * Slugs follow the same lowercase-hyphen convention as user slugs so links and
 * URLs stay predictable. Category is the closed enum from model.ts.
 */
import { z } from 'zod';

const slugRegex = /^[a-z0-9-]+$/;

/** Path-param: 24-char hex ObjectId. */
export const organisationIdParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid organisation id'),
});

/** Path-param: slug. */
export const organisationSlugParamSchema = z.object({
  slug: z.string().trim().toLowerCase().min(1).max(100),
});

/** List query — pagination + optional category filter + free-text search. */
export const listOrganisationsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  category: z.enum(['college', 'ngo', 'research_lab', 'other']).optional(),
  q: z.string().trim().min(1).max(255).optional(),
});
export type ListOrganisationsQuery = z.infer<typeof listOrganisationsQuerySchema>;

/**
 * Create — admin only. Slug must be unique across the collection (DB-enforced).
 * `verified` defaults to true on admin-creation since the admin is the source
 * of truth; we still allow override for staging admin-created-but-pending rows.
 */
export const createOrganisationBodySchema = z.object({
  name: z.string().trim().min(1).max(255),
  slug: z.string().trim().toLowerCase().min(1).max(100).regex(slugRegex),
  category: z.enum(['college', 'ngo', 'research_lab', 'other']),
  description: z.string().trim().max(2000).optional(),
  website: z.string().trim().url().max(500).optional(),
  logoUrl: z.string().trim().url().max(500).optional(),
  contactEmail: z.string().trim().toLowerCase().email().max(255).optional(),
  contactPhone: z.string().trim().min(1).max(50).optional(),
  verified: z.boolean().optional(),
});
export type CreateOrganisationBody = z.infer<typeof createOrganisationBodySchema>;

/**
 * Patch — admin only. Slug is intentionally NOT mutable post-create: it appears
 * in author registration payloads and changing it would orphan affiliations.
 */
export const updateOrganisationBodySchema = z
  .object({
    name: z.string().trim().min(1).max(255).optional(),
    category: z.enum(['college', 'ngo', 'research_lab', 'other']).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    website: z.string().trim().url().max(500).nullable().optional(),
    logoUrl: z.string().trim().url().max(500).nullable().optional(),
    contactEmail: z.string().trim().toLowerCase().email().max(255).nullable().optional(),
    contactPhone: z.string().trim().min(1).max(50).nullable().optional(),
    verified: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field is required',
  });
export type UpdateOrganisationBody = z.infer<typeof updateOrganisationBodySchema>;
