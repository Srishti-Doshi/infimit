import axios from 'axios';

import { apiClient } from './api-client';
import type { ApiSuccess } from '@/types/api';
import type { Media, MediaDimensions, MediaPurpose, MediaUploadIntent } from '@/types/media';

/**
 * Media resource client (Subphase 3 surface — presigned three-step upload).
 *
 * Flow:
 *   1. `requestUploadUrl({ mimeType, size, purpose })` → backend returns
 *      `{ uploadUrl, key, expiresIn }` (a presigned PUT).
 *   2. `uploadToS3(uploadUrl, file, onProgress?)` puts the bytes directly to
 *      S3. NO Authorization header — the signature carries the auth.
 *   3. `registerMedia({ key, mimeType, size, purpose, dimensions? })` →
 *      backend creates the Media doc and returns `{ media: { id, url, ... } }`.
 *
 * The intent → upload → register split keeps binaries off our app server and
 * lets the FE show progress + abort without round-tripping through us.
 */

// ─── Caps (mirrored from backend/src/modules/media/caps.ts) ───────────────

const MB = 1024 * 1024;

export interface MediaCap {
  readonly maxBytes: number;
  readonly allowedMime: readonly string[];
}

/**
 * Per-purpose upload caps. Mirrored from the backend so the client can refuse
 * a too-large or wrong-MIME file before issuing a presign request. Server
 * still re-validates at both upload-url and register — this is for UX, not
 * security.
 *
 * Keep in sync with `backend/src/modules/media/caps.ts`.
 */
export const MEDIA_CAPS: Readonly<Record<MediaPurpose, MediaCap>> = {
  article_cover: { maxBytes: 10 * MB, allowedMime: ['image/jpeg', 'image/png', 'image/webp'] },
  article_embed: { maxBytes: 10 * MB, allowedMime: ['image/jpeg', 'image/png', 'image/webp'] },
  author_avatar: { maxBytes: 2 * MB, allowedMime: ['image/jpeg', 'image/png', 'image/webp'] },
  org_logo: {
    maxBytes: 2 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
  epaper_pdf: { maxBytes: 50 * MB, allowedMime: ['application/pdf'] },
  epaper_cover: { maxBytes: 10 * MB, allowedMime: ['image/jpeg', 'image/png'] },
  ad_creative: { maxBytes: 10 * MB, allowedMime: ['image/jpeg', 'image/png', 'image/webp'] },
  tts_audio: { maxBytes: 20 * MB, allowedMime: ['audio/mpeg', 'audio/mp4'] },
};

export interface CapViolation {
  reason: 'mime' | 'size';
  purpose: MediaPurpose;
  value: string | number;
  limit: readonly string[] | number;
}

/**
 * Pre-flight cap check. Returns `null` when `(mime, size)` fits the purpose;
 * otherwise a structured violation the caller can render directly.
 */
export function checkMediaCap(
  purpose: MediaPurpose,
  mimeType: string,
  size: number,
): CapViolation | null {
  const cap = MEDIA_CAPS[purpose];
  if (!cap.allowedMime.includes(mimeType)) {
    return { reason: 'mime', purpose, value: mimeType, limit: cap.allowedMime };
  }
  if (size > cap.maxBytes) {
    return { reason: 'size', purpose, value: size, limit: cap.maxBytes };
  }
  return null;
}

// ─── API ──────────────────────────────────────────────────────────────────

interface UploadUrlBody {
  mimeType: string;
  size: number;
  purpose: MediaPurpose;
}

interface RegisterBody {
  key: string;
  mimeType: string;
  size: number;
  purpose: MediaPurpose;
  dimensions?: MediaDimensions;
}

/** `POST /v1/media/upload-url` — step 1: presign. */
export async function requestUploadUrl(body: UploadUrlBody): Promise<MediaUploadIntent> {
  const res = await apiClient.post<ApiSuccess<MediaUploadIntent>>('/media/upload-url', body);
  return res.data.data;
}

/**
 * Step 2: PUT bytes directly to S3.
 *
 * Uses a bare axios (NOT `apiClient`) so the request:
 *   - doesn't get an Authorization header (the presigned URL is the auth),
 *   - doesn't go through our refresh interceptor,
 *   - doesn't get the `X-Requested-With` header (would invalidate the signature).
 *
 * `onProgress` receives a 0..1 ratio.
 */
export async function uploadToS3(
  uploadUrl: string,
  file: Blob,
  options: { onProgress?: (progress: number) => void; signal?: AbortSignal } = {},
): Promise<void> {
  await axios.put(uploadUrl, file, {
    headers: { 'Content-Type': file.type },
    signal: options.signal,
    onUploadProgress: (e) => {
      if (!options.onProgress) return;
      if (!e.total) return;
      options.onProgress(e.loaded / e.total);
    },
  });
}

/** `POST /v1/media/register` — step 3: confirm upload, create Media doc. */
export async function registerMedia(body: RegisterBody): Promise<Media> {
  const res = await apiClient.post<ApiSuccess<{ media: Media }>>('/media/register', body);
  return res.data.data.media;
}

/** `GET /v1/media/:id` — fetch metadata. */
export async function getMedia(id: string): Promise<Media> {
  const res = await apiClient.get<ApiSuccess<{ media: Media }>>(`/media/${id}`);
  return res.data.data.media;
}

/** `DELETE /v1/media/:id` — uploader / editor / admin. */
export async function deleteMedia(id: string): Promise<void> {
  await apiClient.delete(`/media/${id}`);
}
