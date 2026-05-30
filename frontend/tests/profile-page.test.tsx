import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import ProfilePage from '@/pages/dashboard/me';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';

/** Seed an authed reader before each test. */
beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'u1', name: 'Demo Reader', email: 'reader@test.dev', role: 'reader' },
    accessToken: 'tok',
    isHydrated: true,
  });
});

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
});

describe('<ProfilePage>', () => {
  it('renders the current user and disables Save until the form is dirty', () => {
    renderWithProviders(<ProfilePage />, { initialEntries: ['/dashboard/me'] });
    expect(screen.getByLabelText('Name')).toHaveValue('Demo Reader');
    // Email is rendered as read-only static text (not an input) so it stays
    // copyable and out of the form's tab loop. Shows in both the avatar card
    // and the Account section.
    expect(screen.getAllByText('reader@test.dev').length).toBeGreaterThan(0);
    expect(screen.queryByDisplayValue('reader@test.dev')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save changes/i })).toBeDisabled();
  });

  it('saves a new name and updates the store', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { initialEntries: ['/dashboard/me'] });

    const nameInput = screen.getByLabelText('Name');
    await user.clear(nameInput);
    await user.type(nameInput, 'Renamed Reader');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => expect(useAuthStore.getState().user?.name).toBe('Renamed Reader'));
  });

  it('logs the user out and clears the store', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { initialEntries: ['/dashboard/me'] });

    await user.click(screen.getByRole('button', { name: /log out/i }));

    await waitFor(() => {
      expect(useAuthStore.getState().user).toBeNull();
      expect(useAuthStore.getState().accessToken).toBeNull();
    });
  });
});
