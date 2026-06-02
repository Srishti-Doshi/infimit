import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import SubmissionsPage from '@/pages/dashboard/author/submissions';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

describe('<SubmissionsPage>', () => {
  it('lists non-draft articles with the right status badge', async () => {
    renderWithProviders(<SubmissionsPage />, {
      initialEntries: ['/dashboard/author/submissions'],
    });

    // Heading + cross-link to drafts.
    expect(screen.getByRole('heading', { name: /my submissions/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /my drafts/i })).toBeInTheDocument();

    // Seeded submitted fixture renders with its title and the "In review" pill.
    expect(
      await screen.findByText(/inside the 2026 research-funding shake-up/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/in review/i)).toBeInTheDocument();

    // Drafts must not leak onto this page.
    expect(
      screen.queryByText(/untitled draft about campus accessibility/i),
    ).not.toBeInTheDocument();
  });

  it('renders the rejection reason inline when status is rejected', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                id: 'art_rejected_001',
                title: 'A piece that needs another pass',
                body: '<p>...</p>',
                plainText: '...',
                coverImageUrl: null,
                coverImageMediaId: '6a1a610c26432f0687a8c9aa',
                media: [],
                category: 'campus_news',
                subcategory: null,
                tags: ['campus'],
                location: null,
                authorId: 'usr_demo_001',
                organisationId: null,
                editorId: null,
                status: 'rejected',
                rejectionReason: 'Please add a primary source for the funding figures.',
                version: 4,
                submittedAt: '2026-05-29T18:00:00.000Z',
                publishedAt: null,
                approvedAt: null,
                createdAt: '2026-05-25T11:00:00.000Z',
                updatedAt: '2026-05-30T08:00:00.000Z',
              },
            ],
            total: 1,
          },
        }),
      ),
    );

    renderWithProviders(<SubmissionsPage />, {
      initialEntries: ['/dashboard/author/submissions'],
    });

    expect(await screen.findByText(/a piece that needs another pass/i)).toBeInTheDocument();
    expect(screen.getByText(/rejected/i)).toBeInTheDocument();
    expect(
      screen.getByText(/please add a primary source for the funding figures/i),
    ).toBeInTheDocument();
  });

  it('shows an empty state when nothing has been submitted yet', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({ success: true, data: { items: [], total: 0 } }),
      ),
    );

    renderWithProviders(<SubmissionsPage />, {
      initialEntries: ['/dashboard/author/submissions'],
    });

    await waitFor(() => expect(screen.getByText(/nothing submitted yet/i)).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /go to drafts/i })).toBeInTheDocument();
  });
});
