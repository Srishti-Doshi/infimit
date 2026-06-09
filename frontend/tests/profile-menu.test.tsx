import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProfileMenu } from '@/components/layout/profile-menu';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';
import type { User } from '@/types/auth';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

const SAMPLE: User = {
  id: 'u1',
  name: 'Anika Rao',
  email: 'anika@infimit.dev',
  role: 'editor',
  isEmailVerified: true,
};

beforeEach(() => {
  useAuthStore.setState({ user: SAMPLE, accessToken: 'tok', isHydrated: true });
});

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
});

describe('<ProfileMenu>', () => {
  it('renders the avatar trigger with initials but does not show the menu by default', () => {
    renderWithProviders(<ProfileMenu user={SAMPLE} />);
    const trigger = screen.getByRole('button', { name: /open profile menu/i });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(within(trigger).getByText('AR')).toBeInTheDocument();
    // No menu in the DOM until clicked.
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('opens the menu on trigger click and renders name + email + role + actions', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileMenu user={SAMPLE} />);
    await user.click(screen.getByRole('button', { name: /open profile menu/i }));

    const menu = await screen.findByRole('menu');
    expect(within(menu).getByText(/anika rao/i)).toBeInTheDocument();
    expect(within(menu).getByText(/anika@infimit\.dev/)).toBeInTheDocument();
    expect(within(menu).getByText(/editor/i)).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });

  it('signs the user out — POSTs /auth/logout, clears the auth store, closes the menu', async () => {
    const user = userEvent.setup();
    let logoutHit = false;
    server.use(
      http.post(`${BASE}/auth/logout`, () => {
        logoutHit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<ProfileMenu user={SAMPLE} />);
    await user.click(screen.getByRole('button', { name: /open profile menu/i }));
    const menu = await screen.findByRole('menu');
    await user.click(within(menu).getByRole('menuitem', { name: /sign out/i }));

    await waitFor(() => expect(logoutHit).toBe(true));
    await waitFor(() => expect(useAuthStore.getState().user).toBeNull());
    expect(useAuthStore.getState().accessToken).toBeNull();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('closes when Escape is pressed', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfileMenu user={SAMPLE} />);
    await user.click(screen.getByRole('button', { name: /open profile menu/i }));
    await screen.findByRole('menu');

    await user.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
