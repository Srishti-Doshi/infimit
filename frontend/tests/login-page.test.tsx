import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
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

  // ─── #29: dismiss does not bounce off RequireAuth ───────────────────
  // Pre-fix, clicking X with `?next=/dashboard/me` (the typical post-logout
  // state) navigated to `/dashboard/me`, which was guarded → the router
  // redirected back to `/auth/login?next=…`, and the user perceived the
  // modal as reopening on every render. The fix: dismiss always goes home,
  // regardless of `next`.
  it('X dismiss with ?next=/dashboard/me lands on home, not on next (no loop)', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/" element={<div data-testid="home-marker">HOME</div>} />
        <Route
          path="/dashboard/me"
          element={<div data-testid="dashboard-marker">DASHBOARD</div>}
        />
      </Routes>,
      { initialEntries: ['/auth/login?next=%2Fdashboard%2Fme'] },
    );

    // Modal is up.
    expect(
      await screen.findByRole('heading', { name: /login to your account/i }),
    ).toBeInTheDocument();

    // Radix Dialog.Close — aria-label="Close" on the X button.
    await user.click(screen.getByRole('button', { name: /^close$/i }));

    // We land at home (not /dashboard/me) and the modal is gone — no loop.
    await waitFor(() => expect(screen.getByTestId('home-marker')).toBeInTheDocument());
    expect(screen.queryByTestId('dashboard-marker')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: /login to your account/i }),
    ).not.toBeInTheDocument();
  });
});
