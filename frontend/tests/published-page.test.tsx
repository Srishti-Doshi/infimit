/**
 * PublishedPage (Sub-PR 5-fe-3, closes #78) — covers:
 *   - Published rows render with public-page links + stats columns
 *   - Unpublished rows show the status badge and link to the draft editor
 *   - Draft/submitted articles are filtered out
 *   - Empty state when nothing is live
 */
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import PublishedPage from '@/pages/dashboard/author/published';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function makeArticle(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'art_x',
    slug: 'article-x',
    title: 'Article X',
    subtitle: '',
    body: '<p>Body</p>',
    category: 'campus_news',
    status: 'published',
    authorId: 'u1',
    version: 3,
    publishedAt: '2026-06-01T09:00:00.000Z',
    submittedAt: '2026-05-28T09:00:00.000Z',
    createdAt: '2026-05-20T09:00:00.000Z',
    updatedAt: '2026-06-01T09:00:00.000Z',
    stats: {
      views: 120,
      uniqueReaders: 80,
      shares: 4,
      bookmarks: 7,
      commentsCount: 3,
      trendingScore: 0,
    },
    ...overrides,
  };
}

describe('<PublishedPage>', () => {
  it('lists published rows with public links + stats, badges unpublished, filters drafts', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              makeArticle({ id: 'art_live', slug: 'live-piece', title: 'Live Piece' }),
              makeArticle({
                id: 'art_pulled',
                slug: 'pulled-piece',
                title: 'Pulled Piece',
                status: 'unpublished',
              }),
              makeArticle({
                id: 'art_draft',
                slug: null,
                title: 'Still A Draft',
                status: 'draft',
                publishedAt: null,
              }),
            ],
            total: 3,
            page: 1,
            limit: 50,
          },
        }),
      ),
    );

    renderWithProviders(<PublishedPage />);

    // Published row → external public link.
    const liveLink = await screen.findByRole('link', { name: /live piece/i });
    expect(liveLink).toHaveAttribute('href', '/article/live-piece');
    expect(liveLink).toHaveAttribute('target', '_blank');

    // Stats render.
    expect(screen.getAllByText('120').length).toBeGreaterThan(0);
    expect(screen.getAllByText('7').length).toBeGreaterThan(0);

    // Unpublished row → draft-editor link + badge.
    const pulledLink = screen.getByRole('link', { name: /pulled piece/i });
    expect(pulledLink).toHaveAttribute('href', '/dashboard/author/drafts/art_pulled');
    expect(screen.getByText(/unpublished/i)).toBeInTheDocument();

    // Draft filtered out entirely.
    expect(screen.queryByText(/still a draft/i)).not.toBeInTheDocument();
  });

  it('shows the empty state when the author has nothing live', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 50 },
        }),
      ),
    );

    renderWithProviders(<PublishedPage />);

    expect(await screen.findByText(/nothing published yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /track my submissions/i })).toHaveAttribute(
      'href',
      '/dashboard/author/submissions',
    );
  });
});
