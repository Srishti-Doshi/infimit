import { useState } from 'react';

import {
  checkMediaCap,
  registerMedia,
  requestUploadUrl,
  uploadToS3,
  type CapViolation,
} from './media-api';
import type { ApiError } from '@/types/api';
import type { Media, MediaPurpose } from '@/types/media';

export type MediaUploadStatus =
  | 'idle'
  | 'preparing' // POST /media/upload-url
  | 'uploading' // PUT to S3
  | 'registering' // POST /media/register
  | 'done'
  | 'error';

interface UseMediaUploadResult {
  /** Run the three-step flow. Resolves with the registered media (or null on failure). */
  upload: (file: File) => Promise<Media | null>;
  /** 0..1 — only meaningful during `status === 'uploading'`. */
  progress: number;
  status: MediaUploadStatus;
  /** Last failure message (cap violation, network error, server rejection). */
  error: string | null;
  /** Clear status/error/progress without cancelling an in-flight upload. */
  reset: () => void;
}

/**
 * `useMediaUpload` — orchestrates the three-step S3 presign flow.
 *
 *   1. `requestUploadUrl(purpose, mime, size)` → backend returns presigned PUT.
 *   2. `uploadToS3(uploadUrl, file)` → bytes go directly to S3 (no Bearer).
 *   3. `registerMedia({ key, ... })` → backend creates the Media doc and
 *      returns it with `id` + `url`.
 *
 * Client-side cap pre-flight (`checkMediaCap`) runs first so we surface the
 * "wrong MIME / too large" error before bothering the server. The server
 * still re-validates at both upload-url and register — this is for UX.
 */
export function useMediaUpload(purpose: MediaPurpose): UseMediaUploadResult {
  const [status, setStatus] = useState<MediaUploadStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  function reset(): void {
    setStatus('idle');
    setProgress(0);
    setError(null);
  }

  async function upload(file: File): Promise<Media | null> {
    reset();

    const violation = checkMediaCap(purpose, file.type, file.size);
    if (violation) {
      setError(formatViolation(violation));
      setStatus('error');
      return null;
    }

    try {
      setStatus('preparing');
      const intent = await requestUploadUrl({
        mimeType: file.type,
        size: file.size,
        purpose,
      });

      setStatus('uploading');
      await uploadToS3(intent.uploadUrl, file, {
        onProgress: setProgress,
      });

      setStatus('registering');
      const media = await registerMedia({
        key: intent.key,
        mimeType: file.type,
        size: file.size,
        purpose,
      });

      setStatus('done');
      setProgress(1);
      return media;
    } catch (err) {
      const message =
        (err as ApiError['error'] | undefined)?.message ??
        (err instanceof Error ? err.message : 'Upload failed');
      setError(message);
      setStatus('error');
      return null;
    }
  }

  return { upload, progress, status, error, reset };
}

/** Human-readable cap violation message. */
function formatViolation(v: CapViolation): string {
  if (v.reason === 'mime') {
    const allowed = (v.limit as readonly string[]).join(', ');
    return `${v.value} isn’t a supported file type. Allowed: ${allowed}.`;
  }
  const mb = (v.limit as number) / (1024 * 1024);
  return `File is too large. Maximum is ${mb} MB for this purpose.`;
}
