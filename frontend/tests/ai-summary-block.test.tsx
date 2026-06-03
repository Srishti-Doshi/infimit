import { useQuery } from '@tanstack/react-query';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import { AISummaryBlock } from '@/components/editor/ai-summary-block';
import { server } from '@/mocks/server';
import { renderWithProviders } from '@/test/render';
import type { Article } from '@/types/article';

/**
 * Wraps `<AISummaryBlock>` with the same `useQuery` subscription pattern
 * the preview page uses in production — that way `queryClient.setQueryData`
 * updates inside the regenerate mutation actually flow back into the
 * rendered tree, matching real-app behaviour.
 */
function HarnessedBlock({ initial }: { initial: Article }): JSX.Element | null {
  const { data: article } = useQuery({
    queryKey: ['articles', initial.id],
    queryFn: () => Promise.resolve(initial),
    initialData: initial,
  });
  return article ? <AISummaryBlock article={article} /> : null;
}

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * `<AISummaryBlock>` carries the FE-4b visible UX: render-guarded by status,
 * degraded badge when fallback summary, and force-regenerate via the
 * articles `/ai/summary` endpoint. Tests pin each.
 */

function makeArticle(overrides: Partial<Article> = {}): Article {
  return {
    id: 'art_test_001',
    title: 'A long-form piece on student housing',
    body: '<p>body</p>',
    plainText: 'body',
    coverImageUrl: null,
    coverImageMediaId: null,
    media: [],
    category: 'campus_news',
    subcategory: null,
    tags: ['housing', 'campus'],
    location: null,
    authorId: 'usr_x',
    organisationId: null,
    editorId: null,
    status: 'published',
    rejectionReason: null,
    placement: { featured: false, trending: false, trail: false, priority: 0 },
    ai: {
      summary: 'A concise overview of the housing reform piece.',
      keywords: ['housing'],
      readingTimeMin: 5,
      ttsAudioUrl: null,
      degraded: false,
      model: 'bart-large-cnn',
    },
    version: 4,
    submittedAt: '2026-05-20T08:00:00.000Z',
    publishedAt: '2026-05-22T14:00:00.000Z',
    approvedAt: '2026-05-22T10:00:00.000Z',
    createdAt: '2026-05-15T09:00:00.000Z',
    updatedAt: '2026-05-22T14:00:00.000Z',
    ...overrides,
  };
}

describe('<AISummaryBlock>', () => {
  it('renders nothing for pre-approval articles (drafts / submitted / rejected)', () => {
    const { container, rerender } = renderWithProviders(
      <AISummaryBlock article={makeArticle({ status: 'submitted', ai: undefined })} />,
    );
    expect(container).toBeEmptyDOMElement();

    rerender(<AISummaryBlock article={makeArticle({ status: 'draft', ai: undefined })} />);
    expect(container).toBeEmptyDOMElement();

    rerender(<AISummaryBlock article={makeArticle({ status: 'rejected', ai: undefined })} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the summary text + model byline when ai.summary is present', () => {
    renderWithProviders(<AISummaryBlock article={makeArticle()} />);

    expect(screen.getByRole('heading', { name: /ai summary/i })).toBeInTheDocument();
    expect(screen.getByText(/concise overview of the housing reform piece/i)).toBeInTheDocument();
    expect(screen.getByText(/bart-large-cnn/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeEnabled();
  });

  it('shows the degraded badge when ai.degraded is true', () => {
    renderWithProviders(
      <AISummaryBlock
        article={makeArticle({
          ai: {
            summary: 'Some fallback content the circuit breaker produced.',
            keywords: [],
            readingTimeMin: 0,
            ttsAudioUrl: null,
            degraded: true,
            model: 'circuit-open',
          },
        })}
      />,
    );

    expect(screen.getByText(/fallback summary — regenerate to retry/i)).toBeInTheDocument();
    expect(screen.getByText(/circuit-open/i)).toBeInTheDocument();
  });

  it('shows the awaiting-pipeline copy when approved but ai.summary is empty', () => {
    renderWithProviders(
      <AISummaryBlock article={makeArticle({ status: 'approved', ai: undefined })} />,
    );

    expect(
      screen.getByText(/ai pipeline is still running.*refresh in a moment/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /regenerate/i })).toBeEnabled();
  });

  it('regenerate calls POST /ai/summary with { force: true } and refreshes the summary', async () => {
    const user = userEvent.setup();
    const article = makeArticle();

    const calls: Array<{ body: unknown }> = [];
    server.use(
      http.post(`${BASE}/articles/:id/ai/summary`, async ({ request }) => {
        const body = await request.json();
        calls.push({ body });
        return HttpResponse.json({
          success: true,
          data: {
            article: {
              ...article,
              ai: {
                ...article.ai,
                summary: 'A FRESH summary after regeneration.',
                degraded: false,
                model: 'bart-large-cnn',
              },
              version: article.version + 1,
            },
          },
        });
      }),
    );

    renderWithProviders(<HarnessedBlock initial={article} />);
    await user.click(screen.getByRole('button', { name: /regenerate/i }));

    await waitFor(() =>
      expect(screen.getByText(/a fresh summary after regeneration/i)).toBeInTheDocument(),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]?.body).toEqual({ force: true });
  });

  it('surfaces a toast when the server responds AI_UNAVAILABLE', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${BASE}/articles/:id/ai/summary`, () =>
        HttpResponse.json(
          {
            success: false,
            error: { code: 'AI_UNAVAILABLE', message: 'AI service is unavailable' },
          },
          { status: 503 },
        ),
      ),
    );

    // Spy on toast.error to verify the centralized error mapping fires.
    const toastModule = await import('@/components/ui');
    const toastErrorSpy = vi.spyOn(toastModule.toast, 'error').mockImplementation(() => '');

    renderWithProviders(<AISummaryBlock article={makeArticle()} />);
    await user.click(screen.getByRole('button', { name: /regenerate/i }));

    await waitFor(() => expect(toastErrorSpy).toHaveBeenCalled());
    expect(toastErrorSpy.mock.calls[0]?.[0]).toMatch(/ai service is temporarily unavailable/i);

    toastErrorSpy.mockRestore();
  });
});
