import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useAuthStore } from '@/store/auth-store';

/**
 * Drop every cached query when the session ends.
 *
 * Without this, cached `/notifications`, `/articles`, etc. data survives a
 * logout — and if the same browser tab then logs in as a DIFFERENT user, the
 * cache flashes the previous user's data before the new fetches resolve. It
 * also leaves the door open for a brief background refetch to fire an
 * auth-required request just after `clear()` is called.
 *
 * We listen for the `user: User → null` transition (not just the bare null
 * state — that would also fire on first mount before bootstrap resolves) and
 * call `queryClient.clear()` exactly once on that edge.
 */
export function useQueryClearOnLogout(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let previousUser = useAuthStore.getState().user;
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (previousUser !== null && state.user === null) {
        queryClient.clear();
      }
      previousUser = state.user;
    });
    return unsubscribe;
  }, [queryClient]);
}
