import { registerArticleEventListeners } from '@/modules/articles/events';

/**
 * Register cross-module event listeners.
 *
 * Boot-time fanout: each module owns its own event registration helper; this
 * function calls each one so app.ts has a single hook to wire.
 *
 * Subphase 3: articles event listeners (the in-process stub that audit-logs
 * `article.submitted` recipients pending the real notifications module in
 * Subphase 4).
 */
export function registerEventListeners(): void {
  registerArticleEventListeners();
}
