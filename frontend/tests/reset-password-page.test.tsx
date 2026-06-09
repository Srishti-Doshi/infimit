import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import ResetPasswordPage from '@/pages/auth/reset-password';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * #24 — Pre-fix the success path toasted-and-redirected to /auth/login in
 * the same tick, so QA didn't catch the success signal. Switched to an
 * interstitial: success state stays on the page with an explicit
 * "Sign in" CTA. Tests pin the new contract.
 */
describe('<ResetPasswordPage>', () => {
  it('renders an interstitial success state with a Sign in CTA on successful reset', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/reset-password`, () =>
        HttpResponse.json({ success: true, data: { reset: true } }),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      </Routes>,
      { initialEntries: ['/auth/reset-password?token=valid-token'] },
    );

    // Form is shown initially.
    await user.type(screen.getByLabelText(/^new password$/i), 'NewPassword12!');
    await user.type(screen.getByLabelText(/confirm new password/i), 'NewPassword12!');
    await user.click(screen.getByRole('button', { name: /^reset password$/i }));

    // After success, the form is gone — replaced by an interstitial card
    // with title + an explicit Sign in CTA.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /password updated/i })).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText(/^new password$/i)).not.toBeInTheDocument();
    const cta = screen.getByRole('link', { name: /^sign in$/i });
    expect(cta).toHaveAttribute('href', '/auth/login');
  });

  it('keeps the form mounted and surfaces the error on a failed reset', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/auth/reset-password`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INVALID_TOKEN', message: 'expired' } },
          { status: 401 },
        ),
      ),
    );

    renderWithProviders(
      <Routes>
        <Route path="/auth/reset-password" element={<ResetPasswordPage />} />
      </Routes>,
      { initialEntries: ['/auth/reset-password?token=expired-token'] },
    );

    await user.type(screen.getByLabelText(/^new password$/i), 'NewPassword12!');
    await user.type(screen.getByLabelText(/confirm new password/i), 'NewPassword12!');
    await user.click(screen.getByRole('button', { name: /^reset password$/i }));

    // Form is still mounted — no interstitial swap on failure.
    await waitFor(() => expect(screen.getByLabelText(/^new password$/i)).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: /password updated/i })).not.toBeInTheDocument();
  });
});
