/**
 * Media domain types. Mirror the backend Media model
 * (docs/04-database-design.md §4.2.5).
 *
 * The wire flow is three-step: presign → PUT to S3 → register. The Media doc
 * is only created (and `id` issued) at register-time; before that there's just
 * an `uploadUrl` + `key` from the presign step.
 */

export type MediaPurpose =
  | 'article_cover'
  | 'article_embed'
  | 'author_avatar'
  | 'org_logo'
  | 'ad_creative'
  | 'epaper_pdf'
  | 'epaper_cover'
  | 'tts_audio';

export interface MediaDimensions {
  width: number;
  height: number;
}

export interface Media {
  id: string;
  key: string;
  url: string;
  mimeType: string;
  /** Size in bytes. */
  size: number;
  purpose: MediaPurpose;
  dimensions: MediaDimensions | null;
  uploadedBy: string;
  refCount: number;
  createdAt: string;
  updatedAt: string;
}

/** Presigned upload intent from `POST /v1/media/upload-url`. */
export interface MediaUploadIntent {
  uploadUrl: string;
  key: string;
  /** Seconds until the presigned URL expires (S3 default ≈ 300). */
  expiresIn: number;
}
