/**
 * E-paper domain types. Mirror the backend model
 * (`backend/src/modules/epaper/model.ts`).
 *
 * One document per published issue. The PDF + cover are stored as separate
 * `media` docs uploaded via the three-step S3 flow; this collection only
 * references them by id. The download endpoint resolves `pdfMediaId` to a
 * presigned GET URL at request time and 302-redirects.
 */

export interface EpaperStats {
  downloads: number;
  views: number;
}

export interface Epaper {
  id: string;
  title: string;
  /** Date the issue is dated for. Not `createdAt` — admins may back-date. */
  issueDate: string;
  pdfMediaId: string;
  coverMediaId: string;
  /** Resolved CDN URL of the cover image. Useful for the archive grid. */
  coverImageUrl?: string | null;
  pageCount: number;
  uploadedBy: string;
  stats: EpaperStats;
  createdAt: string;
  updatedAt: string;
}
