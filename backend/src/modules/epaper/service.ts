/**
 * Epaper service — business logic for the e-paper module.
 *
 * Surface:
 *   - createEpaper       — admin uploads a new issue (links existing media docs).
 *   - listEpapers        — public paginated archive read.
 *   - getEpaperById      — public single read; bumps `stats.views` async.
 *   - getDownloadUrl     — public; resolves to a presigned S3 GET URL with
 *                          short TTL; bumps `stats.downloads` async.
 *   - deleteEpaper       — admin removes an issue from the archive.
 *
 * Media refCount accounting: e-paper PDFs and covers are reusable across
 * Phase 2 features (newsletter attachments, archive pages), so the service
 * does NOT decrement media refCounts on epaper delete in Phase 1 — the
 * `mediaRepo.adjustRefCount(-1)` call would be safe but a future use-case
 * may want to keep the media around. Revisit when Phase 2 adds newsletters.
 */
import { Types } from 'mongoose';

import { auditLog } from '@/shared/audit';
import { ApiError } from '@/shared/errors';
import { presignDownload } from '@/config/s3';
import { logger } from '@/config/logger';
import { mediaRepo } from '@/modules/media';
import type { UserRole } from '@/modules/users';

import * as epaperRepo from './repository';
import type { EpaperModel } from './model';

const DOWNLOAD_URL_TTL_SEC = 300; // 5 minutes — short enough to limit hot-linking, long enough for the FE to redirect cleanly

// ─── create ─────────────────────────────────────────────────────────────

export interface CreateEpaperInput {
  actorId: string;
  actorRole: UserRole;
  title: string;
  issueDate: Date;
  pdfMediaId: string;
  coverMediaId: string;
  pageCount?: number;
}

export async function createEpaper(input: CreateEpaperInput): Promise<EpaperModel> {
  if (input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only admins can publish e-paper issues');
  }
  if (!Types.ObjectId.isValid(input.pdfMediaId) || !Types.ObjectId.isValid(input.coverMediaId)) {
    throw ApiError.validation('Invalid media id');
  }

  // Verify the referenced media docs exist + are the right MIME class. The
  // upload-url + register flow already capped MIME by purpose; we re-check
  // here as a final safety net (an admin pasting the wrong id otherwise
  // would create a broken epaper with a 404'ing PDF).
  const [pdf, cover] = await Promise.all([
    mediaRepo.findById(input.pdfMediaId),
    mediaRepo.findById(input.coverMediaId),
  ]);
  if (!pdf || pdf.purpose !== 'epaper_pdf') {
    throw ApiError.validation('pdfMediaId must reference an epaper_pdf media doc');
  }
  if (!cover || cover.purpose !== 'epaper_cover') {
    throw ApiError.validation('coverMediaId must reference an epaper_cover media doc');
  }

  const epaper = await epaperRepo.createEpaper({
    title: input.title,
    issueDate: input.issueDate,
    pdfMediaId: pdf._id,
    coverMediaId: cover._id,
    pageCount: input.pageCount,
    uploadedBy: new Types.ObjectId(input.actorId),
  });

  // Bump the media refCounts so a later media-delete refuses while the
  // epaper still references them.
  await Promise.all([
    mediaRepo.adjustRefCount(pdf._id, +1),
    mediaRepo.adjustRefCount(cover._id, +1),
  ]);

  auditLog(
    {
      entity: 'media',
      entityId: epaper._id.toString(),
      action: 'epaper_created',
      actor: input.actorId,
      details: {
        title: input.title,
        issueDate: input.issueDate.toISOString(),
        pdfMediaId: pdf._id.toString(),
        coverMediaId: cover._id.toString(),
      },
    },
    'epaper_created',
  );

  return epaper;
}

// ─── list (public) ──────────────────────────────────────────────────────

export interface ListEpapersInput {
  page?: number;
  limit?: number;
  from?: Date;
  to?: Date;
}

export async function listEpapers(input: ListEpapersInput = {}): Promise<{
  items: EpaperModel[];
  total: number;
  page: number;
  limit: number;
}> {
  const { items, total } = await epaperRepo.list(input);
  return {
    items,
    total,
    page: input.page ?? 1,
    limit: input.limit ?? 20,
  };
}

// ─── get by id (public) ─────────────────────────────────────────────────

export async function getEpaperById(id: string): Promise<EpaperModel> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Epaper not found');
  }
  const epaper = await epaperRepo.findById(id);
  if (!epaper) {
    throw ApiError.notFound('Epaper not found');
  }
  // Bump view counter asynchronously — never block the response on it.
  void epaperRepo.incrementStat(epaper._id, 'views').catch((err: unknown) => {
    logger.warn({ err, epaperId: epaper._id.toString() }, 'epaper_views_increment_failed');
  });
  return epaper;
}

// ─── download (public, presigned GET redirect) ──────────────────────────

export interface DownloadResult {
  /** Presigned S3 GET URL the controller 302s to. */
  url: string;
  /** Echoed for FE display + cache busting. */
  filename: string;
}

export async function getDownloadUrl(id: string): Promise<DownloadResult> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Epaper not found');
  }
  const epaper = await epaperRepo.findById(id);
  if (!epaper) {
    throw ApiError.notFound('Epaper not found');
  }
  const pdf = await mediaRepo.findById(epaper.pdfMediaId);
  if (!pdf) {
    // The PDF media doc was deleted but the epaper wasn't — orphan state.
    // Surface as 404; an admin can re-upload + re-link in a fix-it flow.
    throw ApiError.notFound('Epaper PDF unavailable');
  }

  const url = await presignDownload(pdf.key, DOWNLOAD_URL_TTL_SEC);
  // Bump download counter async — don't block the redirect on it.
  void epaperRepo.incrementStat(epaper._id, 'downloads').catch((err: unknown) => {
    logger.warn({ err, epaperId: epaper._id.toString() }, 'epaper_downloads_increment_failed');
  });

  // Derive a filename from the epaper title + issue date so the browser's
  // Save dialog shows something readable instead of the S3 key.
  const safeTitle = epaper.title.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
  const dateStamp = epaper.issueDate.toISOString().slice(0, 10);
  const filename = `${safeTitle}-${dateStamp}.pdf`;

  return { url, filename };
}

// ─── delete (admin) ─────────────────────────────────────────────────────

export interface DeleteEpaperInput {
  epaperId: string;
  actorId: string;
  actorRole: UserRole;
}

export async function deleteEpaper(input: DeleteEpaperInput): Promise<void> {
  if (input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only admins can delete e-paper issues');
  }
  if (!Types.ObjectId.isValid(input.epaperId)) {
    throw ApiError.notFound('Epaper not found');
  }

  const epaper = await epaperRepo.findById(input.epaperId);
  if (!epaper) {
    throw ApiError.notFound('Epaper not found');
  }

  const deleted = await epaperRepo.deleteById(epaper._id);
  if (!deleted) return; // concurrent delete — idempotent success

  // Decrement media refCounts so a subsequent media-delete can succeed.
  await Promise.all([
    mediaRepo.adjustRefCount(epaper.pdfMediaId, -1),
    mediaRepo.adjustRefCount(epaper.coverMediaId, -1),
  ]);

  auditLog(
    {
      entity: 'media',
      entityId: epaper._id.toString(),
      action: 'epaper_deleted',
      actor: input.actorId,
      details: {
        title: epaper.title,
        issueDate: epaper.issueDate.toISOString(),
      },
    },
    'epaper_deleted',
  );
}
