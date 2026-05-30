import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CheckCircle2, Mail } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';

import { Logo } from '@/components/layout/logo';
import { Button, Input, Modal, ModalBody, ModalDescription, ModalTitle } from '@/components/ui';
import { requestPasswordReset } from '@/lib/auth-api';
import { forgotPasswordSchema, type ForgotPasswordInput } from '@/lib/auth-schema';

/**
 * Forgot-password modal. Backend always returns 200 (anti-enumeration), so we
 * show the same confirmation regardless of whether the email exists.
 */
export default function ForgotPasswordPage(): JSX.Element {
  const navigate = useNavigate();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });

  const { mutate, isPending, isSuccess } = useMutation({
    mutationFn: requestPasswordReset,
  });

  return (
    <Modal open onOpenChange={(open) => !open && navigate('/', { replace: true })} size="md">
      <ModalBody className="px-6 py-8 sm:px-8">
        <div className="text-center">
          <Logo className="mx-auto" />
        </div>

        {isSuccess ? (
          <>
            <CheckCircle2
              className="mx-auto mt-6 h-10 w-10 text-status-success-text"
              aria-hidden="true"
            />
            <ModalTitle className="mt-4 text-center">Check your inbox</ModalTitle>
            <ModalDescription className="mt-2 text-center">
              If an account exists for that email, we&rsquo;ve sent a password-reset link. The link
              expires in one hour.
            </ModalDescription>
            <Link
              to="/auth/login"
              className="mt-6 block text-center text-body-sm font-medium text-brand-red-500 underline-offset-4 hover:underline"
            >
              Back to login
            </Link>
          </>
        ) : (
          <>
            <ModalTitle className="mt-6 text-center">Forgot your password?</ModalTitle>
            <ModalDescription className="mt-2 text-center">
              Enter your email and we&rsquo;ll send you a link to reset it.
            </ModalDescription>

            <form
              className="mt-6 flex flex-col gap-4"
              onSubmit={handleSubmit((v) => mutate(v))}
              noValidate
            >
              <Input
                type="email"
                label="Email"
                placeholder="you@example.com"
                autoComplete="email"
                iconLeft={<Mail className="h-4 w-4" aria-hidden="true" />}
                errorText={errors.email?.message}
                {...register('email')}
              />
              <Button
                type="submit"
                variant="secondary"
                size="lg"
                loading={isPending}
                className="mt-2 w-full"
              >
                Send reset link
              </Button>
              <Link
                to="/auth/login"
                className="text-center text-body-sm font-medium text-brand-red-500 underline-offset-4 hover:underline"
              >
                Back to login
              </Link>
            </form>
          </>
        )}
      </ModalBody>
    </Modal>
  );
}
