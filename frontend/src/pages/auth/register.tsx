import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, Mail, User } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { Logo } from '@/components/layout/logo';
import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalDescription,
  ModalTitle,
  toast,
} from '@/components/ui';
import { registerReader } from '@/lib/auth-api';
import { readerRegisterSchema, type ReaderRegisterInput } from '@/lib/auth-schema';
import { mapToFieldError, toastError } from '@/lib/error-messages';
import { roleLanding } from '@/lib/role-landing';
import { useAuthStore } from '@/store/auth-store';
import type { ApiError } from '@/types/api';

/**
 * Reader sign-up modal.
 *
 * Scope: readers only. The backend `/auth/register` endpoint also creates
 * authors when given `role: 'author'` + `organisationSlug`, but the public
 * signup form intentionally doesn't expose that — institutional/author
 * onboarding is its own flow (Subphase 3). Mobile-number and social sign-in
 * fields from the Figma are omitted: backend supports neither today.
 */
export default function RegisterPage(): JSX.Element {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');
  const setSession = useAuthStore((s) => s.setSession);
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<ReaderRegisterInput>({
    resolver: zodResolver(readerRegisterSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: registerReader,
    onSuccess: ({ accessToken, user }) => {
      setSession(accessToken, user);
      toast.success(`Welcome to Infimit, ${user.name.split(' ')[0]}`);
      navigate(next ?? roleLanding(user.role), { replace: true });
    },
    onError: (error: ApiError['error']) => {
      const handled = mapToFieldError(error, setError, {
        EMAIL_EXISTS: {
          field: 'email',
          message: 'An account with this email already exists. Try logging in.',
        },
        EMAIL_RECENTLY_DELETED: {
          field: 'email',
          message: 'This email was recently in use. Please use a different one.',
        },
      });
      if (!handled) toastError(error);
    },
  });

  return (
    <Modal
      open
      onOpenChange={(open) => {
        if (!open) navigate(next ?? '/', { replace: true });
      }}
      size="md"
    >
      <ModalBody className="px-6 py-8 sm:px-8">
        <div className="text-center">
          <Logo className="mx-auto" />
        </div>

        <ModalTitle className="mt-6 text-center">Create your account</ModalTitle>
        <ModalDescription className="mt-2 text-center">
          Already have an account?{' '}
          <Link
            to="/auth/login"
            className="font-medium text-brand-red-500 underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </ModalDescription>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={handleSubmit((v) => mutate(v))}
          noValidate
        >
          <Input
            type="text"
            label="Name"
            placeholder="Your full name"
            autoComplete="name"
            iconLeft={<User className="h-4 w-4" aria-hidden="true" />}
            errorText={errors.name?.message}
            {...register('name')}
          />

          <Input
            type="email"
            label="Email"
            placeholder="you@example.com"
            autoComplete="email"
            iconLeft={<Mail className="h-4 w-4" aria-hidden="true" />}
            errorText={errors.email?.message}
            {...register('email')}
          />

          <Input
            type={showPassword ? 'text' : 'password'}
            label="Password"
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

          <Button
            type="submit"
            variant="secondary"
            size="lg"
            loading={isPending}
            className="mt-2 w-full"
          >
            Sign up
          </Button>
        </form>
      </ModalBody>
    </Modal>
  );
}
