import { apiClient } from './api-client';

/**
 * Analytics tracker client (Sub-PR 5-fe-1).
 *
 * `POST /v1/analytics/track` is fire-and-forget on BOTH sides: the BE acks
 * 204 before persisting (writes are async server-side), and the FE never
 * awaits or surfaces failures — a dropped analytics event must never break
 * a reader flow. Hence `void trackEvent(...)` at every call site and the
 * silent catch here.
 *
 * The BE derives `userId` from the access token when present and ignores
 * any body-supplied user id. Anonymous readers are correlated via
 * `sessionId`, which we generate client-side once per browser and persist
 * in localStorage (not a cookie — no consent-banner implications for a
 * first-party random id, and the BE treats it as opaque).
 */

export type AnalyticsEventType = 'view' | 'read_complete' | 'share' | 'bookmark' | 'comment';

export interface TrackEventInput {
  type: AnalyticsEventType;
  articleId: string;
  durationMs?: number;
  referrer?: string;
}

const SESSION_ID_KEY = 'infimit_analytics_sid';

/**
 * Stable anonymous session id, generated once per browser. Falls back to a
 * per-pageload id when storage is unavailable (Safari private mode) — the
 * BE only requires the field to be a non-empty string.
 */
export function getAnalyticsSessionId(): string {
  try {
    const existing = localStorage.getItem(SESSION_ID_KEY);
    if (existing) return existing;
    const sid = crypto.randomUUID();
    localStorage.setItem(SESSION_ID_KEY, sid);
    return sid;
  } catch {
    return `ephemeral-${Math.random().toString(36).slice(2)}`;
  }
}

export async function trackEvent(input: TrackEventInput): Promise<void> {
  try {
    await apiClient.post('/analytics/track', {
      type: input.type,
      articleId: input.articleId,
      sessionId: getAnalyticsSessionId(),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.referrer ? { referrer: input.referrer } : {}),
    });
  } catch {
    // Analytics must never surface to the reader. Swallow everything.
  }
}
