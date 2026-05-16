/**
 * In-process event bus — pub/sub for cross-module signals.
 *
 * Per docs/03-module-breakdown.md §3.5, modules emit events on state
 * transitions; the notifications and analytics modules subscribe.
 *
 * Stays in-process for Phase 1. Phase 2 swaps the implementation for
 * a BullMQ-backed queue without changing call sites (event names + payloads
 * are the public contract — keep them stable).
 */
import { EventEmitter } from 'node:events';
import { logger } from '@/config/logger';

export type DomainEventName =
  | 'article.submitted'
  | 'article.approved'
  | 'article.rejected'
  | 'article.published'
  | 'article.unpublished'
  | 'comment.posted'
  | 'comment.approved'
  | 'user.registered'
  | 'user.password_reset_requested';

// Each event name maps to a payload shape declared by its emitter module.
// Subphase 1 keeps these loose (`unknown`); modules narrow as they ship.
export interface DomainEventPayloads extends Record<DomainEventName, unknown> {
  'article.submitted': { articleId: string; authorId: string };
  'article.approved': { articleId: string; authorId: string; editorId: string };
  'article.rejected': { articleId: string; authorId: string; editorId: string; reason: string };
  'article.published': { articleId: string; authorId: string; category: string };
  'article.unpublished': { articleId: string; authorId: string };
  'comment.posted': { commentId: string; articleId: string; userId: string };
  'comment.approved': { commentId: string; articleId: string; userId: string };
  'user.registered': { userId: string; email: string };
  'user.password_reset_requested': { userId: string; token: string };
}

const emitter = new EventEmitter();
emitter.setMaxListeners(50);

export const events = {
  emit<E extends DomainEventName>(name: E, payload: DomainEventPayloads[E]): void {
    logger.debug({ event: name, payload }, 'event_emit');
    emitter.emit(name, payload);
  },

  on<E extends DomainEventName>(name: E, handler: (payload: DomainEventPayloads[E]) => void | Promise<void>): void {
    emitter.on(name, (payload) => {
      Promise.resolve(handler(payload as DomainEventPayloads[E])).catch((err) => {
        logger.error({ err, event: name }, 'event_handler_failed');
      });
    });
  },

  removeAllListeners(): void {
    emitter.removeAllListeners();
  },
};
