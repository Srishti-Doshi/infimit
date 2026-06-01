import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MediaUploader } from '@/components/media-uploader';

/**
 * Validates the three-step S3 flow against MSW:
 *   1. POST /media/upload-url returns a presigned URL on localhost:9000.
 *   2. PUT to that URL succeeds (MSW S3 stub).
 *   3. POST /media/register returns the Media doc; the component fires
 *      onComplete with it.
 *
 * Also covers the client-side cap pre-flight: an oversize / wrong-MIME file
 * should never reach the server.
 */

function pickFile(file: File): void {
  // The visible "Click to choose" label is the picker; the hidden <input>
  // carries the file. Find by label-style match on the prompt.
  const input = screen.getByLabelText(/click to choose/i, {
    selector: 'input',
  }) as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('<MediaUploader>', () => {
  it('runs the three-step flow and calls onComplete with the registered Media', async () => {
    const onComplete = vi.fn();
    render(<MediaUploader purpose="article_cover" onComplete={onComplete} />);

    const file = new File([new Uint8Array(1024)], 'cover.png', { type: 'image/png' });
    pickFile(file);

    await waitFor(
      () => {
        expect(onComplete).toHaveBeenCalledTimes(1);
      },
      { timeout: 4000 },
    );

    const media = onComplete.mock.calls[0]![0];
    expect(media).toMatchObject({
      mimeType: 'image/png',
      size: 1024,
      purpose: 'article_cover',
    });
    expect(media.id).toMatch(/^med_/);
    expect(media.url).toMatch(/uploads\/article_cover\//);
  });

  it('rejects an oversize file client-side before any network call', async () => {
    const onComplete = vi.fn();
    render(<MediaUploader purpose="author_avatar" onComplete={onComplete} />);

    // author_avatar caps at 2 MB; we hand it a 3 MB file.
    const tooBig = new File([new Uint8Array(3 * 1024 * 1024)], 'huge.png', {
      type: 'image/png',
    });
    pickFile(tooBig);

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('rejects an unsupported MIME type client-side', async () => {
    const onComplete = vi.fn();
    render(<MediaUploader purpose="article_cover" onComplete={onComplete} />);

    // article_cover allows jpeg / png / webp — SVG must bounce.
    const svg = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    pickFile(svg);

    expect(await screen.findByRole('alert')).toHaveTextContent(/supported file type/i);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
