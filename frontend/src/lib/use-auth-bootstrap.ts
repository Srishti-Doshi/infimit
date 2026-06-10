import { useEffect } from 'react';

import { getMe } from '@/lib/auth-api';
import { hasSessionHint, useAuthStore } from '@/store/auth-store';

/**
 * One-shot hydration: on app start, call `/auth/me`. If the refresh cookie is
 * present, the apiClient's 401-refresh interceptor mints a new access token
 * transparently and the call resolves with the current user; otherwise it
 * rejects and we stay logged out. Either way we set `isHydrated: true` so
 * route guards can stop showing a spinner.
 *
 * Two optimisations land via #86:
 *
 *   1. **StrictMode dedup.** React StrictMode in dev runs every `useEffect`
 *      twice on mount to surface side-effect bugs. The bootstrap is a real
 *      side effect (it hits the network), and the second run doubled every
 *      cold-start request. A module-level guard collapses the two runs into
 *      one without affecting the StrictMode-bug-surfacing benefit elsewhere.
 *
 *   2. **Session-hint skip.** Cold-start probes are wasted on visitors who
 *      have never authenticated on this device — the `/auth/refresh` cookie
 *      isn't there, so `getMe` 401s + refresh 401s + the store stays empty.
 *      The auth-store writes a non-sensitive `infimit_session_hint` flag to
 *      localStorage on every successful login/refresh and clears it on
 *      logout. When the flag is absent at boot, we skip the probe entirely
 *      and flip `isHydrated` immediately. Authed users (refresh cookie
 *      present, hint set) still get the normal probe.
 *
 * Combined effect on cold-start auth-request counts (notifications is a
 * separate hook and is unchanged):
 *   - Unauth visitor: 3 (2× `me` 401 + refresh 401) → 0.
 *   - Authed reload:  5 (2× `me` 401 + refresh 200 + 2× `me` 304) → 3
 *     (1× `me` 401 + refresh 200 + 1× `me` 304).
 */

let hasBootstrapped = false;

/**
 * Test-only — reset the StrictMode dedup flag between cases so each test
 * starts from a clean "haven't bootstrapped yet" state.
 */
export function __resetBootstrapForTests(): void {
  hasBootstrapped = false;
}

export function useAuthBootstrap(): void {
  useEffect(() => {
    if (hasBootstrapped) return;
    hasBootstrapped = true;

    // No session hint → this device has never authed (or the user logged
    // out and we cleared the hint). The refresh cookie isn't there, so the
    // probe would just 401 → refresh → 401. Skip it entirely.
    if (!hasSessionHint()) {
      useAuthStore.getState().setHydrated(true);
      return;
    }

    void (async () => {
      try {
        const user = await getMe();
        const token = useAuthStore.getState().accessToken;
        if (token) {
          useAuthStore.getState().setSession(token, user);
        }
      } catch {
        // No session — nothing to restore. The interceptor already cleared
        // the store + the hint if a refresh attempt failed.
      } finally {
        useAuthStore.getState().setHydrated(true);
      }
    })();
  }, []);
}
