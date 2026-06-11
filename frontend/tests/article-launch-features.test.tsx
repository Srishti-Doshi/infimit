/**
 * Article launch features (Sub-PR 5-fe-1) — covers:
 *   - `view` analytics event fires after the 1 s debounce (and not before)
 *   - no `view` fires if the reader leaves before the debounce window
 *   - `read_complete` fires via the 2-min dwell timer with a durationMs
 *   - Download PDF anchor targets the BE pdf endpoint in a new tab
 *   - SocialShare renders 4 intent anchors + copy-link, click emits `share`
 *
 * Timer-based behaviours use vi.useFakeTimers; the hook is exercised
 * through a minimal harness component rather than the full ArticlePage so
 * the tests stay independent of the page's data fetching.
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DownloadPdfButton } from '@/components/download-pdf-button';
import { SocialShare } from '@/components/social-share';
import * as analyticsApi from '@/lib/analytics-api';
import { useArticleAnalytics } from '@/lib/use-article-analytics';
import { renderWithProviders } from '@/test/render';

const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

function AnalyticsHarness({ articleId }: { articleId: string | undefined }): JSX.Element {
  useArticleAnalytics(articleId);
  return <p>harness</p>;
}

describe('useArticleAnalytics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fires `view` after the 1s debounce, not before', () => {
    const spy = vi.spyOn(analyticsApi, 'trackEvent').mockResolvedValue();
    render(<AnalyticsHarness articleId="art_1" />);

    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(spy).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ type: 'view', articleId: 'art_1' }));
  });

  it('does not fire `view` when unmounted inside the debounce window', () => {
    const spy = vi.spyOn(analyticsApi, 'trackEvent').mockResolvedValue();
    const { unmount } = render(<AnalyticsHarness articleId="art_1" />);

    act(() => {
      vi.advanceTimersByTime(500);
    });
    unmount();
    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fires `read_complete` once via the 2-minute dwell timer with durationMs', () => {
    const spy = vi.spyOn(analyticsApi, 'trackEvent').mockResolvedValue();
    render(<AnalyticsHarness articleId="art_1" />);

    act(() => {
      vi.advanceTimersByTime(2 * 60 * 1_000 + 50);
    });

    const readCalls = spy.mock.calls.filter(([input]) => input.type === 'read_complete');
    expect(readCalls).toHaveLength(1);
    expect(readCalls[0]?.[0]).toEqual(
      expect.objectContaining({
        type: 'read_complete',
        articleId: 'art_1',
        durationMs: expect.any(Number),
      }),
    );
  });

  it('emits nothing when articleId is undefined (slug 404 path)', () => {
    const spy = vi.spyOn(analyticsApi, 'trackEvent').mockResolvedValue();
    render(<AnalyticsHarness articleId={undefined} />);
    act(() => {
      vi.advanceTimersByTime(3 * 60 * 1_000);
    });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('<DownloadPdfButton>', () => {
  it('renders an anchor at the BE pdf endpoint opening in a new tab', () => {
    render(<DownloadPdfButton articleId="art_42" />);
    const link = screen.getByRole('link', { name: /download pdf/i });
    expect(link).toHaveAttribute('href', `${BASE}/articles/art_42/pdf`);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringMatching(/noopener/));
  });
});

describe('<SocialShare>', () => {
  it('renders the 4 intent targets + copy-link, and a target click emits `share`', async () => {
    const spy = vi.spyOn(analyticsApi, 'trackEvent').mockResolvedValue();
    const user = userEvent.setup();
    renderWithProviders(<SocialShare articleId="art_7" title="Test headline" />);

    const x = screen.getByRole('link', { name: /share on x/i });
    expect(x).toHaveAttribute('href', expect.stringContaining('twitter.com/intent/tweet'));
    expect(screen.getByRole('link', { name: /share on facebook/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /share on linkedin/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /share on whatsapp/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /copy link/i })).toBeInTheDocument();

    // jsdom would try to navigate on anchor click — prevent default by
    // stripping the href for the interaction assertion.
    x.removeAttribute('href');
    await user.click(x);
    expect(spy).toHaveBeenCalledWith({ type: 'share', articleId: 'art_7' });
  });
});
