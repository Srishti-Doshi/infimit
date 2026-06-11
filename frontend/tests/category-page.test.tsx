/**
 * CategoryPage integration (Sub-PR 5-fb) — covers:
 *   - Valid slug renders the category header + a divided list of articles
 *   - Invalid slug shows the "category isn't on our list" friendly empty
 *   - Empty category (no published articles) shows the "Check back soon" empty
 *   - Error state shows the retry button
 *   - "Load more" appears when total > items returned and advances pagination
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import CategoryPage from '@/pages/category';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function renderAt(slug: string): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <Routes>
      <Route path="/category/:slug" element={<CategoryPage />} />
    </Routes>,
    { initialEntries: [`/category/${slug}`] },
  );
}

describe('<CategoryPage>', () => {
  it('renders the category header and articles list for a valid slug', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                id: 'a1',
                slug: 'article-one',
                title: 'Article One',
                subtitle: 'First subtitle',
                coverImageUrl: null,
                category: 'tech_in_education',
                location: '',
                publishedAt: '2026-05-10T09:00:00.000Z',
                author: { id: 'u1', name: 'Author One' },
                ai: { summary: '', readingTimeMin: 5, degraded: false },
                stats: { views: 0, commentsCount: 0, bookmarks: 0 },
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          },
        }),
      ),
    );

    renderAt('tech_in_education');

    expect(
      await screen.findByRole('heading', { level: 1, name: /tech in education/i }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: /article one/i })).toBeInTheDocument();
  });

  it('shows a friendly "category isn\'t on our list" state for an invalid slug', () => {
    renderAt('not-a-real-category');

    expect(screen.getByText(/that category isn't on our list/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /home page/i })).toBeInTheDocument();
  });

  it('shows the "no published articles yet" empty state when category returns 0 items', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20 },
        }),
      ),
    );

    renderAt('campus_news');

    expect(
      await screen.findByText(/no published articles in campus news yet/i),
    ).toBeInTheDocument();
  });

  it('renders the error surface with a retry button on 500', async () => {
    server.use(
      http.get(`${BASE}/articles`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    renderAt('research_innovation');

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('shows a "Load more" button when total exceeds returned items and advances on click', async () => {
    const user = userEvent.setup();
    let page1Called = false;
    let page2Called = false;
    server.use(
      http.get(`${BASE}/articles`, ({ request }) => {
        const url = new URL(request.url);
        const page = url.searchParams.get('page') ?? '1';
        if (page === '1') {
          page1Called = true;
          return HttpResponse.json({
            success: true,
            data: {
              items: [
                {
                  id: 'a1',
                  slug: 'article-one',
                  title: 'Article One',
                  subtitle: '',
                  coverImageUrl: null,
                  category: 'campus_news',
                  location: '',
                  publishedAt: '2026-05-10T09:00:00.000Z',
                  author: null,
                  ai: { summary: '', readingTimeMin: 5, degraded: false },
                  stats: { views: 0, commentsCount: 0, bookmarks: 0 },
                },
              ],
              total: 2,
              page: 1,
              limit: 1,
            },
          });
        }
        page2Called = true;
        return HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                id: 'a2',
                slug: 'article-two',
                title: 'Article Two',
                subtitle: '',
                coverImageUrl: null,
                category: 'campus_news',
                location: '',
                publishedAt: '2026-05-09T09:00:00.000Z',
                author: null,
                ai: { summary: '', readingTimeMin: 5, degraded: false },
                stats: { views: 0, commentsCount: 0, bookmarks: 0 },
              },
            ],
            total: 2,
            page: 2,
            limit: 1,
          },
        });
      }),
    );

    renderAt('campus_news');

    expect(await screen.findByRole('heading', { name: /article one/i })).toBeInTheDocument();
    expect(page1Called).toBe(true);

    const loadMore = screen.getByRole('button', { name: /load more/i });
    await user.click(loadMore);

    expect(await screen.findByRole('heading', { name: /article two/i })).toBeInTheDocument();
    expect(page2Called).toBe(true);
  });
});
