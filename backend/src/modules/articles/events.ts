/**
 * Typed article events.
 *
 * Subphase 3 emits two events: `article.created` and `article.submitted`.
 * Subscribers attach in `src/shared/events/bus.ts` (cross-module event hub)
 * or via `registerArticleEventListeners()` below for module-local handlers.
 *
 * Subphase 4 will add `article.approved`, `article.rejected`, `article.published`,
 * `article.unpublished`. The events module signature stays stable — add new
 * payload interfaces, don't reshape existing ones.
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

interface ArticleEvents {
  'article.created': [ArticleCreatedPayload];
  'article.submitted': [ArticleSubmittedPayload];
}

class ArticleEventBus extends EventEmitter<ArticleEvents> {}

export const articleEvents = new ArticleEventBus();

/**
 * Register module-local listeners. Called once at boot from app.ts via the
 * shared events bus. The notification listener below is the Subphase 3 STUB —
 * it audit-logs the recipients. In Subphase 4 the real `notifications` module
 * subscribes here and persists in-app notifications + emails.
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
}
