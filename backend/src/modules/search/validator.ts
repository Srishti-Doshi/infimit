/**
 * Zod schemas for the search module.
 *
 * Per docs/05-api-documentation.md §5.14. Phase 1 covers `GET /v1/search`
 * with text search over articles. Semantic search lands in Phase 2.
 */
import { z } from 'zod';

import { ARTICLE_CATEGORIES } from '@/shared/constants/articleCategories';

/**
 * `GET /v1/search?q=...`
 *
 * - `q` — required free-text query, 2-200 chars. Below 2 chars is too noisy
 *   for Mongo text search; above 200 is almost certainly an abuse / typo.
 * - `category` — optional filter to one of the 5 article categories.
 * - `page` / `limit` — pagination; capped at 50 per page to keep search
 *   responses snappy.
 */
export const searchQuerySchema = z.object({
  q: z.string().trim().min(2, 'Query must be at least 2 characters').max(200),
  category: z.enum(ARTICLE_CATEGORIES as unknown as [string, ...string[]]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(50).optional(),
});
export type SearchQuery = z.infer<typeof searchQuerySchema>;
