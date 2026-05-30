/**
 * Media model — docs/04-database-design.md §4.2.5.
 *
 * Metadata for binary assets uploaded to S3 (article covers, embeds, avatars,
 * org logos, e-paper PDFs, ad creatives, TTS audio). The binary itself lives
 * in S3; this collection tracks who uploaded what, with what dimensions, for
 * what purpose, and how many things reference it (`refCount`).
 *
 * `key` is the S3 object key; `url` is the CDN-fronted GET URL. Both are set
 * at register-time after the client uploads to a presigned URL.
 *
 * Purposes carry per-purpose MIME + size caps — those constraints live in the
 * validator, not the schema, so the docs and the wire stay aligned.
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

export type MediaPurpose =
  | 'article_cover'
  | 'article_embed'
  | 'author_avatar'
  | 'org_logo'
  | 'ad_creative'
  | 'epaper_pdf'
  | 'epaper_cover'
  | 'tts_audio';

export const MEDIA_PURPOSES: readonly MediaPurpose[] = [
  'article_cover',
  'article_embed',
  'author_avatar',
  'org_logo',
  'ad_creative',
  'epaper_pdf',
  'epaper_cover',
  'tts_audio',
];

export interface MediaDimensions {
  width: number;
  height: number;
}

export interface MediaDocument {
  /** S3 object key (e.g. `uploads/<uuid>.jpg`). Unique across the bucket. */
  key: string;
  /** CDN-fronted GET URL. */
  url: string;
  mimeType: string;
  /** Size in bytes; verified against per-purpose cap at register-time. */
  size: number;
  purpose: MediaPurpose;
  dimensions: MediaDimensions | null;
  uploadedBy: Types.ObjectId;
  /**
   * How many articles / users / orgs / ads currently reference this media.
   * Bumped on register, decremented on delete; future GC sweeps refCount=0 rows.
   */
  refCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const DimensionsSchema = new Schema<MediaDimensions>(
  {
    width: { type: Number, required: true, min: 0 },
    height: { type: Number, required: true, min: 0 },
  },
  { _id: false },
);

const MediaSchema = new Schema<MediaDocument>(
  {
    key: { type: String, required: true, trim: true },
    url: { type: String, required: true, trim: true },
    mimeType: { type: String, required: true, lowercase: true, trim: true },
    size: { type: Number, required: true, min: 0 },
    purpose: { type: String, enum: MEDIA_PURPOSES, required: true },
    dimensions: { type: DimensionsSchema, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    refCount: { type: Number, default: 0, min: 0 },
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

// Indexes per docs/04-database-design.md §4.2.5.
MediaSchema.index({ key: 1 }, { unique: true, name: 'key_unique' });
MediaSchema.index({ uploadedBy: 1 }, { name: 'uploadedBy' });
MediaSchema.index({ purpose: 1 }, { name: 'purpose' });

export const Media = model<MediaDocument>('Media', MediaSchema);
export type MediaModel = HydratedDocument<MediaDocument>;
