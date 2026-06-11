/**
 * Search API client (Sub-PR 5-fb).
 *
 * Wraps `GET /v1/search` from the BE search module (Mongo `$text` over the
 * title + plainText + tags compound index). Returns articles ranked by text
 * score with `publishedAt` as a tiebreaker on the server side. Public — no
 * auth required.
 *
 * The wire shape uses the full `Article` type because the BE search service
 * returns hydrated Article docs (with body / plainText / etc) — the search
 * results page only renders the card-shape fields, but typing the wire as
 * Article lets future consumers (e.g. a result preview drawer) reach for
 * the full doc without a second fetch.
 */
import { apiClient } from './api-client';
import type { ApiSuccess } from '@/types/api';
import type { Article, ArticleCategory } from '@/types/article';

export interface SearchQuery {
  q: string;
  category?: ArticleCategory;
  page?: number;
  limit?: number;
}

export interface SearchResult {
  items: Article[];
  total: number;
  page: number;
  limit: number;
}

export async function searchArticles(query: SearchQuery): Promise<SearchResult> {
  const res = await apiClient.get<ApiSuccess<SearchResult>>('/search', { params: query });
  return res.data.data;
}
