import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import ArticlePage from '@/pages/article';
import { useAuthStore } from '@/store/auth-store';
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
 *
 * The AI summary is gated behind sign-in (F22): logged-out readers see a
 * "Sign in to read" teaser; signed-in readers get the collapsible summary.
 */

/** Sign in as a reader so the gated AI summary renders. */
function signIn(): void {
  useAuthStore.setState({
    user: { id: 'u_reader_1', name: 'Demo Reader', email: 'reader@infimit.test', role: 'reader' },
    accessToken: 'tok',
    isHydrated: true,
  });
}

beforeEach(() => {
  // Default to logged-out; the summary tests opt in via signIn().
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: true });
});

afterEach(() => {
  useAuthStore.setState({ user: null, accessToken: null, isHydrated: false });
});

describe('<ArticlePage>', () => {
  it('renders title, byline, AI summary, body, and the comments thread', async () => {
    signIn();
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

    // AI summary card pulls from `article.ai.summary` (collapsed by default,
    // so present in the DOM but not visible until expanded — see toggle test).
    expect(screen.getByText(/adoption is uneven across institutions/i)).toBeInTheDocument();

    // Comments heading from the mounted <CommentThread>. findBy*: the
    // thread mounts a tick after first paint (deferred below-the-fold
    // section) and arrives via a lazy() chunk.
    expect(await screen.findByRole('heading', { name: /comments/i })).toBeInTheDocument();
  });

  it('keeps the AI summary collapsed by default and reveals it on click', async () => {
    const user = userEvent.setup();
    signIn();
    renderAt('how-indian-campuses-adopted-ai-tutoring');

    const toggle = await screen.findByRole('button', { name: /ai summary/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Mounted for SEO/crawlers + valid aria-controls, but hidden until opened.
    const summary = screen.getByText(/adoption is uneven across institutions/i);
    expect(summary).not.toBeVisible();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(summary).toBeVisible();
  });

  it('gates the AI summary behind sign-in for logged-out readers', async () => {
    renderAt('how-indian-campuses-adopted-ai-tutoring');

    // Page loads (title), then the gate is shown instead of the summary.
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /how indian campuses adopted ai tutoring/i,
      }),
    ).toBeInTheDocument();

    expect(screen.getByText(/sign in to read/i)).toBeInTheDocument();
    // "Create account" is unique to the gate's CTA pair (the bookmark button
    // also renders a "sign in" affordance, so /sign in/ is ambiguous here).
    expect(screen.getByRole('link', { name: /create account/i })).toBeInTheDocument();
    // The summary text never reaches the DOM for logged-out readers, and there
    // is no collapse toggle.
    expect(screen.queryByText(/adoption is uneven across institutions/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /ai summary/i })).not.toBeInTheDocument();
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
