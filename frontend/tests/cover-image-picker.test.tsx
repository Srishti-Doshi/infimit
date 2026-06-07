import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CoverImagePicker, type CoverImageRef } from '@/components/cover-image-picker';

/**
 * `<CoverImagePicker>` only swaps presentations around `<MediaUploader>` —
 * the upload mechanics are tested in `tests/media-uploader.test.tsx`. Here we
 * just verify the two-mode rendering + the value/onChange contract.
 */

function ControlledPicker({
  initial = null,
  onSpy,
}: {
  initial?: CoverImageRef | null;
  onSpy?: (next: CoverImageRef | null) => void;
}): JSX.Element {
  const [value, setValue] = useState<CoverImageRef | null>(initial);
  return (
    <CoverImagePicker
      value={value}
      onChange={(next) => {
        setValue(next);
        onSpy?.(next);
      }}
    />
  );
}

describe('<CoverImagePicker>', () => {
  it('shows the upload picker when no cover is set', () => {
    render(<ControlledPicker />);
    expect(screen.getByText(/click to choose/i)).toBeInTheDocument();
    // No editorial preview yet.
    expect(screen.queryByRole('img', { name: /cover preview/i })).not.toBeInTheDocument();
  });

  it('renders an editorial preview when a cover is set', () => {
    render(<ControlledPicker initial={{ id: 'med_abc', url: 'http://example.com/cover.jpg' }} />);
    expect(screen.getByRole('img', { name: /cover preview/i })).toHaveAttribute(
      'src',
      'http://example.com/cover.jpg',
    );
    expect(screen.getByRole('button', { name: /replace/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove/i })).toBeInTheDocument();
  });

  it('clears the value when Remove is clicked, going back to the picker', async () => {
    const user = userEvent.setup();
    const onSpy = vi.fn();
    render(
      <ControlledPicker
        initial={{ id: 'med_abc', url: 'http://example.com/cover.jpg' }}
        onSpy={onSpy}
      />,
    );

    await user.click(screen.getByRole('button', { name: /remove/i }));

    expect(onSpy).toHaveBeenCalledWith(null);
    await waitFor(() => expect(screen.getByText(/click to choose/i)).toBeInTheDocument());
  });

  // ─── #34: Replace is atomic ─────────────────────────────────────────
  // Replace must NOT propagate `onChange(null)` — otherwise the parent's
  // autosave debounce can fire a `coverImageMediaId: null` PATCH in the
  // gap between Replace click and the new upload completing, clearing
  // the cover server-side. Replace now keeps the parent's value
  // untouched until the new upload resolves.

  it('Replace puts the picker into upload mode without firing onChange', async () => {
    const user = userEvent.setup();
    const onSpy = vi.fn();
    render(
      <ControlledPicker
        initial={{ id: 'med_abc', url: 'http://example.com/cover.jpg' }}
        onSpy={onSpy}
      />,
    );

    await user.click(screen.getByRole('button', { name: /replace/i }));

    // Uploader is mounted; preview + Replace/Remove are gone.
    expect(screen.getByText(/click to choose/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /cover preview/i })).not.toBeInTheDocument();
    // Cancel button is visible so the user can back out.
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    // Critical: parent's `value` is untouched — no autosave race possible.
    expect(onSpy).not.toHaveBeenCalled();
  });

  it('Cancel from replace mode reverts to the preview without firing onChange', async () => {
    const user = userEvent.setup();
    const onSpy = vi.fn();
    render(
      <ControlledPicker
        initial={{ id: 'med_abc', url: 'http://example.com/cover.jpg' }}
        onSpy={onSpy}
      />,
    );

    await user.click(screen.getByRole('button', { name: /replace/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));

    // Back to preview + Replace/Remove.
    expect(screen.getByRole('img', { name: /cover preview/i })).toHaveAttribute(
      'src',
      'http://example.com/cover.jpg',
    );
    expect(screen.getByRole('button', { name: /^replace$/i })).toBeInTheDocument();
    expect(onSpy).not.toHaveBeenCalled();
  });
});
