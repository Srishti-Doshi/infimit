/**
 * Typed article events.
 *
 * Six lifecycle events, emitted by the service layer on every state change.
 * Subscribers attach via `registerArticleEventListeners()` (boot-time, from
 * `@/modules/events/index.ts`) for module-local handlers, or by importing
 * the `articleEvents` emitter and `.on(...)`-ing from another module.
 *
 * Subphase 3: created, submitted.
 * Subphase 4 (this PR + PR #11): approved, rejected, published, unpublished.
 *
 * Subphase 4 stub listeners audit-log the cross-module side effects (editor
 * notifications, author notifications, subscriber fan-out) so the audit trail
 * records who would have been notified. The real `notifications` module
 * subscribes in PR #11 and persists in-app notifications, replacing the
 * audit-log stubs in-place.
 */
import { EventEmitter } from 'node:events';

import { auditLog } from '@/shared/audit';

export interface ArticleCreatedPayload {
  articleId: string;
  authorId: string;
  category: string;
}

export interface ArticleSubmittedPayload {
  articleId: string;
  authorId: string;
  category: string;
  /** Editor IDs notified of the submission (audit-log only in Subphase 3). */
  notifyEditorIds: string[];
}

export interface ArticleApprovedPayload {
  articleId: string;
  authorId: string;
  editorId: string;
  category: string;
}

export interface ArticleRejectedPayload {
  articleId: string;
  authorId: string;
  editorId: string;
  category: string;
  rejectionReason: string;
}

export interface ArticlePublishedPayload {
  articleId: string;
  authorId: string;
  editorId: string;
  category: string;
  slug: string;
}

export interface ArticleUnpublishedPayload {
  articleId: string;
  authorId: string;
  adminId: string;
  category: string;
  slug: string;
}

interface ArticleEvents {
  'article.created': [ArticleCreatedPayload];
  'article.submitted': [ArticleSubmittedPayload];
  'article.approved': [ArticleApprovedPayload];
  'article.rejected': [ArticleRejectedPayload];
  'article.published': [ArticlePublishedPayload];
  'article.unpublished': [ArticleUnpublishedPayload];
}

class ArticleEventBus extends EventEmitter<ArticleEvents> {}

export const articleEvents = new ArticleEventBus();

/**
 * Register module-local listeners. Called once at boot from app.ts via the
 * shared events bus. The listeners below are Subphase 4 STUBS — they audit-
 * log the recipients of each notification fan-out. In PR #11 the real
 * `notifications` module subscribes in addition (not in place) and persists
 * in-app notifications; the audit-log lines stay as a forensic record.
 */
export function registerArticleEventListeners(): void {
  articleEvents.on('article.submitted', (payload) => {
    auditLog(
      {
        entity: 'article',
        entityId: payload.articleId,
        action: 'editors_notified',
        actor: payload.authorId,
        details: {
          category: payload.category,
          recipients: payload.notifyEditorIds,
          channel: 'stub',
        },
      },
      'article_editors_notified',
    );
  });

  // article.approved — notify the author their work passed review.
  articleEvents.on('article.approved', (payload) => {
    auditLog(
      {
        entity: 'article',
        entityId: payload.articleId,
        action: 'author_notified_approved',
        actor: payload.editorId,
        details: { recipient: payload.authorId, category: payload.category, channel: 'stub' },
      },
      'article_author_notified_approved',
    );
  });

  // article.rejected — notify the author with the reason so they can revise.
  articleEvents.on('article.rejected', (payload) => {
    auditLog(
      {
        entity: 'article',
        entityId: payload.articleId,
        action: 'author_notified_rejected',
        actor: payload.editorId,
        details: {
          recipient: payload.authorId,
          category: payload.category,
          rejectionReason: payload.rejectionReason,
          channel: 'stub',
        },
      },
      'article_author_notified_rejected',
    );
  });

  // article.published — fan-out to subscribers. Subphase 4 stub: log who
  // WOULD be notified (the article's author plus their followers). PR #11
  // replaces this with the real notifications module + queued fan-out.
  articleEvents.on('article.published', (payload) => {
    auditLog(
      {
        entity: 'article',
        entityId: payload.articleId,
        action: 'subscribers_notified_published',
        actor: payload.editorId,
        details: {
          authorId: payload.authorId,
          category: payload.category,
          slug: payload.slug,
          channel: 'stub',
        },
      },
      'article_subscribers_notified_published',
    );
  });

  // article.unpublished — notify the author that their published piece was
  // taken down so they're not surprised by a missing URL.
  articleEvents.on('article.unpublished', (payload) => {
    auditLog(
      {
        entity: 'article',
        entityId: payload.articleId,
        action: 'author_notified_unpublished',
        actor: payload.adminId,
        details: {
          recipient: payload.authorId,
          category: payload.category,
          slug: payload.slug,
          channel: 'stub',
        },
      },
      'article_author_notified_unpublished',
    );
  });
}
