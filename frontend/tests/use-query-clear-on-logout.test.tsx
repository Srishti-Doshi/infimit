import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { useQueryClearOnLogout } from '@/lib/use-query-clear-on-logout';
import { useAuthStore } from '@/store/auth-store';
import type { User } from '@/types/auth';

/**
 * Asserts the `user: User → null` transition drops the React Query cache.
 * Without this, cached `/notifications`, `/articles`, etc. data survives a
 * logout and flashes on the next login (potentially as a DIFFERENT user).
 */

const SAMPLE_USER: User = {
  id: 'u1',
  email: 'test@infimit.dev',
  name: 'Test User',
  role: 'reader',
  isEmailVerified: true,
};

function Harness(): JSX.Element {
  useQueryClearOnLogout();
  return <div />;
}

afterEach(() => {
  useAuthStore.getState().clear();
});

describe('useQueryClearOnLogout', () => {
  it('clears the React Query cache when user transitions from set → null', () => {
    const client = new QueryClient();

    // Seed cache with some auth-required data the way a real screen would.
    client.setQueryData(['notifications', 'list'], { items: [{ id: 'n1' }], unread: 1 });
    client.setQueryData(['admin', 'articles'], { items: [{ id: 'a1' }] });

    // Logged in at mount.
    useAuthStore.getState().setSession('token', SAMPLE_USER);

    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );

    expect(client.getQueryData(['notifications', 'list'])).toBeDefined();

    // Log out — the transition the hook is listening for.
    act(() => {
      useAuthStore.getState().clear();
    });

    expect(client.getQueryData(['notifications', 'list'])).toBeUndefined();
    expect(client.getQueryData(['admin', 'articles'])).toBeUndefined();
  });

  it('does NOT clear the cache on first mount when user is already null', () => {
    const client = new QueryClient();
    // Pre-mount cache that should NOT be wiped by a no-op null→null reading.
    client.setQueryData(['public', 'home'], { items: [{ id: 'h1' }] });

    // No user set — fresh visitor.
    expect(useAuthStore.getState().user).toBeNull();

    render(
      <QueryClientProvider client={client}>
        <Harness />
      </QueryClientProvider>,
    );

    expect(client.getQueryData(['public', 'home'])).toBeDefined();
  });
});
