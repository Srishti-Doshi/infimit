import { apiClient } from './api-client';
import type {
  CreateDraftInput,
  PlacementInput,
  RejectArticleInput,
  UpdateDraftInput,
} from './articles-schema';
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
 * `GET /v1/articles/slug/:slug` — public; returns only published articles.
 * Backend authoritatively scopes to `status: 'published'` and includes the
 * full Article shape with AI summary so the reader page can render with one
 * request. Returns 404 for unpublished slugs (no existence leak).
 */
export async function getArticleBySlug(slug: string): Promise<Article> {
  const res = await apiClient.get<ApiSuccess<{ article: Article }>>(`/articles/slug/${slug}`);
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

// ─── Editorial lifecycle (Subphase 4) ───────────────────────────────────
//
// Approve / reject / publish / unpublish all handle optimistic concurrency
// server-side — no `version` in the body. Placement DOES require version
// because placement edits race with publish/unpublish + with concurrent
// editors. Backend returns the updated article on every action; we return
// it so callers can hand the fresh object back to the cache.

/**
 * `GET /v1/articles?status=submitted` — convenience wrapper for the
 * approvals queue. Backend authoritatively scopes editors to their
 * `sectionsOwned`; admins see all.
 */
export async function listSubmittedArticles(
  query: Omit<ListArticlesQuery, 'status'> = {},
): Promise<ArticlesListResult> {
  return listArticles({ ...query, status: 'submitted' });
}

/** `POST /v1/articles/:id/approve` — fires the AI pipeline on success. */
export async function approveArticle(id: string): Promise<Article> {
  const res = await apiClient.post<ApiSuccess<{ article: Article }>>(`/articles/${id}/approve`);
  return res.data.data.article;
}

/**
 * `POST /v1/articles/:id/reject` — notifies the author with the reason.
 * Reason: 10–500 chars (validated client-side via `rejectArticleSchema`).
 */
export async function rejectArticle(id: string, body: RejectArticleInput): Promise<Article> {
  const res = await apiClient.post<ApiSuccess<{ article: Article }>>(
    `/articles/${id}/reject`,
    body,
  );
  return res.data.data.article;
}

/** `POST /v1/articles/:id/publish` — flips approved → published. */
export async function publishArticle(id: string): Promise<Article> {
  const res = await apiClient.post<ApiSuccess<{ article: Article }>>(`/articles/${id}/publish`);
  return res.data.data.article;
}

/** `POST /v1/articles/:id/unpublish` — admin only; reverts to unpublished. */
export async function unpublishArticle(id: string): Promise<Article> {
  const res = await apiClient.post<ApiSuccess<{ article: Article }>>(`/articles/${id}/unpublish`);
  return res.data.data.article;
}

/**
 * `PATCH /v1/articles/:id/placement` — sets featured/trending/trail/priority
 * on a published article. `version` is required for OCC; on stale version
 * the backend returns `409 VERSION_CONFLICT` with `details.currentVersion`.
 */
export async function updateArticlePlacement(id: string, body: PlacementInput): Promise<Article> {
  const res = await apiClient.patch<ApiSuccess<{ article: Article }>>(
    `/articles/${id}/placement`,
    body,
  );
  return res.data.data.article;
}

/**
 * `POST /v1/articles/:id/ai/summary` — force-regenerate the AI summary.
 *
 * Body carries `{ force: true }` by default (the only mode used in
 * Subphase 4). The backend re-runs the AI pipeline (opossum-gated) and
 * persists the result on `article.ai.*`. On circuit-open the result has
 * `degraded: true` and the FE should show the fallback badge.
 *
 * Open to author / editor / admin (the service further enforces author-of-own
 * when the caller is an author). Editor surfaces always have access.
 */
export async function regenerateArticleSummary(id: string): Promise<Article> {
  const res = await apiClient.post<ApiSuccess<{ article: Article }>>(`/articles/${id}/ai/summary`, {
    force: true,
  });
  return res.data.data.article;
}
