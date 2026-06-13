/**
 * `useArticleAnalytics(articleId, bodyRef?)` — emits reader-behaviour
 * events from the article page (Sub-PR 5-fe-1). Contract per the Subphase 5
 * FE handler doc §7 + `docs/03-module-breakdown.md` §3.2.7:
 *
 *   - `view` after a 1 s dwell. The debounce exists so a reader who
 *     immediately navigates away (mis-click, back button) doesn't count.
 *     Cleared on unmount.
 *   - `read_complete` when the reader scrolls past 90% of the ARTICLE BODY
 *     (not the whole document — comments and footer would otherwise push
 *     the threshold past where any real reader stops) OR stays 2 minutes —
 *     whichever comes first, at most once per mount. The BE's unique-reader
 *     gate (PR #108) dedupes repeat completes server-side for authed users;
 *     the once-per-mount ref keeps the client from spamming regardless.
 *
 * `bodyRef` should point at the article-body element. Reading progress is
 * `(viewportBottom - bodyTop) / bodyHeight` — i.e. how much of the body has
 * passed through the viewport. When the ref is absent (or unmounted), the
 * measurement falls back to whole-document fraction so the hook stays
 * usable standalone.
 *
 * All emits are `void trackEvent(...)` fire-and-forget; failures are
 * swallowed inside the client.
 */
import { useEffect, useRef, type RefObject } from 'react';

import { trackEvent } from './analytics-api';

const VIEW_DEBOUNCE_MS = 1_000;
const READ_DWELL_MS = 2 * 60 * 1_000;
const READ_SCROLL_FRACTION = 0.9;

export function useArticleAnalytics(
  articleId: string | undefined,
  bodyRef?: RefObject<HTMLElement>,
): void {
  const readCompleteFired = useRef(false);

  useEffect(() => {
    if (!articleId) return undefined;
    readCompleteFired.current = false;
    const mountedAt = Date.now();

    const viewTimer = window.setTimeout(() => {
      void trackEvent({
        type: 'view',
        articleId,
        referrer: document.referrer || undefined,
      });
    }, VIEW_DEBOUNCE_MS);

    function fireReadComplete(): void {
      if (readCompleteFired.current) return;
      readCompleteFired.current = true;
      void trackEvent({
        type: 'read_complete',
        articleId: articleId as string,
        durationMs: Date.now() - mountedAt,
      });
    }

    const dwellTimer = window.setTimeout(fireReadComplete, READ_DWELL_MS);

    function readFraction(): number {
      const body = bodyRef?.current;
      if (body) {
        const rect = body.getBoundingClientRect();
        if (rect.height <= 0) return 0;
        // How much of the body has scrolled past the viewport bottom edge.
        return (window.innerHeight - rect.top) / rect.height;
      }
      // Fallback: whole-document fraction (no body element available).
      const el = document.documentElement;
      const scrollable = el.scrollHeight - el.clientHeight;
      if (scrollable <= 0) return 0;
      return (el.scrollTop || document.body.scrollTop) / scrollable;
    }

    function onScroll(): void {
      if (readFraction() >= READ_SCROLL_FRACTION) {
        fireReadComplete();
        window.removeEventListener('scroll', onScroll);
      }
    }
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.clearTimeout(viewTimer);
      window.clearTimeout(dwellTimer);
      window.removeEventListener('scroll', onScroll);
    };
  }, [articleId, bodyRef]);
}
