import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import ArticlePage from '@/pages/article';
import { renderWithProviders } from '@/test/render';

/** Mount the article page under `/article/:slug` so `useParams` resolves. */
function renderAt(slug: string): ReturnType<typeof renderWithProviders> {
  return renderWithProviders(
    <Routes>
      <Route path="/article/:slug" element={<ArticlePage />} />
    </Routes>,
    { initialEntries: [`/article/${slug}`] },
  );
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * Public `/article/:slug` page. Default MSW seeds `art_published_001` with
 * the slug `how-indian-campuses-adopted-ai-tutoring`. Tests cover the
 * success path, the not-found path, and that the body is rendered via
 * <SanitizedHtml> (script stripped).
 */

describe('<ArticlePage>', () => {
  it('renders title, byline, AI summary, body, and the comments thread', async () => {
    renderAt('how-indian-campuses-adopted-ai-tutoring');

    // Heading uses the article title (level 1).
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /how indian campuses adopted ai tutoring/i,
      }),
    ).toBeInTheDocument();

    // Byline + category eyebrow.
    expect(screen.getByText(/by demo reader/i)).toBeInTheDocument();
    expect(screen.getByText(/research & innovation/i)).toBeInTheDocument();

    // AI summary card pulls from `article.ai.summary`.
    expect(screen.getByText(/adoption is uneven across institutions/i)).toBeInTheDocument();

    // Comments heading from the mounted <CommentThread>. findBy*: the
    // thread mounts a tick after first paint (deferred below-the-fold
    // section) and arrives via a lazy() chunk.
    expect(await screen.findByRole('heading', { name: /comments/i })).toBeInTheDocument();
  });

  it('renders the not-found state when the slug returns 404', async () => {
    server.use(
      http.get(`${BASE}/articles/slug/:slug`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Article not found' } },
          { status: 404 },
        ),
      ),
    );

    renderAt('does-not-exist');

    expect(await screen.findByText(/article not found/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to home/i })).toBeInTheDocument();
  });
});
