import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import DraftsPage from '@/pages/dashboard/author/drafts';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

describe('<DraftsPage>', () => {
  it('lists only the current user’s drafts (submitted articles live elsewhere)', async () => {
    renderWithProviders(<DraftsPage />, { initialEntries: ['/dashboard/author/drafts'] });

    // Heading + the cross-link to the submissions tracker.
    expect(screen.getByRole('heading', { name: /my drafts/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view submissions/i })).toBeInTheDocument();

    // Seeded draft fixture renders.
    expect(
      await screen.findByText(/untitled draft about campus accessibility/i),
    ).toBeInTheDocument();

    // Submitted fixture must NOT appear here — it belongs to the submissions
    // page after the Day-12 split.
    expect(
      screen.queryByText(/inside the 2026 research-funding shake-up/i),
    ).not.toBeInTheDocument();
  });

  it('renders the empty state when the list is empty', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
    );

    renderWithProviders(<DraftsPage />, { initialEntries: ['/dashboard/author/drafts'] });

    await waitFor(() => expect(screen.getByText(/no drafts yet/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /start writing/i })).toBeInTheDocument();
  });
});
