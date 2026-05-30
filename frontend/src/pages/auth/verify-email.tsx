import { CheckCircle2, XCircle } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Logo } from '@/components/layout/logo';
import { Modal, ModalBody, ModalDescription, ModalTitle, Spinner } from '@/components/ui';
import { verifyEmail } from '@/lib/auth-api';

type Status = 'pending' | 'success' | 'error';

/**
 * Email-verify landing. Reads `?token=` from the URL, posts it once on mount,
 * and surfaces a pending/success/error state. No form — the link itself is the
 * action.
 */
export default function VerifyEmailPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState<Status>(token ? 'pending' : 'error');

  useEffect(() => {
    if (!token) return;
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
                <Link
                  to="/auth/login"
                  className="font-medium text-brand-red-500 underline-offset-4 hover:underline"
                >
                  Sign in
                </Link>
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
