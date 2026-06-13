/**
 * EpaperIssuePage integration (Sub-PR 5-fc) — per-issue reader page covering:
 *   - Loaded issue renders title, date, page count, stats, and the
 *     Download PDF + Browse archive CTAs
 *   - Download PDF anchor points at the BE 302 endpoint with target=_blank
 *   - 404 surfaces a friendly not-found state with a link back to the archive
 *   - 500 surfaces the retry button
 */
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import EpaperIssuePage from '@/pages/epaper-issue';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function renderAt(id: string): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <Routes>
      <Route path="/epaper/:id" element={<EpaperIssuePage />} />
    </Routes>,
    { initialEntries: [`/epaper/${id}`] },
  );
}

describe('<EpaperIssuePage>', () => {
  it('renders the issue with title, stats, and a Download PDF anchor', async () => {
    server.use(
      http.get(`${BASE}/epapers/epp_1`, () =>
        HttpResponse.json({
          success: true,
          data: {
            epaper: {
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
          },
        }),
      ),
    );

    renderAt('epp_1');

    expect(
      await screen.findByRole('heading', { level: 1, name: /morning edition — 30 may 2026/i }),
    ).toBeInTheDocument();
    // Stats rendered.
    expect(screen.getByText('16')).toBeInTheDocument();
    expect(screen.getByText('47')).toBeInTheDocument();
    expect(screen.getByText('312')).toBeInTheDocument();
    // Download CTA hits the BE 302 endpoint.
    const downloadLink = screen.getByRole('link', { name: /download pdf/i });
    expect(downloadLink).toHaveAttribute('href', `${BASE}/epapers/epp_1/download`);
    expect(downloadLink).toHaveAttribute('target', '_blank');
    expect(downloadLink).toHaveAttribute('rel', expect.stringMatching(/noopener/));
  });

  it('renders the not-found state on 404 with a link back to the archive', async () => {
    server.use(
      http.get(`${BASE}/epapers/epp_missing`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Issue not found' } },
          { status: 404 },
        ),
      ),
    );

    renderAt('epp_missing');

    expect(await screen.findByText(/issue not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /browse archive/i })).toHaveAttribute(
      'href',
      '/epaper',
    );
  });

  it('renders the error surface with a retry button on 500', async () => {
    server.use(
      http.get(`${BASE}/epapers/epp_err`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    renderAt('epp_err');

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
