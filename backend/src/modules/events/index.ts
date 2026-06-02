import { registerArticleEventListeners } from '@/modules/articles/events';
import { registerCommentEventListeners } from '@/modules/comments';
import { registerNotificationListeners } from '@/modules/notifications';
import { registerSearchListeners } from '@/modules/search';

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
 *   2. Cross-module listeners (notifications, search) last. They subscribe
 *      to article + comment events; they need the emitters to already exist.
 *
 * Subphase 3 added articles. Subphase 4 added comments (PR #11) + the
 * notifications module that fans out to in-app notifications for every
 * article + comment lifecycle event, and the search module's index hooks
 * on article.published / article.unpublished (PR #12).
 */
export function registerEventListeners(): void {
  registerArticleEventListeners();
  registerCommentEventListeners();
  registerNotificationListeners();
  registerSearchListeners();
}
