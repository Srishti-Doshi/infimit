/**
 * Email send — Subphase 2 STUB.
 *
 * Per Backend_Handler_Documentation_Subphase_2 §4, real SES integration is
 * deferred to Phase 2. For now we log the would-be email + the link to stdout
 * so frontend devs can copy-paste the verification / reset URL during local
 * testing.
 *
 * Audit-relevant: each send emits a Pino log line so we can verify the flow
 * fired during integration tests.
 */
import { logger } from '@/config/logger';

/**
 * Base URL the FE uses for verify / reset deep links. In a real send these
 * would come from a templated email; in dev, we just log them.
 *
 * Override via VITE_APP_URL or similar in Phase 2; for now hardcoded to the
 * dev frontend at :5173.
 */
const FE_BASE_URL = 'http://localhost:5173';

export function sendVerifyEmail(to: string, token: string): void {
  const url = `${FE_BASE_URL}/auth/verify-email?token=${token}`;
  logger.info({ to, verifyUrl: url, audit: false, stub: true }, 'email_verify_sent_stub');
}

export function sendPasswordResetEmail(to: string, token: string): void {
  const url = `${FE_BASE_URL}/auth/reset-password?token=${token}`;
  logger.info({ to, resetUrl: url, audit: false, stub: true }, 'email_password_reset_sent_stub');
}

export function sendEditorWelcomeEmail(to: string, token: string): void {
  const url = `${FE_BASE_URL}/auth/reset-password?token=${token}`;
  logger.info(
    { to, setPasswordUrl: url, audit: false, stub: true },
    'email_editor_welcome_sent_stub',
  );
}
