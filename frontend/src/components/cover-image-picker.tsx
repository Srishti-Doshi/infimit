import { RefreshCw, X } from 'lucide-react';
import { useState } from 'react';

import { MediaUploader } from '@/components/media-uploader';
import { Button } from '@/components/ui';

/**
 * Lighter-than-Media shape we accept for `value` so consumers can hydrate the
 * preview from an article's pre-loaded `coverImageMediaId` + `coverImageUrl`
 * without fetching the full Media doc back from `/v1/media/:id`.
 */
export interface CoverImageRef {
  id: string;
  url: string;
}

interface CoverImagePickerProps {
  value: CoverImageRef | null;
  onChange: (next: CoverImageRef | null) => void;
  label?: string;
}

/**
 * `<CoverImagePicker>` — pre-binds `<MediaUploader>` to `purpose='article_cover'`
 * and swaps the compact file-row preview for an editorial 16:9 frame once a
 * cover is set.
 *
 * `value` is intentionally a lightweight `{ id, url }` so an edit-draft page
 * can mount with the article's existing cover without an extra GET /media/:id.
 *
 * Replace is atomic (#34): clicking it switches the component into an internal
 * "replacing" mode that shows the uploader, but does NOT fire `onChange(null)`.
 * The parent's value is only changed once — when the new upload completes —
 * so the consumer's autosave debounce cannot fire with `coverImageMediaId:
 * null` in the gap between Replace click and new file completion. Remove is
 * still an explicit `onChange(null)` since the user intent there is "leave
 * the field empty".
 */
/**
 * Persistent recommendation shown under the label in every state so authors
 * with an existing cover still see the dimension guidance when deciding
 * whether to Replace. Mirrors the longer `COVER_RECOMMENDATION_FULL` that
 * the upload-paths pass to `<MediaUploader helperText>`.
 */
const COVER_RECOMMENDATION_SHORT =
  'Landscape 16:9, ideally 1600×900 px · JPG/WebP/PNG · under 500 KB';

const COVER_RECOMMENDATION_FULL =
  'Landscape 16:9, ideally 1600×900 px. JPG or WebP for photos, PNG for diagrams. Under 500 KB. Portrait or square covers will letterbox on the home feed.';

function LabelWithHint({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-body-sm font-medium text-ink-primary">{label}</p>
      <p className="text-body-xs text-ink-tertiary">{COVER_RECOMMENDATION_SHORT}</p>
    </div>
  );
}

export function CoverImagePicker({
  value,
  onChange,
  label = 'Cover image',
}: CoverImagePickerProps): JSX.Element {
  const [replacing, setReplacing] = useState(false);

  // ─── Replace mode ─────────────────────────────────────────────────────
  // Uploader is mounted but the parent's `value` is untouched until the
  // new upload completes. Cancel reverts to the existing preview without
  // ever firing `onChange`.
  if (replacing) {
    return (
      <div className="flex flex-col gap-2">
        <LabelWithHint label={label} />
        <MediaUploader
          purpose="article_cover"
          helperText={COVER_RECOMMENDATION_FULL}
          onComplete={(media) => {
            onChange({ id: media.id, url: media.url });
            setReplacing(false);
          }}
        />
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={() => setReplacing(false)}>
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex flex-col gap-2">
        <LabelWithHint label={label} />
        <div className="relative overflow-hidden rounded-lg border border-line bg-surface-subtle">
          <div className="aspect-video w-full">
            <img src={value.url} alt="Cover preview" className="h-full w-full object-cover" />
          </div>
          <div className="flex items-center justify-end gap-2 border-t border-line px-3 py-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              iconLeft={<RefreshCw className="h-4 w-4" aria-hidden="true" />}
              onClick={() => setReplacing(true)}
            >
              Replace
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              iconLeft={<X className="h-4 w-4" aria-hidden="true" />}
              onClick={() => onChange(null)}
            >
              Remove
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MediaUploader
      purpose="article_cover"
      label={label}
      helperText={COVER_RECOMMENDATION_FULL}
      onComplete={(media) => onChange({ id: media.id, url: media.url })}
    />
  );
}
