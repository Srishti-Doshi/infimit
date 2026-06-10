import { create } from 'zustand';

import type { User } from '@/types/auth';

/**
 * Auth slice — the single source of truth for the current session.
 *
 * The access token lives **in memory only**. It is deliberately NOT persisted
 * (no `persist` middleware) per docs/10-security.md §10.2: a refresh-token
 * httpOnly cookie owned by the browser is what survives a reload, and the
 * access token is re-minted from it via `/auth/refresh` on boot. Putting the
 * access token in localStorage would expose it to XSS.
 *
 * `isHydrated` gates the first render: on boot we call `/auth/me` (which
 * rehydrates from the refresh cookie). Until that resolves we don't yet know
 * whether the user is logged in, so route guards show a spinner instead of
 * bouncing an authenticated user to the login modal.
 *
 * Session hint: a non-sensitive `infimit_session_hint` localStorage flag is
 * set on successful login/register/refresh and cleared on logout/terminal
 * refresh failure. `useAuthBootstrap` reads it to skip the cold-start probe
 * for never-authed visitors. The flag is just a boolean — it doesn't carry
 * the access token or any other secret, so XSS exposure is harmless. Pins
 * #86 (the unauth half — eliminates the 3-request probe storm for visitors
 * who have never signed in on this device).
 */

const SESSION_HINT_KEY = 'infimit_session_hint';

function setHint(): void {
  try {
    localStorage.setItem(SESSION_HINT_KEY, '1');
  } catch {
    // SSR / Safari private mode / disabled storage — the hint is an
    // optimisation, not a correctness primitive. Fall back to always-probe.
  }
}

function clearHint(): void {
  try {
    localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Same as setHint — non-fatal.
  }
}

/**
 * Non-reactive check for the session hint. Used by `useAuthBootstrap` to
 * decide whether the cold-start probe is worth firing.
 */
export function hasSessionHint(): boolean {
  try {
    return localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
}
interface AuthState {
  accessToken: string | null;
  user: User | null;
  isHydrated: boolean;

  /** Store a fresh token + user after login/register/refresh. */
  setSession: (accessToken: string, user: User) => void;
  /** Replace just the access token (token rotation that returns no user). */
  setAccessToken: (accessToken: string) => void;
  /** Mark boot-time hydration complete (whether or not a session was found). */
  setHydrated: (isHydrated: boolean) => void;
  /** Drop the session — used on logout and on terminal refresh failure. */
  clear: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  accessToken: null,
  user: null,
  isHydrated: false,

  setSession: (accessToken, user) => {
    setHint();
    set({ accessToken, user });
  },
  setAccessToken: (accessToken) => {
    setHint();
    set({ accessToken });
  },
  setHydrated: (isHydrated) => set({ isHydrated }),
  clear: () => {
    clearHint();
    set({ accessToken: null, user: null });
  },
}));

/** Non-reactive read for use outside React (e.g. the axios interceptor). */
export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
