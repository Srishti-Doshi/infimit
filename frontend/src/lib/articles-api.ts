import { apiClient } from './api-client';
import type { CreateDraftInput, UpdateDraftInput } from './articles-schema';
import type { ApiSuccess } from '@/types/api';
import type { Article, ArticleStatus } from '@/types/article';

/**
 * Articles resource client (Subphase 3 surface — author draft + submit).
 *
 * Lists wrap as `data: { items, total, page?, limit? }`; singles wrap as
 * `data: { article }`. All routes require Bearer auth; the apiClient
 * interceptor handles bearer + single-flight refresh.
 */

export interface ArticlesListResult {
  items: Article[];
  total: number;
  page?: number;
  limit?: number;
}

export interface ListArticlesQuery {
  status?: ArticleStatus;
  /** `'me'` resolves to the current user on the server. */
  authorId?: 'me' | string;
  page?: number;
  limit?: number;
}

/** `POST /v1/articles` — create a draft. Most fields are optional at create. */
export async function createDraft(body: CreateDraftInput): Promise<Article> {
  const res = await apiClient.post<ApiSuccess<{ article: Article }>>('/articles', body);
  return res.data.data.article;
}

/**
 * `PATCH /v1/articles/:id` — update draft (optimistic concurrency).
 * Body must include the caller's `version`; a stale version yields
 * `409 VERSION_CONFLICT` with `details.currentVersion`.
 */
export async function updateDraft(id: string, body: UpdateDraftInput): Promise<Article> {
  const res = await apiClient.patch<ApiSuccess<{ article: Article }>>(`/articles/${id}`, body);
  return res.data.data.article;
}

/** `GET /v1/articles` — list. Defaults to mine + drafts when called bare. */
export async function listArticles(query: ListArticlesQuery = {}): Promise<ArticlesListResult> {
  const res = await apiClient.get<ApiSuccess<ArticlesListResult>>('/articles', {
    params: query,
  });
  return res.data.data;
}

/** `GET /v1/articles/:id` — single article (any state, owner/editor/admin). */
export async function getArticle(id: string): Promise<Article> {
  const res = await apiClient.get<ApiSuccess<{ article: Article }>>(`/articles/${id}`);
  return res.data.data.article;
}

/**
 * `POST /v1/articles/:id/submit` — flip draft → submitted. Backend re-runs
 * the full submission checklist; failures arrive as `422 VALIDATION_ERROR`
 * with `details: { field, ... }` so the FE can render inline errors.
 */
export async function submitForReview(id: string): Promise<Article> {
  const res = await apiClient.post<ApiSuccess<{ article: Article }>>(`/articles/${id}/submit`);
  return res.data.data.article;
}

/** `DELETE /v1/articles/:id` — soft-delete (owner/editor/admin). */
export async function deleteArticle(id: string): Promise<void> {
  await apiClient.delete(`/articles/${id}`);
}
