import { useEffect } from 'react';

import { getMe } from '@/lib/auth-api';
import { useAuthStore } from '@/store/auth-store';

/**
 * One-shot hydration: on app start, call `/auth/me`. If the refresh cookie is
 * present, the apiClient's 401-refresh interceptor mints a new access token
 * transparently and the call resolves with the current user; otherwise it
 * rejects and we stay logged out. Either way we set `isHydrated: true` so
 * route guards can stop showing a spinner.
 */
export function useAuthBootstrap(): void {
  useEffect(() => {
    void (async () => {
      try {
        const user = await getMe();
        const token = useAuthStore.getState().accessToken;
        if (token) {
          useAuthStore.getState().setSession(token, user);
        }
      } catch {
        // No session — nothing to restore. The interceptor already cleared
        // the store if a refresh attempt failed.
      } finally {
        useAuthStore.getState().setHydrated(true);
      }
    })();
  }, []);
}
