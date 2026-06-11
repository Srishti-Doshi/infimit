/**
 * EpaperPage integration (Sub-PR 5-fc) — public archive grid covering:
 *   - Loaded grid renders one tile per issue with title + date + cover img
 *   - 0-issue archive renders the "No issues yet" empty state
 *   - 500 error renders the retry surface
 *   - Each tile links to `/epaper/:id`
 */
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import EpaperPage from '@/pages/epaper';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function renderAt(entry = '/epaper'): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <Routes>
      <Route path="/epaper" element={<EpaperPage />} />
    </Routes>,
    { initialEntries: [entry] },
  );
}

describe('<EpaperPage>', () => {
  it('renders the archive grid with one tile per issue', async () => {
    server.use(
      http.get(`${BASE}/epapers`, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                id: 'epp_1',
                title: 'Morning Edition — 30 May 2026',
                issueDate: '2026-05-30T00:00:00.000Z',
                pdfMediaId: '6a2100000000000000000001',
                coverMediaId: '6a2100000000000000000002',
                coverImageUrl: 'https://cdn.example.com/epapers/2026-05-30.jpg',
                pageCount: 16,
                uploadedBy: 'usr_demo_001',
                stats: { downloads: 47, views: 312 },
                createdAt: '2026-05-30T06:00:00.000Z',
                updatedAt: '2026-05-30T06:00:00.000Z',
              },
              {
                id: 'epp_2',
                title: 'Weekly Digest — 23 May 2026',
                issueDate: '2026-05-23T00:00:00.000Z',
                pdfMediaId: '6a2100000000000000000003',
                coverMediaId: '6a2100000000000000000004',
                coverImageUrl: null,
                pageCount: 24,
                uploadedBy: 'usr_demo_001',
                stats: { downloads: 128, views: 894 },
                createdAt: '2026-05-23T06:00:00.000Z',
                updatedAt: '2026-05-23T06:00:00.000Z',
              },
            ],
            total: 2,
            page: 1,
            limit: 20,
          },
        }),
      ),
    );

    renderAt('/epaper');

    const firstTitle = await screen.findByRole('heading', {
      name: /morning edition — 30 may 2026/i,
    });
    expect(firstTitle).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /weekly digest — 23 may 2026/i }),
    ).toBeInTheDocument();

    // First tile's link points at the per-issue route.
    const firstLink = firstTitle.closest('a');
    expect(firstLink).toHaveAttribute('href', '/epaper/epp_1');

    // Tile with a cover URL renders the <img>; the cover-less tile falls back
    // to the Infimit-branded placeholder (no <img> in that tile's link).
    const secondTitle = screen.getByRole('heading', { name: /weekly digest/i });
    const secondLink = secondTitle.closest('a');
    expect(secondLink).not.toBeNull();
    expect(within(secondLink as HTMLElement).queryByRole('img')).toBeNull();
  });

  it('shows the empty state when the archive has no issues', async () => {
    server.use(
      http.get(`${BASE}/epapers`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20 },
        }),
      ),
    );

    renderAt('/epaper');

    expect(await screen.findByText(/no issues yet/i)).toBeInTheDocument();
    expect(
      screen.getByText(/the first edition will land here as soon as it's published/i),
    ).toBeInTheDocument();
  });

  it('renders the error surface with a retry button on 500', async () => {
    server.use(
      http.get(`${BASE}/epapers`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    renderAt('/epaper');

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
