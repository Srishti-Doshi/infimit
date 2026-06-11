/**
 * `<BookmarkButton>` integration (Sub-PR 5-fd) — covers:
 *   - Unauthed click triggers the sign-in toast (no POST fires)
 *   - Authed user with no existing bookmark POSTs and flips to Saved
 *   - Authed user with an existing bookmark DELETEs and flips to Save
 *   - aria-pressed mirrors the saved state
 */
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { toast } from 'sonner';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BookmarkButton } from '@/components/bookmark-button';
import { server } from '@/mocks/server';
import { useAuthStore } from '@/store/auth-store';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

const SAVED_ARTICLE_ID = 'art_demo_001';
const UNSAVED_ARTICLE_ID = 'art_fresh_999';

afterEach(() => {
  useAuthStore.getState().clear();
});

function signInAsReader(): void {
  useAuthStore.getState().setSession('tok', {
    id: 'usr_test_001',
    name: 'Test Reader',
    email: 'reader@infimit.test',
    role: 'reader',
  });
}

describe('<BookmarkButton>', () => {
  it('prompts sign-in when an unauthed user clicks (no POST fires)', async () => {
    const user = userEvent.setup();
    let postCalled = false;
    const infoSpy = vi.spyOn(toast, 'info').mockImplementation(() => 'toast-id');
    server.use(
      http.get(`${BASE}/bookmarks`, () =>
        HttpResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in' } },
          { status: 401 },
        ),
      ),
      http.post(`${BASE}/bookmarks/:id`, () => {
        postCalled = true;
        return HttpResponse.json({ success: true, data: {} });
      }),
    );

    renderWithProviders(<BookmarkButton articleId={UNSAVED_ARTICLE_ID} />);

    const button = screen.getByRole('button', { name: /save/i });
    expect(button).toHaveAttribute('aria-pressed', 'false');
    await user.click(button);

    expect(infoSpy).toHaveBeenCalledWith('Sign in to save articles', expect.any(Object));
    expect(postCalled).toBe(false);
    infoSpy.mockRestore();
  });

  it('POSTs and flips to Saved when an authed user clicks an unsaved article', async () => {
    const user = userEvent.setup();
    let postArticleId: string | null = null;
    let listCallCount = 0;
    server.use(
      // First GET → empty (article not saved). Subsequent GETs (the
      // invalidation refetch after POST) include the new bookmark so the
      // button stays Saved after the server confirms.
      http.get(`${BASE}/bookmarks`, () => {
        listCallCount += 1;
        const items =
          listCallCount === 1
            ? []
            : [
                {
                  id: 'bm_new',
                  articleId: UNSAVED_ARTICLE_ID,
                  createdAt: '2026-06-12T00:00:00.000Z',
                  article: null,
                },
              ];
        return HttpResponse.json({
          success: true,
          data: { items, total: items.length, page: 1, limit: 100 },
        });
      }),
      http.post(`${BASE}/bookmarks/:id`, ({ params }) => {
        postArticleId = params.id as string;
        return HttpResponse.json({
          success: true,
          data: {
            bookmark: {
              id: 'bm_new',
              articleId: postArticleId,
              createdAt: '2026-06-12T00:00:00.000Z',
              article: null,
            },
          },
        });
      }),
    );
    signInAsReader();

    renderWithProviders(<BookmarkButton articleId={UNSAVED_ARTICLE_ID} />);

    // Wait for the list query to settle so the button knows the article
    // isn't yet bookmarked.
    await waitFor(() =>
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false'),
    );

    await user.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });
    expect(postArticleId).toBe(UNSAVED_ARTICLE_ID);
    expect(screen.getByRole('button', { name: /saved/i })).toBeInTheDocument();
  });

  it('DELETEs and flips back to Save when an authed user clicks an already-saved article', async () => {
    const user = userEvent.setup();
    let deleteArticleId: string | null = null;
    let listCallCount = 0;
    server.use(
      http.get(`${BASE}/bookmarks`, () => {
        listCallCount += 1;
        // First call: article is bookmarked. Subsequent calls (invalidation
        // after the DELETE) return empty so the button flips visually.
        const items =
          listCallCount === 1
            ? [
                {
                  id: 'bm_pre',
                  articleId: SAVED_ARTICLE_ID,
                  createdAt: '2026-06-01T10:00:00.000Z',
                  article: null,
                },
              ]
            : [];
        return HttpResponse.json({
          success: true,
          data: { items, total: items.length, page: 1, limit: 100 },
        });
      }),
      http.delete(`${BASE}/bookmarks/:id`, ({ params }) => {
        deleteArticleId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    signInAsReader();

    renderWithProviders(<BookmarkButton articleId={SAVED_ARTICLE_ID} />);

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'true');
    });

    await user.click(screen.getByRole('button', { name: /saved/i }));

    await waitFor(() => {
      expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false');
    });
    expect(deleteArticleId).toBe(SAVED_ARTICLE_ID);
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });
});
