/**
 * Organisations controllers — HTTP layer.
 *
 * Validation is centralised in routes via the `validate()` middleware; handlers
 * receive already-parsed `req.body` / `req.query` / `req.params`.
 */
import { type Request, type Response } from 'express';

import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import {
  createOrganisation,
  deleteOrganisation,
  getOrganisationById,
  getOrganisationBySlug,
  listOrganisations,
  updateOrganisation,
} from './service';
import type {
  CreateOrganisationBody,
  ListOrganisationsQuery,
  UpdateOrganisationBody,
} from './validator';

export const listOrganisationsHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as ListOrganisationsQuery;
  const result = await listOrganisations(query);
  res.status(200).json({
    success: true,
    data: {
      items: result.items.map((o) => o.toJSON()),
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});

export const getOrganisationByIdHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const org = await getOrganisationById(id);
  res.status(200).json({
    success: true,
    data: { organisation: org.toJSON() },
  });
});

export const getOrganisationBySlugHandler = asyncHandler(async (req: Request, res: Response) => {
  const { slug } = req.params as { slug: string };
  const org = await getOrganisationBySlug(slug);
  res.status(200).json({
    success: true,
    data: { organisation: org.toJSON() },
  });
});

export const createOrganisationHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const body = req.body as CreateOrganisationBody;
  const org = await createOrganisation(req.user.id, body);
  res.status(201).json({
    success: true,
    data: { organisation: org.toJSON() },
  });
});

export const updateOrganisationHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const { id } = req.params as { id: string };
  const body = req.body as UpdateOrganisationBody;
  const org = await updateOrganisation(req.user.id, id, body);
  res.status(200).json({
    success: true,
    data: { organisation: org.toJSON() },
  });
});

export const deleteOrganisationHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) {
    throw ApiError.unauthorized();
  }
  const { id } = req.params as { id: string };
  await deleteOrganisation(req.user.id, id);
  res.status(204).send();
});
