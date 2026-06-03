import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { CommentRow } from '@/components/editor/comment-row';
import type { Comment } from '@/types/comment';

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: 'cmt_test_001',
    articleId: 'art_001',
    article: { id: 'art_001', title: 'A piece about campus housing' },
    userId: 'usr_999',
    author: { id: 'usr_999', name: 'Maya Krishnan' },
    parentId: null,
    body: 'Really useful breakdown — thanks for sharing.',
    status: 'pending',
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
    ...overrides,
  };
}

function renderRow(
  props: Partial<Parameters<typeof CommentRow>[0]> = {},
): ReturnType<typeof render> {
  return render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <table>
        <tbody>
          <CommentRow comment={makeComment()} onAction={() => undefined} {...props} />
        </tbody>
      </table>
    </MemoryRouter>,
  );
}

describe('<CommentRow>', () => {
  it('renders body, author, article link, and three moderation buttons', () => {
    renderRow();
    expect(screen.getByText(/really useful breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/maya krishnan/i)).toBeInTheDocument();
    const articleLink = screen.getByRole('link', { name: /a piece about campus housing/i });
    expect(articleLink).toHaveAttribute('href', '/dashboard/editor/approvals/art_001');
    expect(screen.getByRole('button', { name: /^approve/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^reject/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: /^hide/i })).toBeEnabled();
  });

  it('falls back to em-dash when author or article projection is missing', () => {
    renderRow({ comment: makeComment({ author: undefined, article: undefined }) });
    const dashes = screen.getAllByText('—');
    // Author column AND article column should render the dash.
    expect(dashes.length).toBeGreaterThanOrEqual(2);
  });

  it('fires onAction with the right argument when each button is clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderRow({ onAction });

    await user.click(screen.getByRole('button', { name: /^approve/i }));
    await user.click(screen.getByRole('button', { name: /^reject/i }));
    await user.click(screen.getByRole('button', { name: /^hide/i }));

    expect(onAction).toHaveBeenCalledTimes(3);
    expect(onAction.mock.calls[0]?.[0]).toBe('approve');
    expect(onAction.mock.calls[1]?.[0]).toBe('reject');
    expect(onAction.mock.calls[2]?.[0]).toBe('hide');
  });

  it('disables all buttons + checkbox while isProcessing', () => {
    renderRow({
      isProcessing: true,
      selection: { selected: true, onChange: () => undefined },
    });
    expect(screen.getByRole('button', { name: /^approve/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^reject/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^hide/i })).toBeDisabled();
    expect(screen.getByRole('checkbox')).toBeDisabled();
  });

  it('renders the selection checkbox and fires onChange when toggled', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderRow({ selection: { selected: false, onChange } });
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).not.toBeChecked();
    await user.click(checkbox);
    expect(onChange).toHaveBeenLastCalledWith(true);
  });

  it('does NOT render the checkbox when selection prop is absent', () => {
    renderRow();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
