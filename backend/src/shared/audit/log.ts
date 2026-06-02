/**
 * Audit log helper — single point of emission for state-changing events.
 *
 * Every line is a Pino `info` with `audit: true` so SIEM / log aggregators can
 * filter for them deterministically. Subphase 2 stays Pino-only; Phase 2+
 * pipes these into Sentry / a dedicated audit sink without touching call sites.
 *
 * Standard shape (per docs/11-devops.md §audit logging):
 *   {
 *     audit: true,
 *     entity:    'user' | 'organisation' | 'article' | ...,
 *     entityId:  '<ObjectId | external id>',     // optional for non-targeted events
 *     action:    'register' | 'login' | ...,
 *     actor:     '<userId who performed it>',    // optional; defaults to entityId for self-actions
 *     at:        '<ISO timestamp>',
 *     // ...arbitrary domain context
 *   }
 *
 * Keep `details` PII-free unless the event semantically requires it. Email
 * addresses are PII; user ids and roles are fine.
 */
import { logger } from '@/config/logger';

export type AuditEntity =
  | 'user'
  | 'organisation'
  | 'session'
  | 'article'
  | 'comment'
  | 'media'
  | 'notification';

export interface AuditEvent {
  entity: AuditEntity;
  /** Target entity id. Optional for not-targeted events (e.g. password-reset for unknown email). */
  entityId?: string;
  /** Verb describing what happened (snake_case). */
  action: string;
  /** Who performed the action. Defaults to `entityId` for self-actions if you choose to omit. */
  actor?: string;
  /** Extra structured context. Avoid raw PII. */
  details?: Record<string, unknown>;
}

/**
 * Emit a single audit-log line.
 *
 * @param event   The audit payload — entity, action, ids, optional details.
 * @param message Short Pino message string (snake_case). Used for human grep.
 */
export function auditLog(event: AuditEvent, message: string): void {
  logger.info(
    {
      audit: true,
      entity: event.entity,
      ...(event.entityId !== undefined ? { entityId: event.entityId } : {}),
      action: event.action,
      ...(event.actor !== undefined ? { actor: event.actor } : {}),
      ...(event.details ?? {}),
      at: new Date().toISOString(),
    },
    message,
  );
}

/**
 * Same shape as `auditLog`, but emitted at WARN level. Used for events that
 * indicate adversarial behaviour (brute-force lockouts, replay detection,
 * unauthorised access attempts) so they're surfaced in default log filters.
 */
export function auditWarn(event: AuditEvent, message: string): void {
  logger.warn(
    {
      audit: true,
      entity: event.entity,
      ...(event.entityId !== undefined ? { entityId: event.entityId } : {}),
      action: event.action,
      ...(event.actor !== undefined ? { actor: event.actor } : {}),
      ...(event.details ?? {}),
      at: new Date().toISOString(),
    },
    message,
  );
}
