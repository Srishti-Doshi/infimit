import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it } from 'vitest';

import { NotificationBell } from '@/components/layout/notification-bell';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/store/auth-store';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function signIn(): void {
  useAuthStore.setState({
    user: {
      id: 'usr_demo_001',
      name: 'Demo Reader',
      email: 'demo@infimit.test',
      role: 'reader',
      avatarUrl: null,
    },
    accessToken: 'mock-access-token',
    isHydrated: true,
  });
}

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: true });
});

describe('<NotificationBell>', () => {
  it('renders nothing when no user is signed in', () => {
    const { container } = renderWithProviders(<NotificationBell />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the bell with no badge when there are zero unread', async () => {
    signIn();
    server.use(
      http.get(`${BASE}/notifications`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, unread: 0, page: 1, limit: 1 },
        }),
      ),
    );

    renderWithProviders(<NotificationBell />);

    const link = await screen.findByRole('link', { name: /no unread/i });
    expect(link).toHaveAttribute('href', '/dashboard/notifications');
    // No badge node when count is zero.
    expect(link.querySelector('span[aria-hidden="true"]')).toBeNull();
  });

  it('shows the exact unread count when 1 <= unread <= 9', async () => {
    signIn();
    server.use(
      http.get(`${BASE}/notifications`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, unread: 3, page: 1, limit: 1 },
        }),
      ),
    );

    renderWithProviders(<NotificationBell />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /3 unread/i })).toBeInTheDocument(),
    );
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows "9+" when unread exceeds 9', async () => {
    signIn();
    server.use(
      http.get(`${BASE}/notifications`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, unread: 47, page: 1, limit: 1 },
        }),
      ),
    );

    renderWithProviders(<NotificationBell />);

    await waitFor(() =>
      expect(screen.getByRole('link', { name: /47 unread/i })).toBeInTheDocument(),
    );
    expect(screen.getByText('9+')).toBeInTheDocument();
  });
});
