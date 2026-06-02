/**
 * Notification event listeners.
 *
 * Subscribes to the typed emitters in `@/modules/articles` and
 * `@/modules/comments` and persists in-app notifications via the
 * notifications service. The audit-log stubs in each module's `events.ts`
 * stay in place — they're the forensic record of WHO WOULD have been
 * notified, even if a downstream listener (this file) fails.
 *
 * Boot-time registration: `registerNotificationListeners()` is called once
 * from `@/modules/events/index.ts`. Re-calling would attach duplicate
 * listeners; guard with a module-local flag.
 *
 * Subphase 4 fans out to a small set:
 *   - article.{approved,rejected,published,unpublished} → article.author only
 *   - comment.approved                                  → article.author only
 *
 * Phase 1 doesn't fan out to broader audiences (subscribers, followers).
 * Phase 2 adds a queue + the larger fan-out per the Subphase 4 doc.
 *
 * Failures are caught + audit-warn'd so a Mongo hiccup in the listener
 * never crashes the publishing thread.
 */
import { Types } from 'mongoose';

import { auditWarn } from '@/shared/audit';
import { articleEvents } from '@/modules/articles';
import { commentEvents } from '@/modules/comments';

import { sendNotification } from './service';

let registered = false;

export function registerNotificationListeners(): void {
  if (registered) return;
  registered = true;

  // ─── article.approved → tell the author their work passed review ─────
  articleEvents.on('article.approved', (payload) => {
    void persistSafely(
      () =>
        sendNotification({
          userId: new Types.ObjectId(payload.authorId),
          type: 'article_approved',
          title: 'Your article was approved',
          body: `An editor approved your ${payload.category.replace(/_/g, ' ')} article. It will go live when published.`,
          link: `/articles/${payload.articleId}`,
          metadata: {
            articleId: payload.articleId,
            editorId: payload.editorId,
            category: payload.category,
          },
        }),
      'article_approved_notify',
      { articleId: payload.articleId, recipient: payload.authorId },
    );
  });

  // ─── article.rejected → tell the author with the rejection reason ────
  articleEvents.on('article.rejected', (payload) => {
    void persistSafely(
      () =>
        sendNotification({
          userId: new Types.ObjectId(payload.authorId),
          type: 'article_rejected',
          title: 'Your article needs revisions',
          body: payload.rejectionReason,
          link: `/articles/${payload.articleId}`,
          metadata: {
            articleId: payload.articleId,
            editorId: payload.editorId,
            category: payload.category,
            rejectionReason: payload.rejectionReason,
          },
        }),
      'article_rejected_notify',
      { articleId: payload.articleId, recipient: payload.authorId },
    );
  });

  // ─── article.published → tell the author their piece is live ─────────
  // Phase 1 only notifies the author. Phase 2 adds bookmark-based subscriber
  // fan-out, capped at ~50, via a background queue (per Subphase 4 doc §10).
  articleEvents.on('article.published', (payload) => {
    void persistSafely(
      () =>
        sendNotification({
          userId: new Types.ObjectId(payload.authorId),
          type: 'article_published',
          title: 'Your article is now live',
          body: `Your ${payload.category.replace(/_/g, ' ')} article was published.`,
          link: `/articles/slug/${payload.slug}`,
          metadata: {
            articleId: payload.articleId,
            editorId: payload.editorId,
            category: payload.category,
            slug: payload.slug,
          },
        }),
      'article_published_notify',
      { articleId: payload.articleId, recipient: payload.authorId },
    );
  });

  // ─── article.unpublished → tell the author their piece was taken down ─
  articleEvents.on('article.unpublished', (payload) => {
    void persistSafely(
      () =>
        sendNotification({
          userId: new Types.ObjectId(payload.authorId),
          type: 'article_unpublished',
          title: 'Your article was unpublished',
          body: `Your ${payload.category.replace(/_/g, ' ')} article was taken offline by an admin.`,
          link: `/articles/${payload.articleId}`,
          metadata: {
            articleId: payload.articleId,
            adminId: payload.adminId,
            category: payload.category,
            slug: payload.slug,
          },
        }),
      'article_unpublished_notify',
      { articleId: payload.articleId, recipient: payload.authorId },
    );
  });

  // ─── comment.approved → tell the article's author there's a new comment ─
  commentEvents.on('comment.approved', (payload) => {
    // Skip self-comments: if the article's author commented on their own
    // piece, don't notify themselves.
    if (payload.commenterId === payload.articleAuthorId) return;
    void persistSafely(
      () =>
        sendNotification({
          userId: new Types.ObjectId(payload.articleAuthorId),
          type: 'new_comment',
          title: 'New comment on your article',
          body: `${payload.commenterName} commented on your article.`,
          link: `/articles/${payload.articleId}#comment-${payload.commentId}`,
          metadata: {
            articleId: payload.articleId,
            commentId: payload.commentId,
            commenterId: payload.commenterId,
            commenterName: payload.commenterName,
          },
        }),
      'comment_approved_notify',
      { commentId: payload.commentId, recipient: payload.articleAuthorId },
    );
  });
}

/**
 * Test-only: clears the registration guard + detaches the listeners we
 * attached. Used between integration test cases so each test starts with
 * a clean listener slate.
 */
export function resetNotificationListenersForTests(): void {
  articleEvents.removeAllListeners('article.approved');
  articleEvents.removeAllListeners('article.rejected');
  articleEvents.removeAllListeners('article.published');
  articleEvents.removeAllListeners('article.unpublished');
  commentEvents.removeAllListeners('comment.approved');
  registered = false;
}

/**
 * Run an async listener body and swallow + audit-warn any failure. A
 * notification-write hiccup must never crash the article-publish thread
 * (the audit-log stub in `articles/events.ts` is the forensic backup).
 */
async function persistSafely(
  action: () => Promise<unknown>,
  auditKind: string,
  context: Record<string, unknown>,
): Promise<void> {
  try {
    await action();
  } catch (err) {
    auditWarn(
      {
        entity: 'notification',
        action: `${auditKind}_failed`,
        details: {
          ...context,
          error: err instanceof Error ? err.message : String(err),
        },
      },
      'notification_listener_failed',
    );
  }
}
