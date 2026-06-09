import { z } from 'zod';

import { emailSchema, nameSchema, passwordSchema } from './auth-schema';

/** Content categories used by editor `sectionsOwned` and article filtering. */
export const CONTENT_CATEGORIES = [
  { value: 'education_policy', label: 'Education Policy' },
  { value: 'campus_news', label: 'Campus News' },
  { value: 'research_innovation', label: 'Research & Innovation' },
  { value: 'student_achievements', label: 'Student Achievements' },
  { value: 'tech_in_education', label: 'Tech in Education' },
] as const;

const contentCategoryValues = CONTENT_CATEGORIES.map((c) => c.value) as [string, ...string[]];

/** Organisation categories (matches backend enum). */
export const ORG_CATEGORIES = [
  { value: 'college', label: 'College' },
  { value: 'ngo', label: 'NGO' },
  { value: 'research_lab', label: 'Research Lab' },
  { value: 'other', label: 'Other' },
] as const;

const orgCategorySchema = z.enum(['college', 'ngo', 'research_lab', 'other']);

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, 'Slug is required')
  .max(100, 'Slug is too long')
  .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers and hyphens only');

/**
 * Admin creates an editor. `sectionsOwned` is a list of content categories;
 * empty means cross-section reach.
 */
export const createEditorSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  // Optional rather than `.default([])` so the input/output types match —
  // RHF's `useForm` requires a single value-shape, and the backend's own
  // validator defaults missing values to [].
  sectionsOwned: z.array(z.enum(contentCategoryValues)).optional(),
});
export type CreateEditorInput = z.infer<typeof createEditorSchema>;

/** Admin creates an organisation. Slug is immutable post-create on the backend. */
export const createOrganisationSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(255),
  slug: slugSchema,
  category: orgCategorySchema,
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  website: z.string().trim().url('Must be a valid URL').optional().or(z.literal('')),
  contactEmail: emailSchema.optional().or(z.literal('')),
});
export type CreateOrganisationInput = z.infer<typeof createOrganisationSchema>;

/**
 * Admin patches an organisation. Slug is intentionally absent — see the
 * backend validator: changing slugs would orphan author affiliations.
 */
export const updateOrganisationSchema = z.object({
  name: z.string().trim().min(1).max(255).optional(),
  category: orgCategorySchema.optional(),
  description: z.string().trim().max(2000).optional().or(z.literal('')),
  website: z.string().trim().url().optional().or(z.literal('')),
  contactEmail: emailSchema.optional().or(z.literal('')),
  verified: z.boolean().optional(),
});
export type UpdateOrganisationInput = z.infer<typeof updateOrganisationSchema>;

/**
 * Admin creates an author. Submits to `POST /v1/auth/register` with
 * `role: 'author'`. Org slug is required by the backend — admin can copy it
 * from `/dashboard/admin/organisations`.
 */
export const createAuthorSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  organisationSlug: slugSchema,
});
export type CreateAuthorInput = z.infer<typeof createAuthorSchema>;

/** Lookup an existing user by email (admin role-management). */
export const lookupByEmailSchema = z.object({
  email: emailSchema,
});
export type LookupByEmailInput = z.infer<typeof lookupByEmailSchema>;

/** Admin changes any user's role via `PATCH /v1/users/:id/role`. */
export const updateUserRoleSchema = z.object({
  role: z.enum(['reader', 'author', 'editor', 'admin']),
});
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
