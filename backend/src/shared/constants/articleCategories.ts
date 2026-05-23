/**
 * Article category enum — the 5 top-level sections of the publication.
 *
 * Single source of truth referenced by:
 *   - Editor `sectionsOwned` validation (admin-creates-editor flow)
 *   - Seed script (Subphase 2)
 *   - Article model + validator (Subphase 3 — added there once articles land)
 *
 * Renames are a breaking change to the API contract and to existing editor
 * records. Add new categories at the END of the array to preserve order
 * stability for any FE that iterates by index.
 */
export const ARTICLE_CATEGORIES = [
  'education_policy',
  'campus_news',
  'research_innovation',
  'student_achievements',
  'tech_in_education',
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];
