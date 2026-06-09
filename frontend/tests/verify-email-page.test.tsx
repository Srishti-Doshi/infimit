import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { StrictMode } from 'react';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import VerifyEmailPage from '@/pages/auth/verify-email';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * #22 FE half — ensure the verify-email page fires the consume call
 * EXACTLY ONCE per token, even under React 18 StrictMode (which intentionally
 * mounts + unmounts + remounts effects in dev to surface bugs like this one).
 *
 * Without the `firedFor` ref guard, the BE's atomic `consumeJti` (PR #61)
 * still works — but the FE races the success-from-first and
 * error-from-second `setStatus` calls and may end up showing "Verification
 * failed" on a token that did verify.
 */
describe('<VerifyEmailPage>', () => {
  it('fires POST /auth/verify-email exactly once even under StrictMode double-render', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/auth/verify-email`, () => {
        calls += 1;
        return HttpResponse.json({ success: true, data: { verified: true } });
      }),
    );

    renderWithProviders(
      <StrictMode>
        <Routes>
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </StrictMode>,
      { initialEntries: ['/auth/verify-email?token=tok-12345'] },
    );

    // Wait for the page to settle into the success state.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /email verified/i })).toBeInTheDocument(),
    );

    // The guard ensures the network was only hit once, regardless of
    // StrictMode's double-effect simulation.
    expect(calls).toBe(1);
  });

  it('shows the error state when the token is genuinely invalid (only-fire-once still holds)', async () => {
    let calls = 0;
    server.use(
      http.post(`${BASE}/auth/verify-email`, () => {
        calls += 1;
        return HttpResponse.json(
          { success: false, error: { code: 'INVALID_TOKEN', message: 'bad' } },
          { status: 401 },
        );
      }),
    );

    renderWithProviders(
      <StrictMode>
        <Routes>
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </StrictMode>,
      { initialEntries: ['/auth/verify-email?token=stale-token'] },
    );

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: /verification failed/i })).toBeInTheDocument(),
    );

    expect(calls).toBe(1);
  });

  it('renders the error state immediately when the URL has no token', async () => {
    renderWithProviders(
      <StrictMode>
        <Routes>
          <Route path="/auth/verify-email" element={<VerifyEmailPage />} />
        </Routes>
      </StrictMode>,
      { initialEntries: ['/auth/verify-email'] },
    );

    expect(
      await screen.findByRole('heading', { name: /verification failed/i }),
    ).toBeInTheDocument();
  });
});
