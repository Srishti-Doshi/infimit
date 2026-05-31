import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import DraftsPage from '@/pages/dashboard/author/drafts';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

describe('<DraftsPage>', () => {
  it('lists the current user’s drafts with title, status, and last-edited columns', async () => {
    renderWithProviders(<DraftsPage />, { initialEntries: ['/dashboard/author/drafts'] });

    // Heading renders immediately.
    expect(screen.getByRole('heading', { name: /my articles/i })).toBeInTheDocument();

    // The seeded mockDrafts include a "draft" titled about accessibility and a
    // "submitted" one about funding — assert both render with their statuses.
    expect(
      await screen.findByText(/untitled draft about campus accessibility/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/inside the 2026 research-funding shake-up/i)).toBeInTheDocument();

    // Status badges from the ArticleStatusBadge component.
    expect(screen.getAllByText(/^Draft$/).length).toBeGreaterThan(0);
    expect(screen.getByText(/in review/i)).toBeInTheDocument();
  });

  it('renders the empty state when the list is empty', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
    );

    renderWithProviders(<DraftsPage />, { initialEntries: ['/dashboard/author/drafts'] });

    await waitFor(() => expect(screen.getByText(/no articles yet/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /start writing/i })).toBeInTheDocument();
  });
});
