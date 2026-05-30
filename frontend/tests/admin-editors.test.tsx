import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import AdminEditorsPage from '@/pages/dashboard/admin/editors';
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

describe('<AdminEditorsPage>', () => {
  it('renders the seeded editor list', async () => {
    renderWithProviders(<AdminEditorsPage />, { initialEntries: ['/dashboard/admin/editors'] });
    expect(await screen.findByText('Rohan Desai')).toBeInTheDocument();
    expect(screen.getByText('rohan@infimit.com')).toBeInTheDocument();
  });

  it('creates a new editor via the modal and appends it to the table', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminEditorsPage />, { initialEntries: ['/dashboard/admin/editors'] });

    await user.click(screen.getByRole('button', { name: /create editor/i }));

    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Name'), 'New Editor');
    await user.type(within(dialog).getByLabelText('Email'), 'new.editor@infimit.com');
    await user.type(within(dialog).getByLabelText('Starter password'), 'Editor12345!');
    await user.click(within(dialog).getByRole('button', { name: /^create editor$/i }));

    await waitFor(() => expect(screen.getByText('New Editor')).toBeInTheDocument());
  });
});
