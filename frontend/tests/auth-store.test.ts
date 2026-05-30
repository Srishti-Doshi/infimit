import { afterEach, describe, expect, it } from 'vitest';

import { getAccessToken, useAuthStore } from '@/store/auth-store';
import type { User } from '@/types/auth';

const demoUser: User = {
  id: 'u1',
  name: 'Demo Reader',
  email: 'reader@test.dev',
  role: 'reader',
};

afterEach(() => {
  useAuthStore.setState({ accessToken: null, user: null, isHydrated: false });
});

describe('useAuthStore', () => {
  it('starts with no session and isHydrated=false', () => {
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.isHydrated).toBe(false);
  });

  it('setSession stores both the access token and the user', () => {
    useAuthStore.getState().setSession('tok-a', demoUser);
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('tok-a');
    expect(s.user).toEqual(demoUser);
  });

  it('setAccessToken rotates the token without touching the user', () => {
    useAuthStore.getState().setSession('tok-a', demoUser);
    useAuthStore.getState().setAccessToken('tok-b');
    const s = useAuthStore.getState();
    expect(s.accessToken).toBe('tok-b');
    expect(s.user).toEqual(demoUser);
  });

  it('setHydrated flips the boot flag', () => {
    expect(useAuthStore.getState().isHydrated).toBe(false);
    useAuthStore.getState().setHydrated(true);
    expect(useAuthStore.getState().isHydrated).toBe(true);
  });

  it('clear drops the session but preserves the hydration flag', () => {
    useAuthStore.getState().setSession('tok-a', demoUser);
    useAuthStore.getState().setHydrated(true);
    useAuthStore.getState().clear();
    const s = useAuthStore.getState();
    expect(s.accessToken).toBeNull();
    expect(s.user).toBeNull();
    expect(s.isHydrated).toBe(true);
  });

  it('getAccessToken reads the current token without subscribing', () => {
    expect(getAccessToken()).toBeNull();
    useAuthStore.getState().setAccessToken('tok-x');
    expect(getAccessToken()).toBe('tok-x');
  });
});
