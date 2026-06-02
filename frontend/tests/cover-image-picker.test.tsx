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
});
