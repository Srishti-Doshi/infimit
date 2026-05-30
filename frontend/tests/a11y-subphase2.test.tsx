import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import AdminEditorsPage from '@/pages/dashboard/admin/editors';
import ProfilePage from '@/pages/dashboard/me';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';
import { Skeleton } from '@/components/ui';

/**
 * Regression net for the Day-11 accessibility pass. Each assertion guards a
 * specific fix — adding `scope="col"`, switching the email field to static
 * text, wrapping the skeleton in `aria-hidden`, etc.
 */

describe('Day-11 a11y baselines', () => {
  it('admin table headers have scope="col"', async () => {
    useAuthStore.setState({
      user: { id: 'a1', name: 'Admin', email: 'a@test.dev', role: 'admin' },
      accessToken: 'tok',
      isHydrated: true,
    });
    renderWithProviders(<AdminEditorsPage />, { initialEntries: ['/dashboard/admin/editors'] });
    const headers = await screen.findAllByRole('columnheader');
    expect(headers.length).toBeGreaterThan(0);
    headers.forEach((th) => expect(th).toHaveAttribute('scope', 'col'));
    useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
  });

  it('profile renders email as static text (not a disabled input)', () => {
    useAuthStore.setState({
      user: { id: 'u1', name: 'Demo Reader', email: 'reader@test.dev', role: 'reader' },
      accessToken: 'tok',
      isHydrated: true,
    });
    renderWithProviders(<ProfilePage />, { initialEntries: ['/dashboard/me'] });
    // The email text shows up as one or more paragraphs, never as an <input>.
    const matches = screen.getAllByText('reader@test.dev');
    expect(matches.length).toBeGreaterThan(0);
    matches.forEach((el) => expect(el.tagName).toBe('P'));
    expect(screen.queryByDisplayValue('reader@test.dev')).not.toBeInTheDocument();
    useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
  });

  it('Skeleton is aria-hidden so it stays out of the a11y tree', () => {
    const { container } = render(<Skeleton className="h-4 w-20" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
