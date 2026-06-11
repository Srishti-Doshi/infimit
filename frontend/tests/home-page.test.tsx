/**
 * HomePage integration (Sub-PR 5-fa) — covers:
 *   - Default MSW seed renders the featured carousel + Top Stories rail +
 *     Latest grid + Trending sidebar
 *   - Featured carousel uses the first article's title as the page's H1
 *   - Carousel renders prev / next controls and dot indicators when the BE
 *     returns more than one featured article
 *   - Carousel renders no controls when featured returns a single article
 *   - Featured hero omitted entirely when featured is an empty array
 *   - Latest empty state degrades gracefully
 *   - Trending block is omitted when the server returns []
 *   - Error path falls back to the retry surface
 *
 * MSW is configured globally via tests/setup.ts. Per-test handler overrides
 * via `server.use(...)` follow the same pattern as `article-page.test.tsx`.
 */
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';

import { server } from '@/mocks/server';
import HomePage from '@/pages/home';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

interface MockCardOverrides {
  id: string;
  slug: string;
  title: string;
  category?: string;
}

/** Helper for building a minimal FeedCard-shaped payload inside per-test
 * `server.use` overrides without depending on the fixture file. */
function mockCard(overrides: MockCardOverrides): unknown {
  return {
    id: overrides.id,
    slug: overrides.slug,
    title: overrides.title,
    subtitle: '',
    coverImageUrl: null,
    category: overrides.category ?? 'campus_news',
    location: '',
    publishedAt: '2026-05-01T10:00:00.000Z',
    author: { id: 'a', name: 'Author' },
    ai: { summary: '', readingTimeMin: 4, degraded: false },
    stats: { views: 0, commentsCount: 0, bookmarks: 0 },
  };
}

describe('<HomePage>', () => {
  it('renders the four sections from the default home feed', async () => {
    renderWithProviders(<HomePage />);

    // Featured carousel — first article's title is the page's primary heading.
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /ncea curriculum overhaul lands in 2026/i,
      }),
    ).toBeInTheDocument();

    // Top Stories rail beside the hero.
    expect(screen.getByLabelText(/top stories/i)).toBeInTheDocument();

    // Latest grid heading + at least one card.
    expect(screen.getByRole('heading', { name: /^latest stories$/i })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: /transformer-based tutors complete first classroom trial/i,
      }),
    ).toBeInTheDocument();

    // Trending sidebar rendered.
    expect(screen.getByRole('heading', { name: /^trending$/i })).toBeInTheDocument();
  });

  it('renders carousel controls (prev / next + dot indicators) when featured has multiple articles', async () => {
    renderWithProviders(<HomePage />);

    // Wait for the first slide to render (default fixture has 3 featured).
    await screen.findByRole('heading', {
      level: 1,
      name: /ncea curriculum overhaul lands in 2026/i,
    });

    expect(screen.getByRole('button', { name: /previous featured story/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next featured story/i })).toBeInTheDocument();

    // 3 dot indicators (3 featured items in default fixture).
    const dots = screen.getAllByRole('tab');
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('advances to the next slide when the Next button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<HomePage />);

    await screen.findByRole('heading', {
      level: 1,
      name: /ncea curriculum overhaul lands in 2026/i,
    });

    await user.click(screen.getByRole('button', { name: /next featured story/i }));

    // Second featured fixture is the transformer-tutors article.
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /transformer-based tutors complete first classroom trial/i,
      }),
    ).toBeInTheDocument();
  });

  it('omits carousel controls when featured returns a single article', async () => {
    server.use(
      http.get(`${BASE}/articles/feed/home`, () =>
        HttpResponse.json({
          success: true,
          data: {
            feed: {
              trail: [],
              featured: [
                mockCard({ id: 'f1', slug: 'only-featured', title: 'Only featured article' }),
              ],
              latest: [mockCard({ id: 'l1', slug: 'latest-1', title: 'A latest card' })],
              trending: [],
            },
          },
        }),
      ),
    );

    renderWithProviders(<HomePage />);
    await screen.findByRole('heading', { level: 1, name: /only featured article/i });

    // Single-slide → carousel nav controls are NOT rendered.
    expect(screen.queryByRole('button', { name: /previous featured story/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /next featured story/i })).toBeNull();
    expect(screen.queryAllByRole('tab')).toHaveLength(0);
  });

  it('omits the featured hero entirely when featured is an empty array', async () => {
    server.use(
      http.get(`${BASE}/articles/feed/home`, () =>
        HttpResponse.json({
          success: true,
          data: {
            feed: {
              trail: [],
              featured: [],
              latest: [mockCard({ id: 'l1', slug: 'latest-only', title: 'Only a latest card' })],
              trending: [],
            },
          },
        }),
      ),
    );

    renderWithProviders(<HomePage />);
    expect(await screen.findByRole('heading', { name: /^latest stories$/i })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByRole('heading', { name: /^trending$/i })).toBeNull();
  });

  it('renders the "no published articles" placeholder when latest is empty', async () => {
    server.use(
      http.get(`${BASE}/articles/feed/home`, () =>
        HttpResponse.json({
          success: true,
          data: {
            feed: { trail: [], featured: [], latest: [], trending: [] },
          },
        }),
      ),
    );

    renderWithProviders(<HomePage />);
    expect(await screen.findByText(/no published articles yet/i)).toBeInTheDocument();
  });

  it('renders an error surface with a retry button when the feed call 500s', async () => {
    server.use(
      http.get(`${BASE}/articles/feed/home`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'INTERNAL_ERROR', message: 'boom' } },
          { status: 500 },
        ),
      ),
    );

    renderWithProviders(<HomePage />);
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });
});
