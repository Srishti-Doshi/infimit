import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import LoginPage from '@/pages/auth/login';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';

/**
 * Validates the login wiring end-to-end against MSW: RHF + zodResolver →
 * mutation → apiClient → auth store. Browser verification of the visual modal
 * is still pending (no dev server in this environment).
 */
afterEach(() => {
  useAuthStore.getState().clear();
});

describe('<LoginPage>', () => {
  it('logs in and stores the session on valid credentials', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { initialEntries: ['/auth/login'] });

    await user.type(screen.getByLabelText('Email'), 'reader@test.dev');
    await user.type(screen.getByLabelText('Password'), 'Pa55word!!');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('mock-access-token'));
    expect(useAuthStore.getState().user?.email).toBe('demo@infimit.test');
  });

  it('blocks submission and shows an inline error for an invalid email', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { initialEntries: ['/auth/login'] });

    await user.type(screen.getByLabelText('Email'), 'not-an-email');
    await user.type(screen.getByLabelText('Password'), 'whatever');
    await user.click(screen.getByRole('button', { name: /^login$/i }));

    expect(await screen.findByText(/enter a valid email address/i)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('toggles password visibility', async () => {
    const user = userEvent.setup();
    renderWithProviders(<LoginPage />, { initialEntries: ['/auth/login'] });

    const password = screen.getByLabelText('Password');
    expect(password).toHaveAttribute('type', 'password');
    await user.click(screen.getByRole('button', { name: /show password/i }));
    expect(password).toHaveAttribute('type', 'text');
  });
});
