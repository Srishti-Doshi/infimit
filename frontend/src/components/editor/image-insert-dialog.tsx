import { useState } from 'react';

import { MediaUploader } from '@/components/media-uploader';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalDescription,
  ModalFooter,
  ModalHeader,
  ModalTitle,
} from '@/components/ui';
import type { Media } from '@/types/media';

interface ImageInsertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called with the resolved S3 URL + alt text once the user confirms. */
  onInsert: (params: { src: string; alt: string }) => void;
}

/**
 * Dialog for inserting an image into the Tiptap body. Wraps `<MediaUploader>`
 * pre-bound to `purpose="article_embed"` and pairs it with an alt-text input.
 *
 * Day 3 used a `window.prompt` shim; this is the real flow. The alt input only
 * appears after the upload resolves so the user can describe the actual image,
 * not the URL. Insert is disabled until a Media doc exists.
 */
export function ImageInsertDialog({
  open,
  onOpenChange,
  onInsert,
}: ImageInsertDialogProps): JSX.Element {
  const [media, setMedia] = useState<Media | null>(null);
  const [alt, setAlt] = useState('');

  function reset(): void {
    setMedia(null);
    setAlt('');
  }

  function close(next: boolean): void {
    if (!next) reset();
    onOpenChange(next);
  }

  function handleInsert(): void {
    if (!media) return;
    onInsert({ src: media.url, alt: alt.trim() });
    reset();
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={close} size="md">
      <ModalHeader>
        <ModalTitle>Insert image</ModalTitle>
        <ModalDescription>
          Upload an image and add alt text so screen readers can describe it.
        </ModalDescription>
      </ModalHeader>
      <ModalBody className="flex flex-col gap-5">
        <MediaUploader
          purpose="article_embed"
          value={media}
          onComplete={setMedia}
          onRemove={() => setMedia(null)}
        />
        {media ? (
          <Input
            label="Alt text"
            placeholder="Describe what's in the image"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            helperText="Leave blank only if the image is purely decorative."
            maxLength={250}
          />
        ) : null}
      </ModalBody>
      <ModalFooter>
        <Button type="button" variant="ghost" onClick={() => close(false)}>
          Cancel
        </Button>
        <Button type="button" variant="primary" disabled={!media} onClick={handleInsert}>
          Insert image
        </Button>
      </ModalFooter>
    </Modal>
  );
}
