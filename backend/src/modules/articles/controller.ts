/**
 * Articles controllers — HTTP layer (Subphase 3 surface).
 *
 * Endpoints handled here:
 *   - POST   /v1/articles               create draft
 *   - PATCH  /v1/articles/:id           update draft (optimistic concurrency)
 *   - GET    /v1/articles               list (mine for authors; broad for editor/admin)
 *   - GET    /v1/articles/:id           get by id (owner / editor / admin)
 *   - POST   /v1/articles/:id/submit    submit draft for review
 *   - DELETE /v1/articles/:id           soft delete
 *
 * Approval / rejection / publishing / placement land in Subphase 4 — the
 * routes for those are deliberately not registered yet.
 */
import { type Request, type Response } from 'express';

import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import {
  approveArticle,
  createDraft,
  getArticleById,
  getArticleBySlug,
  listArticles,
  publishArticle,
  regenerateSummary,
  rejectArticle,
  setPlacement,
  softDeleteArticle,
  submitForReview,
  unpublishArticle,
  updateDraft,
} from './service';
import type {
  CreateArticleBody,
  ListArticlesQuery,
  PlacementBody,
  RegenerateSummaryBody,
  RejectArticleBody,
  UpdateArticleBody,
} from './validator';

export const createArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const body = req.body as CreateArticleBody;
  const article = await createDraft({
    authorId: req.user.id,
    organisationId: req.user.organisationId ?? null,
    title: body.title,
    subtitle: body.subtitle,
    body: body.body,
    category: body.category,
    subcategory: body.subcategory,
    location: body.location,
    tags: body.tags,
    coverImageMediaId: body.coverImageMediaId ?? null,
    mediaIds: body.mediaIds,
  });
  res.status(201).json({ success: true, data: { article: article.toJSON() } });
});

export const updateArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const body = req.body as UpdateArticleBody;
  const { version, ...patch } = body;
  const article = await updateDraft({
    articleId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
    version,
    patch,
  });
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const getArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const article = await getArticleById(id, req.user ?? null);
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const listArticlesHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const query = req.query as ListArticlesQuery;
  const result = await listArticles({
    status: query.status,
    authorId: query.authorId,
    page: query.page,
    limit: query.limit,
    viewer: { id: req.user.id, role: req.user.role },
  });
  res.status(200).json({
    success: true,
    data: {
      items: result.items,
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});

export const submitArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const article = await submitForReview(id, req.user.id);
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const deleteArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  await softDeleteArticle({
    articleId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  res.status(204).send();
});

// ─── Subphase 4 surface ─────────────────────────────────────────────────

export const approveArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const article = await approveArticle({
    articleId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const rejectArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const body = req.body as RejectArticleBody;
  const article = await rejectArticle({
    articleId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
    rejectionReason: body.rejectionReason,
  });
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const publishArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const article = await publishArticle({
    articleId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const unpublishArticleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const article = await unpublishArticle({
    articleId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const setPlacementHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  const body = req.body as PlacementBody;
  const { version, ...patch } = body;
  const article = await setPlacement({
    articleId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
    version,
    patch,
  });
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const regenerateSummaryHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  // `RegenerateSummaryBody` carries an optional `force` flag (defaults true).
  // We don't branch on it yet — the service always regenerates — but the
  // schema exists so a future "cache-only" path can be added without a
  // breaking URL change.
  const _body = req.body as RegenerateSummaryBody;
  void _body;
  const article = await regenerateSummary({
    articleId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  // Return the FULL article so the FE can update its local cache; the `ai`
  // sub-object is what the regenerate UI badge actually consumes.
  res.status(200).json({ success: true, data: { article: article.toJSON() } });
});

export const getArticleBySlugHandler = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params as { slug: string };
  const article = await getArticleBySlug(slug);
  res.status(200).json({ success: true, data: { article } });
});
