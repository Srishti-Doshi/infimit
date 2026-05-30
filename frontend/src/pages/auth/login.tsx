import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
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
import { login } from '@/lib/auth-api';
import { loginSchema, type LoginInput } from '@/lib/auth-schema';
import { mapToFieldError, toastError } from '@/lib/error-messages';
import { roleLanding } from '@/lib/role-landing';
import { useAuthStore } from '@/store/auth-store';
import type { ApiError } from '@/types/api';

/**
 * Login modal (route-driven). Renders over the page chrome via the Modal
 * primitive; closing (X / Esc / backdrop) returns to `?next` or home.
 *
 * Scope note: social sign-in ("Continue with Apple/Google") and "Stay logged
 * in" from the Figma are intentionally omitted — the Subphase 2 backend has no
 * OAuth, and the refresh cookie always persists for 30 days, so a session-mode
 * toggle would be a no-op. They return if/when the backend supports them.
 */
export default function LoginPage(): JSX.Element {
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
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const { mutate, isPending } = useMutation({
    mutationFn: login,
    onSuccess: ({ accessToken, user }) => {
      setSession(accessToken, user);
      toast.success(`Welcome back, ${user.name.split(' ')[0]}`);
      navigate(next ?? roleLanding(user.role), { replace: true });
    },
    onError: (error: ApiError['error']) => {
      const handled = mapToFieldError(error, setError, {
        INVALID_CREDENTIALS: { field: 'password', message: 'Email or password is incorrect.' },
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

        <ModalTitle className="mt-6 text-center">Login to your account</ModalTitle>
        <ModalDescription className="mt-2 text-center">
          Don&rsquo;t have an account?{' '}
          <Link
            to="/auth/register"
            className="font-medium text-brand-red-500 underline-offset-4 hover:underline"
          >
            Sign up
          </Link>
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

          <Input
            type={showPassword ? 'text' : 'password'}
            label="Password"
            placeholder="Your password"
            autoComplete="current-password"
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
            errorText={errors.password?.message}
            {...register('password')}
          />

          <div className="flex justify-end">
            <Link
              to="/auth/forgot-password"
              className="text-body-sm font-medium text-brand-red-500 underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          <Button
            type="submit"
            variant="secondary"
            size="lg"
            loading={isPending}
            className="mt-2 w-full"
          >
            Login
          </Button>
        </form>
      </ModalBody>
    </Modal>
  );
}
