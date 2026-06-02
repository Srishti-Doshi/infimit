/**
 * E-paper controllers — HTTP layer.
 *
 * Public endpoints (list / get / download) require no auth. Admin-only
 * endpoints (create / delete) gate behind `requireRole('admin')` at the
 * route layer; the service double-checks via `actorRole` as defence in depth.
 */
import { type Request, type Response } from 'express';

import { ApiError } from '@/shared/errors';
import { asyncHandler } from '@/shared/utils/asyncHandler';

import { createEpaper, deleteEpaper, getDownloadUrl, getEpaperById, listEpapers } from './service';
import type { CreateEpaperBody, ListEpapersQuery } from './validator';

export const createEpaperHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const body = req.body as CreateEpaperBody;
  const epaper = await createEpaper({
    actorId: req.user.id,
    actorRole: req.user.role,
    title: body.title,
    issueDate: body.issueDate,
    pdfMediaId: body.pdfMediaId,
    coverMediaId: body.coverMediaId,
    pageCount: body.pageCount,
  });
  res.status(201).json({ success: true, data: { epaper: epaper.toJSON() } });
});

export const listEpapersHandler = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query as ListEpapersQuery;
  const result = await listEpapers(query);
  res.status(200).json({
    success: true,
    data: {
      items: result.items.map((e) => e.toJSON()),
      total: result.total,
      page: result.page,
      limit: result.limit,
    },
  });
});

export const getEpaperHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const epaper = await getEpaperById(id);
  res.status(200).json({ success: true, data: { epaper: epaper.toJSON() } });
});

/**
 * Download endpoint. Returns a 302 to the presigned S3 GET URL — never
 * proxies the PDF bytes through Express (avoids hogging the event loop +
 * bandwidth on large issues).
 *
 * The FE follows the redirect automatically; the browser's Save dialog
 * picks up the filename from S3's Content-Disposition (set by the presigned
 * URL params — Phase 1 doesn't override; the bucket policy decides).
 */
export const downloadEpaperHandler = asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params as { id: string };
  const { url } = await getDownloadUrl(id);
  res.redirect(302, url);
});

export const deleteEpaperHandler = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) throw ApiError.unauthorized();
  const { id } = req.params as { id: string };
  await deleteEpaper({
    epaperId: id,
    actorId: req.user.id,
    actorRole: req.user.role,
  });
  res.status(204).send();
});
