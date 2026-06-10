import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMe } from '@/lib/auth-api';
import { __resetBootstrapForTests, useAuthBootstrap } from '@/lib/use-auth-bootstrap';
import { useAuthStore } from '@/store/auth-store';
import type { User } from '@/types/auth';

vi.mock('@/lib/auth-api', () => ({
  getMe: vi.fn(),
}));

const mockedGetMe = vi.mocked(getMe);

const demoUser: User = {
  id: 'u1',
  name: 'Demo Reader',
  email: 'reader@test.dev',
  role: 'reader',
};

const SESSION_HINT_KEY = 'infimit_session_hint';

function Probe(): null {
  useAuthBootstrap();
  return null;
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, isHydrated: false });
  mockedGetMe.mockReset();
  __resetBootstrapForTests();
  localStorage.removeItem(SESSION_HINT_KEY);
});

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, isHydrated: false });
  localStorage.removeItem(SESSION_HINT_KEY);
});

describe('useAuthBootstrap', () => {
  it('skips the probe entirely and flips isHydrated true when no session hint is present', async () => {
    // Never-authed device — no hint in localStorage. Pins the #86
    // optimisation: getMe must NOT be called for the probe storm to drop
    // from 3 requests to 0 on first-ever page load.
    mockedGetMe.mockResolvedValue(demoUser);

    render(<Probe />);

    await waitFor(() => expect(useAuthStore.getState().isHydrated).toBe(true));
    expect(mockedGetMe).not.toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('flips isHydrated true and leaves the store empty when the hint is set but getMe rejects', async () => {
    // Stale hint (previous session was cleared server-side) — we attempt
    // the probe, it 401s through, the interceptor clears the store + hint.
    localStorage.setItem(SESSION_HINT_KEY, '1');
    mockedGetMe.mockRejectedValue(new Error('UNAUTHORIZED'));

    render(<Probe />);

    await waitFor(() => expect(useAuthStore.getState().isHydrated).toBe(true));
    expect(mockedGetMe).toHaveBeenCalled();
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('restores the user via setSession when the hint is set and getMe succeeds', async () => {
    // Simulates the post-refresh state: hint present, interceptor minted a
    // new access token, /auth/me then resolved with the user.
    localStorage.setItem(SESSION_HINT_KEY, '1');
    useAuthStore.setState({ accessToken: 'rotated-tok' });
    mockedGetMe.mockResolvedValue(demoUser);

    render(<Probe />);

    await waitFor(() => expect(useAuthStore.getState().isHydrated).toBe(true));
    expect(useAuthStore.getState().user).toEqual(demoUser);
    expect(useAuthStore.getState().accessToken).toBe('rotated-tok');
  });

  it('does not invent a session when the hint is set + getMe succeeds but no token landed', async () => {
    localStorage.setItem(SESSION_HINT_KEY, '1');
    mockedGetMe.mockResolvedValue(demoUser);

    render(<Probe />);

    await waitFor(() => expect(useAuthStore.getState().isHydrated).toBe(true));
    expect(useAuthStore.getState().user).toBeNull();
  });
});
