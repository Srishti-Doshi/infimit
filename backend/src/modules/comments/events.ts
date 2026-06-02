/**
 * Typed comment events.
 *
 * One event for Subphase 4: `comment.approved`, fired when an editor / admin
 * (or in Phase 2, the AI moderator) flips a pending comment to approved.
 * The notifications module subscribes to this and notifies the article's
 * author that a new comment is live on their piece.
 *
 * Stub audit-log listener registered here so the audit trail records every
 * approval even before the real notifications module is wired up. When PR #11
 * (this PR) adds the notifications module, it subscribes IN ADDITION to (not
 * replacing) this audit line.
 */
import { EventEmitter } from 'node:events';

import { auditLog } from '@/shared/audit';

export interface CommentApprovedPayload {
  commentId: string;
  articleId: string;
  articleAuthorId: string;
  commenterId: string;
  commenterName: string;
}

interface CommentEvents {
  'comment.approved': [CommentApprovedPayload];
}

class CommentEventBus extends EventEmitter<CommentEvents> {}

export const commentEvents = new CommentEventBus();

/**
 * Register module-local listeners. Called once at boot from
 * `@/modules/events/index.ts`.
 */
export function registerCommentEventListeners(): void {
  commentEvents.on('comment.approved', (payload) => {
    auditLog(
      {
        entity: 'comment',
        entityId: payload.commentId,
        action: 'article_author_notified_new_comment',
        actor: payload.commenterId,
        details: {
          articleId: payload.articleId,
          recipient: payload.articleAuthorId,
          channel: 'stub',
        },
      },
      'comment_article_author_notified',
    );
  });
}
