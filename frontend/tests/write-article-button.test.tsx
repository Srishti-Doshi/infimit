import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { WriteArticleButton } from '@/components/layout/write-article-button';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';
import type { Role, User } from '@/types/auth';

function makeUser(role: Role): User {
  return {
    id: 'usr_test',
    name: 'Test User',
    email: 'test@infimit.dev',
    role,
  };
}

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, isHydrated: false });
});

describe('<WriteArticleButton>', () => {
  it('renders for author role with the correct label and href', () => {
    useAuthStore.setState({ user: makeUser('author') });
    renderWithProviders(<WriteArticleButton />);
    const link = screen.getByRole('link', { name: /write article/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard/author/drafts/new');
  });

  it('renders for editor role', () => {
    useAuthStore.setState({ user: makeUser('editor') });
    renderWithProviders(<WriteArticleButton />);
    expect(screen.getByRole('link', { name: /write article/i })).toBeInTheDocument();
  });

  it('renders for admin role', () => {
    useAuthStore.setState({ user: makeUser('admin') });
    renderWithProviders(<WriteArticleButton />);
    expect(screen.getByRole('link', { name: /write article/i })).toBeInTheDocument();
  });

  it('does not render for reader role', () => {
    useAuthStore.setState({ user: makeUser('reader') });
    renderWithProviders(<WriteArticleButton />);
    expect(screen.queryByRole('link', { name: /write article/i })).not.toBeInTheDocument();
  });

  it('does not render when signed out', () => {
    // afterEach already clears, but be explicit for readability.
    useAuthStore.setState({ user: null });
    renderWithProviders(<WriteArticleButton />);
    expect(screen.queryByRole('link', { name: /write article/i })).not.toBeInTheDocument();
  });

  it('invokes onBeforeNavigate when clicked (drawer integration hook)', async () => {
    const user = userEvent.setup();
    const onBeforeNavigate = vi.fn();
    useAuthStore.setState({ user: makeUser('author') });
    renderWithProviders(<WriteArticleButton onBeforeNavigate={onBeforeNavigate} />);
    await user.click(screen.getByRole('link', { name: /write article/i }));
    expect(onBeforeNavigate).toHaveBeenCalledTimes(1);
  });
});
