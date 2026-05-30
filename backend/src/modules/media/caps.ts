/**
 * Per-purpose upload caps (MIME allowlist + size ceiling).
 *
 * Single source of truth for both `/media/upload-url` (refuse to issue
 * presign on violation) and `/media/register` (re-validate post-upload).
 *
 * Tightening or loosening a row is a deliberate decision — log it in the
 * PR. Numbers map to the table in
 * docs/Phase_1/Subphase_3_Content_Engine/Backend_Handler_Documentation.md
 * §4 "Media constraints".
 */
import type { MediaPurpose } from './model';

const MB = 1024 * 1024;

export interface MediaCap {
  readonly maxBytes: number;
  readonly allowedMime: readonly string[];
}

export const MEDIA_CAPS: Readonly<Record<MediaPurpose, MediaCap>> = {
  article_cover: { maxBytes: 10 * MB, allowedMime: ['image/jpeg', 'image/png', 'image/webp'] },
  article_embed: { maxBytes: 10 * MB, allowedMime: ['image/jpeg', 'image/png', 'image/webp'] },
  author_avatar: { maxBytes: 2 * MB, allowedMime: ['image/jpeg', 'image/png', 'image/webp'] },
  // org_logo is the one purpose where SVG is allowed — partners ship vector logos.
  org_logo: {
    maxBytes: 2 * MB,
    allowedMime: ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'],
  },
  // epaper_pdf is the largest cap — full PDF issues from partners.
  epaper_pdf: { maxBytes: 50 * MB, allowedMime: ['application/pdf'] },
  epaper_cover: { maxBytes: 10 * MB, allowedMime: ['image/jpeg', 'image/png'] },
  // ad_creative + tts_audio aren't in the Subphase 3 doc table but exist in
  // the enum for Subphase 4+. Defensive defaults; revisit when those modules
  // ship to confirm the limits against real creative + TTS output sizes.
  ad_creative: { maxBytes: 10 * MB, allowedMime: ['image/jpeg', 'image/png', 'image/webp'] },
  tts_audio: { maxBytes: 20 * MB, allowedMime: ['audio/mpeg', 'audio/mp4'] },
};

export interface CapViolation {
  readonly reason: 'mime' | 'size';
  readonly purpose: MediaPurpose;
  readonly value: string | number;
  readonly limit: readonly string[] | number;
}

/**
 * Returns null when (mime, size) is acceptable for the purpose. Returns a
 * structured violation otherwise so the service can map to a precise 422
 * with `details: { reason, limit }` the FE can render directly.
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

/** File extension hint for the S3 object key. Pure cosmetic — the source of
 * truth on the wire is the Content-Type bound into the presigned URL. */
export function extensionFor(mimeType: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'application/pdf': 'pdf',
    'audio/mpeg': 'mp3',
    'audio/mp4': 'm4a',
  };
  return map[mimeType] ?? 'bin';
}
