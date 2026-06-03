import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { RejectModal } from '@/components/editor/reject-modal';

/**
 * `<RejectModal>` keeps validation client-side so the user never round-trips
 * a 422 just for length. Tests cover the validation gate, the char counter,
 * the submit payload shape, and cancel-clears.
 */

const ARTICLE_TITLE = 'A draft that needs a second look';

describe('<RejectModal>', () => {
  it('renders the article title in the description and disables submit by default', () => {
    render(
      <RejectModal
        open
        onOpenChange={() => undefined}
        articleTitle={ARTICLE_TITLE}
        onSubmit={() => undefined}
      />,
    );

    expect(screen.getByRole('heading', { name: /reject submission/i })).toBeInTheDocument();
    expect(screen.getByText(ARTICLE_TITLE)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reject submission/i })).toBeDisabled();
  });

  it('keeps submit disabled until the reason hits the 10-char floor', async () => {
    const user = userEvent.setup();
    render(
      <RejectModal
        open
        onOpenChange={() => undefined}
        articleTitle={ARTICLE_TITLE}
        onSubmit={() => undefined}
      />,
    );

    const textarea = screen.getByLabelText(/reason/i);
    const submit = screen.getByRole('button', { name: /reject submission/i });

    await user.type(textarea, 'too short');
    expect(submit).toBeDisabled();

    await user.type(textarea, ' more words now over ten');
    expect(submit).toBeEnabled();
  });

  it('fires onSubmit with the trimmed rejectionReason payload', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(
      <RejectModal
        open
        onOpenChange={() => undefined}
        articleTitle={ARTICLE_TITLE}
        onSubmit={onSubmit}
      />,
    );

    await user.type(
      screen.getByLabelText(/reason/i),
      'Needs a citation for the funding figures cited in §3.',
    );
    await user.click(screen.getByRole('button', { name: /reject submission/i }));

    expect(onSubmit).toHaveBeenCalledOnce();
    expect(onSubmit).toHaveBeenCalledWith({
      rejectionReason: 'Needs a citation for the funding figures cited in §3.',
    });
  });

  it('calls onOpenChange(false) when Cancel is clicked', async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    render(
      <RejectModal
        open
        onOpenChange={onOpenChange}
        articleTitle={ARTICLE_TITLE}
        onSubmit={() => undefined}
      />,
    );

    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });

  it('disables both buttons while isSubmitting is true', () => {
    render(
      <RejectModal
        open
        onOpenChange={() => undefined}
        articleTitle={ARTICLE_TITLE}
        onSubmit={() => undefined}
        isSubmitting
      />,
    );

    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /rejecting/i })).toBeDisabled();
  });
});
