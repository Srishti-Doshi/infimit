import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Camera, LogOut } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';

import { Button, Card, CardBody, Container, Input, toast } from '@/components/ui';
import { logout, updateMe } from '@/lib/auth-api';
import { updateProfileSchema, type UpdateProfileInput } from '@/lib/auth-schema';
import { toastError } from '@/lib/error-messages';
import { useAuthStore } from '@/store/auth-store';
import type { ApiError } from '@/types/api';

/** Initials helper for the avatar — first letters of up to two name tokens. */
function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

/**
 * Profile page (`/dashboard/me`). Reads the live user from the auth store
 * (boot hydration / login put it there); name is editable, avatar is a stub
 * for Subphase 3, and Logout clears the session.
 */
export default function ProfilePage(): JSX.Element {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user?.name ?? '' },
  });

  const saveMutation = useMutation({
    mutationFn: updateMe,
    onSuccess: (updated) => {
      useAuthStore.setState({ user: updated });
      reset({ name: updated.name });
      toast.success('Profile updated');
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  const logoutMutation = useMutation({
    mutationFn: logout,
    // Either way (server reply or network blip), drop the local session — the
    // user has stated their intent to leave.
    onSettled: () => {
      useAuthStore.getState().clear();
      toast.success('Signed out');
      navigate('/', { replace: true });
    },
  });

  // `RequireAuth` guarantees a user reaches this route — but the store can be
  // momentarily null while the logout mutation flushes. Bail safely; hooks
  // above run unconditionally so React's hook order stays stable.
  if (!user) return <Container width="default" className="py-12" />;

  return (
    <Container width="default" className="py-12">
      <h1 className="font-display text-display-md font-semibold text-ink-primary">Profile</h1>
      <p className="mt-2 text-body-base text-ink-secondary">
        Your account details. Updates are saved to your Infimit profile.
      </p>

      <Card className="mt-8">
        <CardBody className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div
            className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface-rose-tint font-display text-display-sm font-semibold text-brand-red-600"
            aria-hidden="true"
          >
            {initialsOf(user.name)}
          </div>
          <div className="flex-1">
            <p className="font-display text-display-sm font-semibold text-ink-primary">
              {user.name}
            </p>
            <p className="text-body-sm text-ink-secondary">{user.email}</p>
            <p className="mt-1 text-body-xs font-medium uppercase tracking-wide text-brand-red-500">
              {user.role}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            iconLeft={<Camera className="h-4 w-4" aria-hidden="true" />}
            onClick={() => toast.info('Avatar upload arrives in Subphase 3.')}
          >
            Change avatar
          </Button>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardBody>
          <h2 className="font-display text-display-sm font-semibold text-ink-primary">Account</h2>
          <form
            className="mt-4 flex flex-col gap-4"
            onSubmit={handleSubmit((v) => saveMutation.mutate(v))}
            noValidate
          >
            <Input
              label="Name"
              placeholder="Your display name"
              autoComplete="name"
              errorText={errors.name?.message}
              {...register('name')}
            />
            <div>
              <p className="text-body-sm font-medium text-ink-primary">Email</p>
              <p className="mt-1.5 text-body-base text-ink-primary">{user.email}</p>
              <p className="mt-1 text-body-xs text-ink-tertiary">Email can&rsquo;t be changed.</p>
            </div>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={saveMutation.isPending}
                disabled={!isDirty}
              >
                Save changes
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card className="mt-6">
        <CardBody className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-display text-body-xl font-semibold text-ink-primary">Sign out</h2>
            <p className="text-body-sm text-ink-secondary">
              You&rsquo;ll need to sign in again to use your account.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            iconLeft={<LogOut className="h-4 w-4" aria-hidden="true" />}
            loading={logoutMutation.isPending}
            onClick={() => logoutMutation.mutate()}
          >
            Log out
          </Button>
        </CardBody>
      </Card>
    </Container>
  );
}
