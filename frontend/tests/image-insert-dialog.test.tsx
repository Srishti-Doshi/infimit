import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ImageInsertDialog } from '@/components/editor/image-insert-dialog';

/**
 * Day-9 verification: the prompt-based image insert from Day 3 is gone — the
 * Tiptap toolbar's image button now opens this dialog and waits for a real
 * upload + alt text before invoking `onInsert`.
 *
 * Upload mechanics are covered separately in `media-uploader.test.tsx`; here
 * we just exercise the dialog's open/insert/cancel contract.
 */
function Harness({
  onInsert,
}: {
  onInsert: (params: { src: string; alt: string }) => void;
}): JSX.Element {
  const [open, setOpen] = useState(true);
  return <ImageInsertDialog open={open} onOpenChange={setOpen} onInsert={onInsert} />;
}

function pickFile(file: File): void {
  const input = screen.getByLabelText(/click to choose/i, {
    selector: 'input',
  }) as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file] });
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('<ImageInsertDialog>', () => {
  it('uploads, captures alt text, and fires onInsert with the resolved URL', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<Harness onInsert={onInsert} />);

    // Insert button is disabled until a Media doc exists.
    expect(screen.getByRole('button', { name: /insert image/i })).toBeDisabled();

    pickFile(new File([new Uint8Array(512)], 'photo.png', { type: 'image/png' }));

    // Alt input appears only after the upload resolves.
    const altInput = await screen.findByLabelText(/alt text/i, undefined, { timeout: 4000 });
    await user.type(altInput, 'A campus photo');

    const insertBtn = screen.getByRole('button', { name: /insert image/i });
    await waitFor(() => expect(insertBtn).not.toBeDisabled());
    await user.click(insertBtn);

    expect(onInsert).toHaveBeenCalledTimes(1);
    const call = onInsert.mock.calls[0]![0];
    expect(call.src).toMatch(/uploads\/article_embed\//);
    expect(call.alt).toBe('A campus photo');
  });

  it('Cancel closes the dialog without inserting', async () => {
    const user = userEvent.setup();
    const onInsert = vi.fn();
    render(<Harness onInsert={onInsert} />);

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onInsert).not.toHaveBeenCalled();
  });
});
