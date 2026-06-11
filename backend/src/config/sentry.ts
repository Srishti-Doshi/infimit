/**
 * Sentry SDK bootstrap — Sub-PR 5-e.
 *
 * Initialised exactly once at process boot from `server.ts`, BEFORE the
 * Express app is built. Conditional on `env.SENTRY_DSN`:
 *
 *   - DSN empty (the dev / test default): no-op. `captureException` does
 *     nothing. The rest of the codebase calls into this module
 *     unconditionally — keeps call sites symmetric and lets ops light up
 *     Sentry by setting one env var, without code changes.
 *   - DSN present: real init. Errors flowing through the global error
 *     handler get reported. Performance traces are sampled at 0 in P1
 *     (per the BE handler §7 — Phase 2 adds OpenTelemetry traces).
 *
 * Why no Sentry Express middleware: `@sentry/node` exports request /
 * tracing / error handlers that auto-instrument Express, but they need to
 * be registered in a specific order around our existing middleware stack.
 * The simpler integration — explicit `captureException` from the error
 * handler — covers the must-have signal (exceptions reach Sentry) without
 * touching the middleware order. We can promote to the auto-instrumented
 * variant if Phase 2 needs trace propagation.
 */
import * as Sentry from '@sentry/node';

import { loadEnv } from './env';
import { logger } from './logger';

let initialised = false;

export function initSentry(): void {
  if (initialised) return;
  const env = loadEnv();
  if (!env.SENTRY_DSN) {
    logger.info('sentry_disabled_no_dsn');
    initialised = true;
    return;
  }
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: process.env.npm_package_version ?? '0.1.0',
    // Phase 1: errors only. Traces stay at 0 — Phase 2 wires
    // OpenTelemetry once we have a clearer perf-investigation story.
    tracesSampleRate: 0,
    sendDefaultPii: false,
  });
  initialised = true;
  logger.info({ env: env.NODE_ENV }, 'sentry_initialised');
}

/**
 * Report an exception to Sentry, no-op if SDK never initialised (no DSN).
 * The error handler middleware (5xx branch) calls this — see
 * `middleware/errorHandler.ts`. Extra context is merged into Sentry's
 * `extra` payload.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (!initialised || !loadEnv().SENTRY_DSN) return;
  Sentry.withScope((scope) => {
    if (context) {
      for (const [k, v] of Object.entries(context)) {
        scope.setExtra(k, v);
      }
    }
    Sentry.captureException(err);
  });
}

/**
 * Flush pending events before the process exits. Called from the graceful
 * shutdown path so we don't lose the last burst of errors when an
 * orchestrator sends SIGTERM. No-op when Sentry never initialised.
 */
export async function flushSentry(timeoutMs = 2000): Promise<void> {
  if (!initialised || !loadEnv().SENTRY_DSN) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch (err) {
    // Don't let a flush failure block shutdown.
    logger.warn({ err }, 'sentry_flush_failed');
  }
}

/** Test-only: reset the init flag so a fresh test can re-init. */
export function __resetSentryForTests(): void {
  initialised = false;
}
