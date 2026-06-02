/**
 * Search service — Mongo text search over published articles.
 *
 * Surface:
 *   - searchText        — `GET /v1/search` handler logic; runs `$text` over
 *                         the title + plainText + tags index from the
 *                         Articles model (added in PR #6 / Subphase 3).
 *   - indexArticle      — boot-time hook for when an article is published.
 *                         No-op on Mongo text (the index is automatic on
 *                         insert); exists as the seam Phase 2 will swap for
 *                         Atlas Search / Qdrant without touching callers.
 *   - removeArticle     — same shape for unpublish.
 *
 * Listener wiring lives in `./listeners.ts` — both hooks subscribe to the
 * matching article event.
 *
 * Results filter to `status: 'published'` only — readers don't see drafts.
 */
import type { FilterQuery, Types } from 'mongoose';

import { Article, type ArticleDocument, type ArticleModel } from '@/modules/articles';
import { logger } from '@/config/logger';

export interface SearchTextInput {
  q: string;
  category?: string;
  page?: number;
  limit?: number;
}

export interface SearchTextResult {
  items: ArticleModel[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Run a `$text` search across the (title + plainText + tags) compound text
 * index on the Articles collection. Sorted by Mongo's text score with a
 * tiebreaker on publishedAt DESC so freshness wins ties.
 *
 * Drafts / submitted / rejected / unpublished are filtered out — public
 * search must only surface live content.
 */
export async function searchText(input: SearchTextInput): Promise<SearchTextResult> {
  const page = Math.max(1, input.page ?? 1);
  const limit = Math.max(1, Math.min(50, input.limit ?? 20));
  const skip = (page - 1) * limit;

  const filter: FilterQuery<ArticleDocument> = {
    $text: { $search: input.q },
    status: 'published',
    deletedAt: null,
  };
  if (input.category) filter.category = input.category;

  const [items, total] = await Promise.all([
    // `score: { $meta: 'textScore' }` projects the score so `.sort` can use
    // it; without the project Mongo refuses the sort.
    Article.find(filter, { score: { $meta: 'textScore' } })
      .sort({ score: { $meta: 'textScore' }, publishedAt: -1 })
      .skip(skip)
      .limit(limit)
      .exec(),
    Article.countDocuments(filter).exec(),
  ]);

  return { items, total, page, limit };
}

/**
 * Hook called when an article is published. Mongo's text index is updated
 * automatically by the model, so this is a no-op — the function exists
 * solely to provide a stable seam for Phase 2's Atlas Search / Qdrant
 * migration. Future implementation: push the (id, title, plainText, tags,
 * publishedAt) tuple into the external index.
 *
 * Logs at debug level so the audit trail records the call (useful for
 * tracing the migration to external search later).
 */
export async function indexArticle(article: ArticleModel): Promise<void> {
  logger.debug({ articleId: article._id.toString(), slug: article.slug }, 'search_index_article');
  // No-op on Mongo. Phase 2 swaps the body here.
  await Promise.resolve();
}

/**
 * Hook called when an article is unpublished. Same shape — no-op on
 * Mongo (the text index reflects the underlying doc; the `status: 'published'`
 * filter in `searchText` excludes the now-unpublished row). Phase 2 will
 * actually issue a `DELETE` against the external index here.
 */
export async function removeArticle(articleId: Types.ObjectId | string): Promise<void> {
  logger.debug({ articleId: articleId.toString() }, 'search_remove_article');
  await Promise.resolve();
}
