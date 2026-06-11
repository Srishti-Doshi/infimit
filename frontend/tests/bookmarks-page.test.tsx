/**
 * BookmarksPage integration (Sub-PR 5-fd) — covers:
 *   - Loaded list renders one row per bookmark with the article title
 *   - Bookmark with `article: null` renders the Unavailable row
 *   - Empty list renders the "No bookmarks yet" empty state
 *   - 500 error renders the retry surface
 *   - Per-row Remove button DELETEs and updates the list
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import BookmarksPage from '@/pages/dashboard/me/bookmarks';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function signInAsReader(): void {
  useAuthStore.getState().setSession('tok', {
    id: 'usr_test_001',
    name: 'Test Reader',
    email: 'reader@infimit.test',
    role: 'reader',
  });
}

afterEach(() => {
  useAuthStore.getState().clear();
});

function renderPage(): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <Routes>
      <Route path="/dashboard/me/bookmarks" element={<BookmarksPage />} />
    </Routes>,
    { initialEntries: ['/dashboard/me/bookmarks'] },
  );
}

const cardOne = {
  id: 'art_demo_001',
  slug: 'global-higher-education-trends-2026',
  title: 'Global Higher Education Trends in 2026',
  subtitle: 'A look at the institutional shifts shaping universities worldwide this year.',
  coverImageUrl: null,
  category: 'research_innovation' as const,
  location: '',
  publishedAt: '2026-05-10T09:00:00.000Z',
  author: { id: 'usr_author_01', name: 'Ishita Mishra' },
  ai: { summary: '', readingTimeMin: 6, degraded: false },
  stats: { views: 0, commentsCount: 0, bookmarks: 1 },
};

describe('<BookmarksPage>', () => {
  it('renders one row per bookmark plus an Unavailable placeholder for null-article rows', async () => {
    signInAsReader();
    server.use(
      http.get(`${BASE}/bookmarks`, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                id: 'bm_1',
                articleId: cardOne.id,
                createdAt: '2026-06-01T10:00:00.000Z',
                article: cardOne,
              },
              {
                id: 'bm_orphan',
                articleId: 'art_unpublished_999',
                createdAt: '2026-05-15T10:00:00.000Z',
                article: null,
              },
            ],
            total: 2,
            page: 1,
            limit: 100,
          },
        }),
      ),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /global higher education trends/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/article unavailable/i)).toBeInTheDocument();
  });

  it('shows the empty state when the user has no bookmarks', async () => {
    signInAsReader();
    server.use(
      http.get(`${BASE}/bookmarks`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 100 },
        }),
      ),
    );

    renderPage();

    expect(await screen.findByText(/no bookmarks yet/i)).toBeInTheDocument();
    expect(screen.getByText(/tap save on any article/i)).toBeInTheDocument();
  });

  it('renders the retry surface on 500', async () => {
    signInAsReader();
    server.use(
      http.get(`${BASE}/bookmarks`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    renderPage();

    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('DELETEs the row when Remove is clicked and removes it from the visible list', async () => {
    signInAsReader();
    const user = userEvent.setup();
    let deleteCalled = false;
    let listCallCount = 0;
    server.use(
      http.get(`${BASE}/bookmarks`, () => {
        listCallCount += 1;
        const items =
          listCallCount === 1
            ? [
                {
                  id: 'bm_1',
                  articleId: cardOne.id,
                  createdAt: '2026-06-01T10:00:00.000Z',
                  article: cardOne,
                },
              ]
            : [];
        return HttpResponse.json({
          success: true,
          data: { items, total: items.length, page: 1, limit: 100 },
        });
      }),
      http.delete(`${BASE}/bookmarks/:id`, () => {
        deleteCalled = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderPage();

    expect(
      await screen.findByRole('heading', { name: /global higher education trends/i }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /remove from bookmarks/i }));

    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /global higher education trends/i }),
      ).not.toBeInTheDocument();
    });
    expect(deleteCalled).toBe(true);
    expect(await screen.findByText(/no bookmarks yet/i)).toBeInTheDocument();
  });
});
