import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Eye, EyeOff, Lock, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Logo } from '@/components/layout/logo';
import { Button, Input, Modal, ModalBody, ModalDescription, ModalTitle } from '@/components/ui';
import { resetPassword } from '@/lib/auth-api';
import { resetPasswordSchema, type ResetPasswordInput } from '@/lib/auth-schema';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';

/**
 * Reset-password modal. `token` comes from the URL (`?token=…`); the form only
 * collects the new password + confirmation. On success we render an
 * interstitial success state with an explicit "Sign in" CTA — earlier
 * versions toast-and-redirected, but the toast disappeared too fast against
 * the immediate navigate and QA flagged the silent UX (#24). Backend
 * revokes all sessions on password change, so the user must sign in regardless.
 */
export default function ResetPasswordPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token');
  const [showPassword, setShowPassword] = useState(false);
  const [resetSucceeded, setResetSucceeded] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordInput>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: resetPassword,
    onSuccess: () => {
      setResetSucceeded(true);
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  return (
    <Modal open onOpenChange={(open) => !open && navigate('/', { replace: true })} size="md">
      <ModalBody className="px-6 py-8 sm:px-8">
        <div className="text-center">
          <Logo className="mx-auto" />
        </div>

        {!token ? (
          <>
            <XCircle className="mx-auto mt-6 h-10 w-10 text-status-error-text" aria-hidden="true" />
            <ModalTitle className="mt-4 text-center">Reset link missing</ModalTitle>
            <ModalDescription className="mt-2 text-center">
              This page is meant to be opened from a password-reset email.
            </ModalDescription>
            <Link
              to="/auth/forgot-password"
              className="mt-6 block text-center text-body-sm font-medium text-brand-red-500 underline-offset-4 hover:underline"
            >
              Request a new link
            </Link>
          </>
        ) : resetSucceeded ? (
          <>
            <CheckCircle2
              className="mx-auto mt-6 h-10 w-10 text-status-success-text"
              aria-hidden="true"
            />
            <ModalTitle className="mt-4 text-center">Password updated</ModalTitle>
            <ModalDescription className="mt-2 text-center">
              All previous sessions were signed out for safety. Sign in with your new password to
              continue.
            </ModalDescription>
            <div className="mt-6 flex justify-center">
              <Link to="/auth/login">
                <Button variant="secondary" size="lg">
                  Sign in
                </Button>
              </Link>
            </div>
          </>
        ) : (
          <>
            <ModalTitle className="mt-6 text-center">Reset your password</ModalTitle>
            <ModalDescription className="mt-2 text-center">
              Choose a new password to finish resetting your account.
            </ModalDescription>

            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={handleSubmit((v) => mutate({ token, password: v.password }))}
              noValidate
            >
              <Input
                type={showPassword ? 'text' : 'password'}
                label="New password"
                placeholder="At least 10 characters"
                autoComplete="new-password"
                iconLeft={<Lock className="h-4 w-4" aria-hidden="true" />}
                trailingAction={
                  <button
                    type="button"
                    onClick={() => setShowPassword((s) => !s)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    className="inline-flex rounded text-ink-tertiary transition-colors hover:text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red-500"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                }
                helperText="Use at least 10 characters with a letter and a number."
                errorText={errors.password?.message}
                {...register('password')}
              />

              <Input
                type={showPassword ? 'text' : 'password'}
                label="Confirm new password"
                autoComplete="new-password"
                iconLeft={<Lock className="h-4 w-4" aria-hidden="true" />}
                errorText={errors.confirmPassword?.message}
                {...register('confirmPassword')}
              />

              <Button
                type="submit"
                variant="secondary"
                size="lg"
                loading={isPending}
                className="mt-2 w-full"
              >
                Reset password
              </Button>
            </form>
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
