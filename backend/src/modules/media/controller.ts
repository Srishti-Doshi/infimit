/**
 * Media controllers — HTTP layer.
 *
 * All endpoints require authentication except `GET /:id` (public metadata so
 * the FE can resolve a media doc's URL without a token). Body validation is
 * centralised in routes via `validate()`; controllers receive parsed payloads.
 */
import { type Request, type Response } from 'express';

import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import { deleteMedia, getMedia, issueUploadUrl, registerUpload } from './service';
import type { RegisterBody, UploadUrlBody } from './validator';

export const uploadUrlHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const body = req.body as UploadUrlBody;
  const issued = await issueUploadUrl({
    uploadedBy: req.user.id,
    mimeType: body.mimeType,
    size: body.size,
    purpose: body.purpose,
  });
  res.status(200).json({ success: true, data: issued });
});

export const registerHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const body = req.body as RegisterBody;
  const media = await registerUpload({
    uploadedBy: req.user.id,
    key: body.key,
    mimeType: body.mimeType,
    size: body.size,
    dimensions: body.dimensions,
  });
  res.status(201).json({ success: true, data: { media: media.toJSON() } });
});

export const getMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const media = await getMedia(id);
  res.status(200).json({ success: true, data: { media: media.toJSON() } });
});

export const deleteMediaHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  await deleteMedia({ id, actorId: req.user.id, actorRole: req.user.role });
  res.status(204).send();
});
