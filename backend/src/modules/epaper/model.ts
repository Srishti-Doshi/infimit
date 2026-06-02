/**
 * Epaper model — docs/04-database-design.md §4.2.10.
 *
 * One document per published issue (daily edition, weekly digest, etc.).
 * The PDF + cover image are stored as separate `media` docs uploaded via
 * the `/v1/media/upload-url` flow; this collection only references them
 * by id. The download endpoint resolves the pdfMediaId to a presigned GET
 * URL at request time.
 *
 * Admins create + delete; the public list/single/download endpoints are
 * unauthenticated (epapers are public archive material).
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

export interface EpaperStats {
  downloads: number;
  views: number;
}

export interface EpaperDocument {
  title: string;
  /** Date the issue is dated for (NOT createdAt — admins may upload back-dated
   * issues; users browse by issueDate). */
  issueDate: Date;
  /** Reference to the media doc holding the PDF binary. */
  pdfMediaId: Types.ObjectId;
  /** Reference to the media doc holding the cover image. */
  coverMediaId: Types.ObjectId;
  pageCount: number;
  uploadedBy: Types.ObjectId;
  stats: EpaperStats;
  createdAt: Date;
  updatedAt: Date;
}

const StatsSchema = new Schema<EpaperStats>(
  {
    downloads: { type: Number, default: 0, min: 0 },
    views: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const EpaperSchema = new Schema<EpaperDocument>(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 255 },
    issueDate: { type: Date, required: true },
    pdfMediaId: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
    coverMediaId: { type: Schema.Types.ObjectId, ref: 'Media', required: true },
    pageCount: { type: Number, default: 0, min: 0 },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    stats: { type: StatsSchema, default: () => ({}) },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        r.id = r._id;
        delete r._id;
        return r;
      },
    },
  },
);

// Primary access pattern: archive browse, newest first.
EpaperSchema.index({ issueDate: -1 }, { name: 'issueDate_desc' });

export const Epaper = model<EpaperDocument>('Epaper', EpaperSchema);
export type EpaperModel = HydratedDocument<EpaperDocument>;
