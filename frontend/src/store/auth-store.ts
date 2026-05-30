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
 */
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

  setSession: (accessToken, user) => set({ accessToken, user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setHydrated: (isHydrated) => set({ isHydrated }),
  clear: () => set({ accessToken: null, user: null }),
}));

/** Non-reactive read for use outside React (e.g. the axios interceptor). */
export const getAccessToken = (): string | null => useAuthStore.getState().accessToken;
