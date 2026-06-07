import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import { mockDrafts } from '@/mocks/fixtures';
import AdminArticlesPage from '@/pages/dashboard/admin/articles';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function renderPage() {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboard/admin/articles" element={<AdminArticlesPage />} />
    </Routes>,
    { initialEntries: ['/dashboard/admin/articles'] },
  );
}

/** Build a fixture article off mockDrafts[0] with status + slug overrides. */
function makeArticle(overrides: {
  id: string;
  title: string;
  slug: string;
  status: 'published' | 'unpublished';
  publishedAt: string;
}) {
  return {
    ...mockDrafts[0]!,
    ...overrides,
  };
}

describe('<AdminArticlesPage>', () => {
  it('lists published with Unpublish action and unpublished with Re-publish action', async () => {
    const published = makeArticle({
      id: 'art_pub_001',
      title: 'A published article',
      slug: 'a-published-article',
      status: 'published',
      publishedAt: '2026-06-01T10:00:00.000Z',
    });
    const unpublished = makeArticle({
      id: 'art_unp_001',
      title: 'An unpublished article',
      slug: 'an-unpublished-article',
      status: 'unpublished',
      publishedAt: '2026-05-30T10:00:00.000Z',
    });

    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [published, unpublished], total: 2 },
        }),
      ),
    );

    renderPage();

    // Both rows render.
    expect(await screen.findByText('A published article')).toBeInTheDocument();
    expect(screen.getByText('An unpublished article')).toBeInTheDocument();

    // Published row gets the Unpublish action; unpublished row gets the
    // Re-publish action — PR #58 widened BE publishArticle to accept the
    // `unpublished → published` transition, so this surface now closes the
    // admin lifecycle loop (closes #50).
    expect(screen.getByRole('button', { name: /^unpublish$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^re-publish$/i })).toBeInTheDocument();
  });

  it('filters out non-published/unpublished statuses (drafts hidden from the surface)', async () => {
    const published = makeArticle({
      id: 'art_pub_001',
      title: 'Live article',
      slug: 'live-article',
      status: 'published',
      publishedAt: '2026-06-01T10:00:00.000Z',
    });
    // A draft and a submitted article should NOT appear in this surface.
    const draftItem = { ...mockDrafts[0]!, id: 'art_draft_xx', title: 'Hidden draft' };
    const submittedItem = {
      ...mockDrafts[0]!,
      id: 'art_sub_xx',
      title: 'Hidden submission',
      status: 'submitted' as const,
    };

    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [published, draftItem, submittedItem], total: 3 },
        }),
      ),
    );

    renderPage();

    expect(await screen.findByText('Live article')).toBeInTheDocument();
    expect(screen.queryByText('Hidden draft')).not.toBeInTheDocument();
    expect(screen.queryByText('Hidden submission')).not.toBeInTheDocument();
  });

  it('opens a confirm modal and posts to /unpublish when admin confirms', async () => {
    const user = userEvent.setup();
    const published = makeArticle({
      id: 'art_pub_001',
      title: 'Article to be unpublished',
      slug: 'article-to-be-unpublished',
      status: 'published',
      publishedAt: '2026-06-01T10:00:00.000Z',
    });

    let unpublishCalledFor: string | null = null;
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [published], total: 1 },
        }),
      ),
      http.post(`${BASE}/articles/:id/unpublish`, ({ params }) => {
        unpublishCalledFor = params.id as string;
        return HttpResponse.json({
          success: true,
          data: { article: { ...published, status: 'unpublished' } },
        });
      }),
    );

    renderPage();

    // Click the row's Unpublish button to open the modal.
    await user.click(await screen.findByRole('button', { name: /^unpublish$/i }));

    // Modal opens; confirm-CTA is inside the dialog (also labelled "Unpublish").
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/take.*offline/i)).toBeInTheDocument();
    const confirmBtn = within(dialog).getByRole('button', { name: /^unpublish$/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(unpublishCalledFor).toBe('art_pub_001'));
  });

  it('opens a confirm modal and posts to /publish when admin Re-publishes', async () => {
    const user = userEvent.setup();
    const unpublished = makeArticle({
      id: 'art_unp_001',
      title: 'Article to be re-published',
      slug: 'article-to-be-re-published',
      status: 'unpublished',
      publishedAt: '2026-05-30T10:00:00.000Z',
    });

    let publishCalledFor: string | null = null;
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [unpublished], total: 1 },
        }),
      ),
      http.post(`${BASE}/articles/:id/publish`, ({ params }) => {
        publishCalledFor = params.id as string;
        return HttpResponse.json({
          success: true,
          data: {
            article: {
              ...unpublished,
              status: 'published',
              publishedAt: '2026-06-08T10:00:00.000Z',
            },
          },
        });
      }),
    );

    renderPage();

    await user.click(await screen.findByRole('button', { name: /^re-publish$/i }));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/put.*back live/i)).toBeInTheDocument();
    const confirmBtn = within(dialog).getByRole('button', { name: /^re-publish$/i });
    await user.click(confirmBtn);

    await waitFor(() => expect(publishCalledFor).toBe('art_unp_001'));
  });
});
