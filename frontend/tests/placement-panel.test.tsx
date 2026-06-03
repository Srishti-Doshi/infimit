import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { PlacementPanel } from '@/components/editor/placement-panel';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render';
import type { Article } from '@/types/article';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * `<PlacementPanel>` is the most behavioural of the FE-4a components — it
 * mixes optimistic UI, debouncing, and version-aware OCC rollback. The
 * tests below pin each:
 *
 *  - render-guard: panel is null when status !== 'published'
 *  - collapse/expand interaction
 *  - debounced PATCH coalesces multiple toggles into one request
 *  - 409 VERSION_CONFLICT rolls local state back to last-known-good
 *
 * Real timers used throughout — fake timers + userEvent's internal setTimeout
 * usage deadlock under jsdom in vitest, and 500ms real-time per assertion is
 * cheap enough.
 */

function makePublishedArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'art_pub_001',
    title: 'A published piece',
    body: '<p>body</p>',
    plainText: 'body',
    coverImageUrl: null,
    coverImageMediaId: null,
    media: [],
    category: 'research_innovation',
    subcategory: null,
    tags: [],
    location: null,
    authorId: 'usr_x',
    organisationId: null,
    editorId: null,
    status: 'published',
    rejectionReason: null,
    placement: { featured: false, trending: false, trail: false, priority: 0 },
    version: 7,
    submittedAt: '2026-05-20T08:00:00.000Z',
    publishedAt: '2026-05-22T14:00:00.000Z',
    approvedAt: '2026-05-22T10:00:00.000Z',
    createdAt: '2026-05-15T09:00:00.000Z',
    updatedAt: '2026-05-22T14:00:00.000Z',
    ...overrides,
  };
}

describe('<PlacementPanel>', () => {
  it('renders nothing when the article is not published', () => {
    const { container } = renderWithProviders(
      <PlacementPanel article={makePublishedArticle({ status: 'submitted' })} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('starts collapsed and expands when the header is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PlacementPanel article={makePublishedArticle()} />);

    // Collapsed state — toggle controls are not visible.
    expect(screen.queryByLabelText(/featured/i)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { expanded: false })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { expanded: false }));

    expect(screen.getByLabelText(/featured/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/priority/i)).toBeInTheDocument();
  });

  it('PATCHes once after the 500ms debounce window, with the article version + new flags', async () => {
    const user = userEvent.setup();
    const article = makePublishedArticle();

    const patchSpy = vi.fn();
    server.use(
      http.patch(`${BASE}/articles/:id/placement`, async ({ request, params }) => {
        const body = (await request.json()) as Record<string, unknown>;
        patchSpy({ id: params.id, body });
        return HttpResponse.json({
          success: true,
          data: {
            article: {
              ...article,
              placement: {
                ...article.placement,
                ...(body as Partial<typeof article.placement>),
              },
              version: article.version + 1,
            },
          },
        });
      }),
    );

    renderWithProviders(<PlacementPanel article={article} />);
    await user.click(screen.getByRole('button', { expanded: false }));

    // Toggle two flags in quick succession; debounce coalesces them.
    await user.click(screen.getByLabelText(/featured/i));
    await user.click(screen.getByLabelText(/trending/i));

    // 500ms debounce + network turnaround. Generous timeout for CI variability.
    await waitFor(() => expect(patchSpy).toHaveBeenCalledTimes(1), { timeout: 2000 });

    expect(patchSpy).toHaveBeenCalledWith({
      id: article.id,
      body: expect.objectContaining({
        version: article.version,
        featured: true,
        trending: true,
      }),
    });
  });

  it('rolls local state back when the server responds 409 VERSION_CONFLICT', async () => {
    const user = userEvent.setup();
    const article = makePublishedArticle();

    server.use(
      http.patch(`${BASE}/articles/:id/placement`, () =>
        HttpResponse.json(
          {
            success: false,
            error: {
              code: 'VERSION_CONFLICT',
              message: 'Stale version',
              details: { currentVersion: article.version + 1 },
            },
          },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<PlacementPanel article={article} />);
    await user.click(screen.getByRole('button', { expanded: false }));

    const featured = screen.getByLabelText(/featured/i) as HTMLInputElement;
    expect(featured.checked).toBe(false);

    await user.click(featured);
    expect(featured.checked).toBe(true); // optimistic flip

    // Mutation rejects with 409 after debounce → onError rolls back.
    await waitFor(() => expect(featured.checked).toBe(false), { timeout: 2000 });
  });
});
