import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Logo } from '@/components/layout/logo';
import { Modal, ModalBody, ModalDescription, ModalTitle, Spinner } from '@/components/ui';
import { verifyEmail } from '@/lib/auth-api';
import { roleLanding } from '@/lib/role-landing';
import { useAuthStore } from '@/store/auth-store';

type Status = 'pending' | 'success' | 'error';

/**
 * Email-verify landing. Reads `?token=` from the URL, posts it once on mount,
 * and surfaces a pending/success/error state. No form — the link itself is the
 * action.
 *
 * Single-fire guard (#22): React 18 StrictMode runs effects twice in dev. The
 * backend's `consumeJti` (PR #61) is atomic via Redis SET NX, so the second
 * POST would correctly get 401 INVALID_TOKEN — but the FE would then race the
 * success and error `setStatus` calls and end up showing "Verification failed"
 * on a token that just verified successfully. The ref guard fires the consume
 * exactly once per token-value, regardless of how many times the effect runs.
 */
export default function VerifyEmailPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'error');
  const firedFor = useRef<string | null>(null);

  // #25: the post-success CTA used to always say "Sign in", but if the
  // visitor is already authenticated (registration auto-issues tokens and
  // the bootstrap rehydrates them) signing in again is pointless. Branch
  // the CTA on `user`: signed-in users get a "Continue to dashboard" link
  // routed to their role-aware landing; signed-out users get the existing
  // "Sign in" link.
  const user = useAuthStore((s) => s.user);

  useEffect(() => {
    if (!token || firedFor.current === token) return;
    firedFor.current = token;
    void (async () => {
      try {
        await verifyEmail(token);
        setStatus('success');
      } catch {
        setStatus('error');
      }
    })();
  }, [token]);

  return (
    <Modal open onOpenChange={(open) => !open && navigate('/', { replace: true })} size="md">
      <ModalBody className="px-6 py-8 text-center sm:px-8">
        <Logo className="mx-auto" />

        <div role="status" aria-live="polite">
          {status === 'pending' && (
            <>
              <Spinner size="lg" className="mt-6" label="Verifying your email" />
              <ModalTitle className="mt-4">Verifying your email&hellip;</ModalTitle>
              {/* sr-only: Radix warns when DialogContent has no Description (#26). */}
              <ModalDescription className="sr-only">
                Please wait while we confirm your verification link.
              </ModalDescription>
            </>
          )}

          {status === 'success' && (
            <>
              <CheckCircle2
                className="mx-auto mt-6 h-10 w-10 text-status-success-text"
                aria-hidden="true"
              />
              <ModalTitle className="mt-4">Email verified</ModalTitle>
              <ModalDescription className="mt-2">
                You&rsquo;re all set.{' '}
                {user ? (
                  <Link
                    to={roleLanding(user.role)}
                    className="font-medium text-brand-red-500 underline-offset-4 hover:underline"
                  >
                    Continue to dashboard
                  </Link>
                ) : (
                  <Link
                    to="/auth/login"
                    className="font-medium text-brand-red-500 underline-offset-4 hover:underline"
                  >
                    Sign in
                  </Link>
                )}
              </ModalDescription>
            </>
          )}

          {status === 'error' && (
            <>
              <XCircle
                className="mx-auto mt-6 h-10 w-10 text-status-error-text"
                aria-hidden="true"
              />
              <ModalTitle className="mt-4">Verification failed</ModalTitle>
              <ModalDescription className="mt-2">
                This link is invalid or has expired.{' '}
                <Link
                  to="/auth/forgot-password"
                  className="font-medium text-brand-red-500 underline-offset-4 hover:underline"
                >
                  Request a new one
                </Link>
              </ModalDescription>
            </>
          )}
        </div>
      </ModalBody>
    </Modal>
  );
}
