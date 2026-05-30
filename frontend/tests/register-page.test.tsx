import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';

import RegisterPage from '@/pages/auth/register';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';

/**
 * Exercises the readers-only sign-up wiring against MSW: RHF + zodResolver →
 * registerReader() → apiClient → auth store. Also confirms that backend error
 * codes map to inline form errors via the onError switch.
 */
const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('<RegisterPage>', () => {
  it('registers a reader and stores the session on valid input', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, { initialEntries: ['/auth/register'] });

    await user.type(screen.getByLabelText('Name'), 'Reader Renee');
    await user.type(screen.getByLabelText('Email'), 'renee@test.dev');
    await user.type(screen.getByLabelText('Password'), 'Pa55word!!');
    await user.click(screen.getByRole('button', { name: /^sign up$/i }));

    await waitFor(() => expect(useAuthStore.getState().accessToken).toBe('mock-access-token'));
    expect(useAuthStore.getState().user?.email).toBe('demo@infimit.test');
  });

  it('blocks submission and shows an inline error for a too-short password', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, { initialEntries: ['/auth/register'] });

    await user.type(screen.getByLabelText('Name'), 'Reader Renee');
    await user.type(screen.getByLabelText('Email'), 'renee@test.dev');
    await user.type(screen.getByLabelText('Password'), 'short1');
    await user.click(screen.getByRole('button', { name: /^sign up$/i }));

    expect(await screen.findByText(/password must be at least 10 characters/i)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('surfaces EMAIL_EXISTS from the backend as an inline email error', async () => {
    server.use(
      http.post(`${BASE}/auth/register`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'EMAIL_EXISTS', message: 'Email already in use' } },
          { status: 409 },
        ),
      ),
    );

    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />, { initialEntries: ['/auth/register'] });

    await user.type(screen.getByLabelText('Name'), 'Reader Renee');
    await user.type(screen.getByLabelText('Email'), 'taken@test.dev');
    await user.type(screen.getByLabelText('Password'), 'Pa55word!!');
    await user.click(screen.getByRole('button', { name: /^sign up$/i }));

    expect(await screen.findByText(/account with this email already exists/i)).toBeInTheDocument();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });
});
