import { render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getMe } from '@/lib/auth-api';
import { useAuthBootstrap } from '@/lib/use-auth-bootstrap';
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

function Probe(): null {
  useAuthBootstrap();
  return null;
}

beforeEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, isHydrated: false });
  mockedGetMe.mockReset();
});

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, isHydrated: false });
});

describe('useAuthBootstrap', () => {
  it('flips isHydrated true and leaves the store empty when there is no session', async () => {
    mockedGetMe.mockRejectedValue(new Error('UNAUTHORIZED'));

    render(<Probe />);

    await waitFor(() => expect(useAuthStore.getState().isHydrated).toBe(true));
    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().accessToken).toBeNull();
  });

  it('restores the user via setSession when getMe succeeds and the interceptor populated a token', async () => {
    // Simulates the post-refresh state: interceptor minted a new access token,
    // /auth/me then resolved with the user.
    useAuthStore.setState({ accessToken: 'rotated-tok' });
    mockedGetMe.mockResolvedValue(demoUser);

    render(<Probe />);

    await waitFor(() => expect(useAuthStore.getState().isHydrated).toBe(true));
    expect(useAuthStore.getState().user).toEqual(demoUser);
    expect(useAuthStore.getState().accessToken).toBe('rotated-tok');
  });

  it('does not invent a session when getMe succeeds but no token landed in the store', async () => {
    mockedGetMe.mockResolvedValue(demoUser);

    render(<Probe />);

    await waitFor(() => expect(useAuthStore.getState().isHydrated).toBe(true));
    expect(useAuthStore.getState().user).toBeNull();
  });
});
