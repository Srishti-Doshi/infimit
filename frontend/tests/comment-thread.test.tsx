import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommentThread } from '@/components/editor/comment-thread';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/store/auth-store';

/**
 * `<CommentThread>` reads from /v1/articles/:articleId/comments and writes
 * via POST. Tests cover the auth-gated form path + a successful post.
 *
 * `art_published_001` is seeded with 2 approved comments and lives in the
 * default MSW fixture set — assertions below lean on that.
 */

function setUser(role: 'reader' | null): void {
  if (!role) {
    useAuthStore.setState({ user: null, accessToken: null, isHydrated: true });
    return;
  }
  useAuthStore.setState({
    user: {
      id: 'usr_demo_001',
      name: 'Demo Reader',
      email: 'demo@infimit.test',
      role,
      avatarUrl: null,
    },
    accessToken: 'mock-access-token',
    isHydrated: true,
  });
}

afterEach(() => {
  // Reset the auth store so the next test starts from a clean slate.
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: true });
});

describe('<CommentThread>', () => {
  it('shows the sign-in prompt + still lists approved comments when unauthenticated', async () => {
    setUser(null);
    renderWithProviders(<CommentThread articleId="art_published_001" />);

    expect(screen.getByRole('heading', { name: /comments/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/auth/login');
    expect(screen.queryByPlaceholderText(/share your thoughts/i)).not.toBeInTheDocument();

    // Approved comments still render — comments are public reads, no bearer.
    await screen.findByText(/really helpful breakdown of the enrollment shifts/i);
  });

  it('shows the post form for authed users and disables submit until a body is typed', async () => {
    setUser('reader');
    const user = userEvent.setup();
    renderWithProviders(<CommentThread articleId="art_published_001" />);

    const textarea = await screen.findByPlaceholderText(/share your thoughts/i);
    const submit = screen.getByRole('button', { name: /post comment/i });
    expect(submit).toBeDisabled();

    await user.type(textarea, 'Good piece, looking forward to part two.');
    expect(submit).toBeEnabled();
  });

  it('submitting clears the textarea and shows the awaiting-moderation toast', async () => {
    setUser('reader');
    const user = userEvent.setup();

    const toastModule = await import('@/components/ui');
    const successSpy = vi.spyOn(toastModule.toast, 'success').mockImplementation(() => '');

    renderWithProviders(<CommentThread articleId="art_published_001" />);

    const textarea = await screen.findByPlaceholderText(/share your thoughts/i);
    await user.type(textarea, 'A really thoughtful comment goes here for the test.');
    await user.click(screen.getByRole('button', { name: /post comment/i }));

    await waitFor(() => expect(successSpy).toHaveBeenCalled(), { timeout: 2000 });
    expect(successSpy.mock.calls[0]?.[0]).toMatch(/awaiting moderation/i);
    expect((textarea as HTMLTextAreaElement).value).toBe('');

    successSpy.mockRestore();
  });
});
