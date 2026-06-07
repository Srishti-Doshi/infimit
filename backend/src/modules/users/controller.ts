/**
 * Users controllers — HTTP layer.
 *
 * Validation is done via the `validate()` middleware in routes.ts; controllers
 * receive already-parsed `req.body` / `req.query` / `req.params`.
 *
 * Avatar upload returns 501 — media is a Subphase 3 deliverable.
 */
import { type Request, type Response } from 'express';

import { ApiError, ErrorCode } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import {
  createEditor,
  getAuthorBySlug,
  getMe,
  listAuthors,
  listEditors,
  removeEditor,
  updateMe,
  updateUserRole,
} from './service';
import type { CreateEditorBody, PaginationQuery, UpdateMeBody, UpdateRoleBody } from './validator';

export const getMeHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const user = await getMe(req.user.id);
  res.status(200).json({
    success: true,
    data: { user: user.toJSON() },
  });
});

export const updateMeHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const body = req.body as UpdateMeBody;
  const user = await updateMe(req.user.id, body);
  res.status(200).json({
    success: true,
    data: { user: user.toJSON() },
  });
});

/**
 * Avatar upload — deferred to Subphase 3 (media module). Returning 501 here
 * keeps the route surface stable for the frontend; the FE can render a "coming
 * soon" hint when it sees NOT_IMPLEMENTED.
 */
export const uploadAvatarHandler = asyncHandler(async (_req: Request, _res: Response) => {
  throw new ApiError(
    501,
    ErrorCode.INTERNAL_ERROR,
    'Avatar upload is delivered in Subphase 3 (media module)',
  );
});

export const getAuthorBySlugHandler = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params as { slug: string };
  const user = await getAuthorBySlug(slug);
  res.status(200).json({
    success: true,
    data: { user: user.toJSON() },
  });
});

export const listAuthorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as PaginationQuery;
  const result = await listAuthors(query);
  res.status(200).json({
    success: true,
    data: {
      items: result.items.map((u) => u.toJSON()),
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});

export const listEditorsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as PaginationQuery;
  const result = await listEditors(query);
  res.status(200).json({
    success: true,
    data: {
      items: result.items.map((u) => u.toJSON()),
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});

export const createEditorHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const body = req.body as CreateEditorBody;
  const user = await createEditor(req.user.id, body);
  res.status(201).json({
    success: true,
    data: { user: user.toJSON() },
  });
});

export const removeEditorHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const { id } = req.params as { id: string };
  await removeEditor(req.user.id, id);
  res.status(204).send();
});

export const updateUserRoleHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const { id } = req.params as { id: string };
  const body = req.body as UpdateRoleBody;
  const user = await updateUserRole(req.user.id, id, body.role);
  res.status(200).json({
    success: true,
    data: { user: user.toJSON() },
  });
});
