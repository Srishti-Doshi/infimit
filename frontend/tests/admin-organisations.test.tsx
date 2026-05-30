import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import AdminOrganisationsPage from '@/pages/dashboard/admin/organisations';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';

beforeEach(() => {
  useAuthStore.setState({
    user: { id: 'admin1', name: 'Anita Admin', email: 'admin@infimit.dev', role: 'admin' },
    accessToken: 'admin-tok',
    isHydrated: true,
  });
});

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
});

describe('<AdminOrganisationsPage>', () => {
  it('renders the seeded organisation list', async () => {
    renderWithProviders(<AdminOrganisationsPage />, {
      initialEntries: ['/dashboard/admin/organisations'],
    });
    expect(await screen.findByText('Oakwood Institute')).toBeInTheDocument();
    expect(screen.getByText('oakwood-institute')).toBeInTheDocument();
  });

  it('creates a new organisation via the modal and appends it to the table', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminOrganisationsPage />, {
      initialEntries: ['/dashboard/admin/organisations'],
    });

    await user.click(screen.getByRole('button', { name: /add organisation/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'New Press');
    await user.type(within(dialog).getByLabelText('Slug'), 'new-press');
    await user.click(within(dialog).getByRole('button', { name: /^add organisation$/i }));

    await waitFor(() => expect(screen.getByText('New Press')).toBeInTheDocument());
  });
});
