import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { server } from '@/mocks/server';
import AdminEpapersPage from '@/pages/dashboard/admin/epapers';
import { renderWithProviders } from '@/test/render';
import { useAuthStore } from '@/store/auth-store';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * Admin epaper list page. Default MSW seeds two issues
 * (Morning Edition + Weekly Digest) — these tests assert on the visible
 * surface + the delete flow.
 */

function signInAsAdmin(): void {
  useAuthStore.setState({
    user: {
      id: 'usr_demo_001',
      name: 'Demo Admin',
      email: 'admin@infimit.test',
      role: 'admin',
      avatarUrl: null,
    },
    accessToken: 'mock-access-token',
    isHydrated: true,
  });
}

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: true });
});

describe('<AdminEpapersPage>', () => {
  it('renders the seeded issues with title, date, and a download link', async () => {
    signInAsAdmin();
    renderWithProviders(<AdminEpapersPage />);

    expect(await screen.findByText(/morning edition — 30 may 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/weekly digest — 23 may 2026/i)).toBeInTheDocument();

    // Each row gets a Download anchor pointing at the backend redirect endpoint.
    const downloadLinks = screen.getAllByRole('link', { name: /download/i });
    expect(downloadLinks.length).toBeGreaterThanOrEqual(2);
    expect(downloadLinks[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/\/epapers\/.+\/download$/),
    );
  });

  it('shows the empty state with a "New issue" CTA when no issues exist', async () => {
    signInAsAdmin();
    server.use(
      http.get(`${BASE}/epapers`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20 },
        }),
      ),
    );

    renderWithProviders(<AdminEpapersPage />);

    expect(await screen.findByText(/no issues yet/i)).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /new issue/i }).length).toBeGreaterThanOrEqual(1);
  });

  it('deletes an issue when the row Delete button is clicked + confirmed', async () => {
    signInAsAdmin();
    const user = userEvent.setup();

    // window.confirm — happy-dom returns true by default for confirm() with
    // no implementation, but we pin it explicitly so the test doesn't break
    // if that default changes.
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);

    const deleteCalls: string[] = [];
    server.use(
      http.delete(`${BASE}/epapers/:id`, ({ params }) => {
        deleteCalls.push(String(params.id));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(<AdminEpapersPage />);

    await screen.findByText(/morning edition — 30 may 2026/i);
    await user.click(screen.getByRole('button', { name: /delete morning edition/i }));

    await waitFor(() => expect(deleteCalls).toEqual(['epp_2026_05_30']));
    expect(confirmSpy).toHaveBeenCalled();

    confirmSpy.mockRestore();
  });
});
