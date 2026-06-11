/**
 * SearchPage integration (Sub-PR 5-fb) — covers:
 *   - Empty `?q=` shows the prompt state
 *   - Submitting a query updates the URL and renders results
 *   - 0-result query renders the "No results" message
 *   - Error state surfaces with a retry button
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import SearchPage from '@/pages/search';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function renderAt(entry = '/search'): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <Routes>
      <Route path="/search" element={<SearchPage />} />
    </Routes>,
    { initialEntries: [entry] },
  );
}

describe('<SearchPage>', () => {
  it('shows the empty prompt when no `q` is in the URL', () => {
    renderAt('/search');
    expect(screen.getByText(/search infimit/i)).toBeInTheDocument();
    expect(screen.getByText(/type a title, keyword, or tag/i)).toBeInTheDocument();
  });

  it('renders results when `q` is set in the URL', async () => {
    server.use(
      http.get(`${BASE}/search`, () =>
        HttpResponse.json({
          success: true,
          data: {
            items: [
              {
                id: 'hit-1',
                title: 'Education funding lands in 2026',
                slug: 'education-funding-2026',
                subtitle: 'Why it matters',
                category: 'education_policy',
                coverImageUrl: null,
                publishedAt: '2026-05-10T09:00:00.000Z',
                author: { id: 'u1', name: 'Author One' },
                ai: {
                  summary: '',
                  readingTimeMin: 6,
                  degraded: false,
                  keywords: [],
                  ttsAudioUrl: null,
                  model: '',
                },
                status: 'published',
                authorId: 'u1',
                version: 0,
                createdAt: '2026-05-01T09:00:00.000Z',
                updatedAt: '2026-05-10T09:00:00.000Z',
              },
            ],
            total: 1,
            page: 1,
            limit: 20,
          },
        }),
      ),
    );

    renderAt('/search?q=education');

    expect(
      await screen.findByRole('heading', { name: /education funding lands in 2026/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/1 result for/i)).toBeInTheDocument();
  });

  it('shows "No results" when the query returns an empty list', async () => {
    server.use(
      http.get(`${BASE}/search`, () =>
        HttpResponse.json({
          success: true,
          data: { items: [], total: 0, page: 1, limit: 20 },
        }),
      ),
    );

    renderAt('/search?q=zzz-no-match');

    expect(await screen.findByText(/no results/i)).toBeInTheDocument();
    expect(screen.getByText(/nothing matched/i)).toBeInTheDocument();
  });

  it('submitting the form updates the URL and triggers a new search', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(`${BASE}/search`, ({ request }) => {
        const url = new URL(request.url);
        const q = url.searchParams.get('q') ?? '';
        return HttpResponse.json({
          success: true,
          data: {
            items:
              q === 'curriculum'
                ? [
                    {
                      id: 'm1',
                      title: 'Curriculum overhaul',
                      slug: 'curriculum-overhaul',
                      subtitle: '',
                      category: 'education_policy',
                      coverImageUrl: null,
                      publishedAt: '2026-05-10T09:00:00.000Z',
                      author: null,
                      ai: {
                        summary: '',
                        readingTimeMin: 5,
                        degraded: false,
                        keywords: [],
                        ttsAudioUrl: null,
                        model: '',
                      },
                      status: 'published',
                      authorId: 'u1',
                      version: 0,
                      createdAt: '2026-05-01T09:00:00.000Z',
                      updatedAt: '2026-05-10T09:00:00.000Z',
                    },
                  ]
                : [],
            total: q === 'curriculum' ? 1 : 0,
            page: 1,
            limit: 20,
          },
        });
      }),
    );

    renderAt('/search');

    // Empty prompt visible initially.
    expect(screen.getByText(/search infimit/i)).toBeInTheDocument();

    const input = screen.getByRole('searchbox');
    await user.type(input, 'curriculum');
    await user.click(screen.getByRole('button', { name: /search/i }));

    expect(
      await screen.findByRole('heading', { name: /curriculum overhaul/i }),
    ).toBeInTheDocument();
  });

  it('renders the error surface with a retry button on search failure', async () => {
    server.use(
      http.get(`${BASE}/search`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    renderAt('/search?q=anything');

    expect(await screen.findByText(/search failed/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
