import { registerArticleEventListeners } from '@/modules/articles/events';
import { registerCommentEventListeners } from '@/modules/comments';
import { registerNotificationListeners } from '@/modules/notifications';

/**
 * Register cross-module event listeners.
 *
 * Boot-time fanout: each module owns its own event registration helper; this
 * function calls each one so app.ts has a single hook to wire.
 *
 * Order matters slightly:
 *   1. Each module's OWN listeners first (the audit-log stubs). These are
 *      the forensic record of would-be notifications and run regardless of
 *      whether downstream subscribers succeed.
 *   2. Cross-module listeners (notifications) last. They subscribe to BOTH
 *      article and comment events; they need the emitters to already exist.
 *
 * Subphase 3 added articles. Subphase 4 (PR #11) adds comments + the
 * notifications module that fans out to in-app notifications for every
 * article + comment lifecycle event.
 */
export function registerEventListeners(): void {
  registerArticleEventListeners();
  registerCommentEventListeners();
  registerNotificationListeners();
}
