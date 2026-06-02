import { RefreshCw, X } from 'lucide-react';

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
 * cover is set. Replace = clear value (re-opens the picker); Remove = same
 * but the consumer typically reacts to `null` differently (e.g. marks the
 * field as required again).
 *
 * `value` is intentionally a lightweight `{ id, url }` so an edit-draft page
 * can mount with the article's existing cover without an extra GET /media/:id.
 */
export function CoverImagePicker({
  value,
  onChange,
  label = 'Cover image',
}: CoverImagePickerProps): JSX.Element {
  if (value) {
    return (
      <div className="flex flex-col gap-2">
        <p className="text-body-sm font-medium text-ink-primary">{label}</p>
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
              onClick={() => onChange(null)}
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
      helperText="JPG, PNG, or WebP. 16:9 looks best on article pages."
      onComplete={(media) => onChange({ id: media.id, url: media.url })}
    />
  );
}
