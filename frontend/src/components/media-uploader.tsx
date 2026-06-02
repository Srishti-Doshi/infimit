import { CheckCircle2, ImagePlus, Loader2, X } from 'lucide-react';
import { useId, useRef, useState, type ChangeEvent } from 'react';

import { Button } from '@/components/ui';
import { cn } from '@/lib/cn';
import { MEDIA_CAPS } from '@/lib/media-api';
import { useMediaUpload, type MediaUploadStatus } from '@/lib/use-media-upload';
import type { Media, MediaPurpose } from '@/types/media';

interface MediaUploaderProps {
  /** Per-purpose caps + MIME allowlist come from MEDIA_CAPS[purpose]. */
  purpose: MediaPurpose;
  /** Fired once the three-step flow resolves with a registered Media doc. */
  onComplete: (media: Media) => void;
  /** Optional clear callback. If supplied, the "Remove" button appears once `value` is set. */
  onRemove?: () => void;
  /** When set, the uploader renders in "selected" mode showing the preview. */
  value?: Media | null;
  /** Top label rendered above the picker. */
  label?: string;
  /** Override the default helper line (size + types). */
  helperText?: string;
}

/**
 * `<MediaUploader>` — single-file picker for the three-step S3 flow.
 *
 * Auto-starts the upload on file selection (no separate "Upload" button —
 * picking is the commitment). Shows status + progress while in flight; once
 * registered, it surfaces a preview + a Remove affordance so the consumer can
 * swap the file out.
 *
 * Day 8 will wrap this in a higher-level `<CoverImagePicker>` that pre-binds
 * `purpose="article_cover"` and integrates with the draft form.
 */
export function MediaUploader({
  purpose,
  onComplete,
  onRemove,
  value,
  label,
  helperText,
}: MediaUploaderProps): JSX.Element {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { upload, progress, status, error } = useMediaUpload(purpose);

  const cap = MEDIA_CAPS[purpose];
  const acceptList = cap.allowedMime.join(',');
  const maxMb = Math.round(cap.maxBytes / (1024 * 1024));
  const busy = status === 'preparing' || status === 'uploading' || status === 'registering';

  function isImage(mime: string): boolean {
    return mime.startsWith('image/');
  }

  async function handleFile(e: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;
    // Reset the input so re-selecting the same file still fires `change`.
    e.target.value = '';

    // Local preview while the upload runs (revoked on completion + unmount).
    const localUrl = isImage(file.type) ? URL.createObjectURL(file) : null;
    setPreviewUrl(localUrl);

    const media = await upload(file);
    if (localUrl) URL.revokeObjectURL(localUrl);
    setPreviewUrl(null);
    if (media) onComplete(media);
  }

  // ─── Selected state ───────────────────────────────────────────────────
  if (value) {
    return (
      <div className="flex flex-col gap-2">
        {label ? <p className="text-body-sm font-medium text-ink-primary">{label}</p> : null}
        <div className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
          {isImage(value.mimeType) ? (
            <img src={value.url} alt="" className="h-16 w-16 rounded-md object-cover" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-md bg-surface-subtle text-ink-tertiary">
              <ImagePlus className="h-6 w-6" aria-hidden="true" />
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="truncate text-body-sm font-medium text-ink-primary">
              {value.key.split('/').pop() ?? value.id}
            </p>
            <p className="text-body-xs text-ink-tertiary">
              {value.mimeType} · {(value.size / 1024).toFixed(0)} KB
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => inputRef.current?.click()}
            >
              Replace
            </Button>
            {onRemove ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                iconLeft={<X className="h-4 w-4" aria-hidden="true" />}
                onClick={onRemove}
              >
                Remove
              </Button>
            ) : null}
          </div>
        </div>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={acceptList}
          onChange={handleFile}
          className="sr-only"
        />
      </div>
    );
  }

  // ─── Empty / in-flight state ──────────────────────────────────────────
  return (
    <div className="flex flex-col gap-2">
      {label ? (
        <label htmlFor={inputId} className="text-body-sm font-medium text-ink-primary">
          {label}
        </label>
      ) : null}
      <label
        htmlFor={inputId}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-line bg-surface px-4 py-8 text-center cursor-pointer transition-colors',
          'hover:border-line-strong hover:bg-surface-subtle',
          busy && 'cursor-not-allowed opacity-70',
          status === 'error' && 'border-status-error-text/40',
        )}
      >
        {previewUrl && busy ? (
          <img src={previewUrl} alt="" className="mb-2 h-24 w-24 rounded-md object-cover" />
        ) : (
          <ImagePlus className="h-8 w-8 text-ink-tertiary" aria-hidden="true" />
        )}
        <StatusLine status={status} progress={progress} />
        {!busy ? (
          <p className="text-body-xs text-ink-tertiary">
            {helperText ?? `${cap.allowedMime.map(mimeToShort).join(', ')} · up to ${maxMb} MB`}
          </p>
        ) : null}
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept={acceptList}
          onChange={handleFile}
          disabled={busy}
          className="sr-only"
        />
      </label>
      {error ? (
        <p role="alert" className="text-body-xs text-status-error-text">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────

function StatusLine({
  status,
  progress,
}: {
  status: MediaUploadStatus;
  progress: number;
}): JSX.Element {
  if (status === 'idle') {
    return (
      <p className="text-body-sm font-medium text-ink-primary">
        Click to choose a file (or drop it here)
      </p>
    );
  }
  if (status === 'preparing') {
    return (
      <p className="inline-flex items-center gap-1.5 text-body-sm text-ink-secondary">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Preparing upload…
      </p>
    );
  }
  if (status === 'uploading') {
    return (
      <div className="w-full max-w-xs">
        <p className="text-body-sm text-ink-secondary">Uploading… {Math.round(progress * 100)}%</p>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-line">
          <div
            className="h-full rounded-full bg-brand-red-500 transition-all"
            style={{ width: `${Math.max(2, Math.round(progress * 100))}%` }}
          />
        </div>
      </div>
    );
  }
  if (status === 'registering') {
    return (
      <p className="inline-flex items-center gap-1.5 text-body-sm text-ink-secondary">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Finishing up…
      </p>
    );
  }
  if (status === 'done') {
    return (
      <p className="inline-flex items-center gap-1.5 text-body-sm text-status-success-text">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        Uploaded
      </p>
    );
  }
  // 'error' — error message renders below; this line stays as the prompt.
  return <p className="text-body-sm font-medium text-ink-primary">Try a different file</p>;
}

function mimeToShort(mime: string): string {
  return mime.split('/').pop()?.toUpperCase() ?? mime;
}
