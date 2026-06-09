import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Search, ShieldCheck, UsersRound } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  CardBody,
  Container,
  EmptyState,
  Input,
  Modal,
  ModalBody,
  ModalDescription,
  ModalTitle,
  Skeleton,
  toast,
} from '@/components/ui';
import {
  createAuthor,
  listAuthors,
  lookupUserByEmail,
  updateUserRole,
  type ListedAuthor,
} from '@/lib/admin-api';
import {
  createAuthorSchema,
  lookupByEmailSchema,
  type CreateAuthorInput,
  type LookupByEmailInput,
} from '@/lib/admin-schema';
import { mapToFieldError, toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Role, User } from '@/types/auth';

/**
 * AdminAuthorsPage (`/dashboard/admin/authors`).
 *
 * Closes #33 — the missing admin UI for author/role management. Surfaces:
 *
 *   - Every active author (paginated server-side; we render the first page).
 *   - "Create author" — POST `/auth/register` with `role: 'author'`. The BE
 *     accepts this shape; the public signup form is reader-only on purpose.
 *   - "Promote by email" — GET `/users/lookup?email=…` for an existing
 *     reader (or any user), then opens the role-change modal pre-filled.
 *     This is the only path to elevate an existing reader; the previous
 *     QA workaround was direct MongoDB manipulation.
 *   - Per-row "Change role" — PATCH `/users/:id/role` with the new role.
 *     BE guards: admin can't change their own role; last active admin
 *     can't be demoted.
 *
 * Out of scope (deferred until QA flags them):
 *   - Pagination, search, sort across the author list.
 *   - Listing readers (no list-by-role endpoint for readers); the
 *     "Promote by email" flow is the substitute.
 *   - Soft-delete of authors (no admin endpoint yet; only `/editors/:id`
 *     supports admin-side soft delete today).
 */

const ROLE_LABELS: Record<Role, string> = {
  reader: 'Reader',
  author: 'Author',
  editor: 'Editor',
  admin: 'Admin',
};

export default function AdminAuthorsPage(): JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [promoteOpen, setPromoteOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<User | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'authors'],
    queryFn: listAuthors,
  });

  const invalidate = (): Promise<void> =>
    queryClient.invalidateQueries({ queryKey: ['admin', 'authors'] }).then(() => undefined);

  return (
    <Container width="default" className="py-12">
      <Link
        to="/dashboard/admin"
        className="inline-flex items-center gap-1 text-body-sm text-ink-secondary hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin console
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-display-md font-semibold text-ink-primary">Authors</h1>
          <p className="mt-1 text-body-sm text-ink-secondary">
            {data ? `${data.total} author${data.total === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            iconLeft={<Search className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setPromoteOpen(true)}
          >
            Promote by email
          </Button>
          <Button
            variant="primary"
            iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setCreateOpen(true)}
          >
            Create author
          </Button>
        </div>
      </div>

      <Card className="mt-6">
        <CardBody className="p-0">
          {isLoading ? (
            <SkeletonRows columns={4} rows={3} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="h-6 w-6" aria-hidden="true" />}
              title="No authors yet"
              description="Create the first author to bootstrap the editorial workflow."
              action={
                <Button
                  variant="primary"
                  iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => setCreateOpen(true)}
                >
                  Create author
                </Button>
              }
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Slug</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((author) => (
                  <AuthorRow
                    key={author.id}
                    author={author}
                    onChangeRole={() => setRoleTarget(author)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <CreateAuthorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void invalidate();
          setCreateOpen(false);
        }}
      />
      <PromoteByEmailModal
        open={promoteOpen}
        onClose={() => setPromoteOpen(false)}
        onResolved={(user) => {
          setPromoteOpen(false);
          setRoleTarget(user);
        }}
      />
      <ChangeRoleModal
        target={roleTarget}
        onClose={() => setRoleTarget(null)}
        onDone={() => {
          void invalidate();
          setRoleTarget(null);
        }}
      />
    </Container>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

interface AuthorRowProps {
  author: ListedAuthor;
  onChangeRole: () => void;
}

function AuthorRow({ author, onChangeRole }: AuthorRowProps): JSX.Element {
  return (
    <tr>
      <Td className="font-medium text-ink-primary">{author.name}</Td>
      <Td>{author.email}</Td>
      <Td>{author.slug ?? '—'}</Td>
      <Td className="text-right">
        <Button
          variant="ghost"
          size="sm"
          iconLeft={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          onClick={onChangeRole}
        >
          Change role
        </Button>
      </Td>
    </tr>
  );
}

// ── Create author modal ───────────────────────────────────────────────────

interface CreateProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateAuthorModal({ open, onClose, onCreated }: CreateProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateAuthorInput>({
    resolver: zodResolver(createAuthorSchema),
    defaultValues: { name: '', email: '', password: '', organisationSlug: '' },
  });

  const mutation = useMutation({
    mutationFn: createAuthor,
    onSuccess: () => {
      toast.success('Author created');
      reset();
      onCreated();
    },
    onError: (error: ApiError['error']) => {
      const handled = mapToFieldError(error, setError, {
        EMAIL_EXISTS: {
          field: 'email',
          message:
            'An account already exists for this email. Use "Promote by email" to change their role instead.',
        },
        EMAIL_RECENTLY_DELETED: {
          field: 'email',
          message: 'This email was recently in use; pick another or wait 30 days.',
        },
        ORG_NOT_FOUND: { field: 'organisationSlug', message: 'No organisation with that slug.' },
      });
      if (!handled) toastError(error);
    },
  });

  return (
    <Modal open={open} onOpenChange={(o) => !o && (onClose(), reset())} size="md">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>Create author</ModalTitle>
        <ModalDescription className="mt-1">
          The author receives credentials by email and can sign in immediately.
        </ModalDescription>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          noValidate
        >
          <Input
            label="Name"
            placeholder="Priya Sharma"
            autoComplete="name"
            errorText={errors.name?.message}
            {...register('name')}
          />
          <Input
            type="email"
            label="Email"
            placeholder="priya@infimit.com"
            autoComplete="email"
            errorText={errors.email?.message}
            {...register('email')}
          />
          <Input
            type="password"
            label="Starter password"
            placeholder="Min 10 chars, a letter, a number"
            autoComplete="new-password"
            errorText={errors.password?.message}
            {...register('password')}
          />
          <Input
            label="Organisation slug"
            placeholder="infimit-demo-college"
            helperText="Find slugs at Admin → Organisations."
            errorText={errors.organisationSlug?.message}
            {...register('organisationSlug')}
          />

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => (onClose(), reset())}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              Create author
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

// ── Promote-by-email modal ────────────────────────────────────────────────

interface PromoteProps {
  open: boolean;
  onClose: () => void;
  onResolved: (user: User) => void;
}

function PromoteByEmailModal({ open, onClose, onResolved }: PromoteProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<LookupByEmailInput>({
    resolver: zodResolver(lookupByEmailSchema),
    defaultValues: { email: '' },
  });

  const mutation = useMutation({
    mutationFn: ({ email }: LookupByEmailInput) => lookupUserByEmail(email),
    onSuccess: (user) => {
      reset();
      onResolved(user);
    },
    onError: (error: ApiError['error']) => {
      const handled = mapToFieldError(error, setError, {
        NOT_FOUND: { field: 'email', message: 'No active user with that email.' },
      });
      if (!handled) toastError(error);
    },
  });

  return (
    <Modal open={open} onOpenChange={(o) => !o && (onClose(), reset())} size="sm">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>Promote by email</ModalTitle>
        <ModalDescription className="mt-1">
          Look up an existing user by email — the role-change form opens next with their account
          pre-selected.
        </ModalDescription>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          noValidate
        >
          <Input
            type="email"
            label="Email"
            placeholder="reader@example.com"
            autoComplete="email"
            errorText={errors.email?.message}
            {...register('email')}
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => (onClose(), reset())}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              Find user
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

// ── Change-role modal ─────────────────────────────────────────────────────

interface ChangeRoleProps {
  target: User | null;
  onClose: () => void;
  onDone: () => void;
}

function ChangeRoleModal({ target, onClose, onDone }: ChangeRoleProps): JSX.Element {
  const [nextRole, setNextRole] = useState<Role>('author');

  const mutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => updateUserRole(id, role),
    onSuccess: (user) => {
      toast.success(`Role set to ${ROLE_LABELS[user.role]}`);
      onDone();
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  return (
    <Modal open={target !== null} onOpenChange={(o) => !o && onClose()} size="sm">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>Change role</ModalTitle>
        <ModalDescription className="mt-2">
          {target ? (
            <>
              Current role for <strong className="text-ink-primary">{target.name}</strong> (
              {target.email}) is{' '}
              <strong className="text-ink-primary">{ROLE_LABELS[target.role]}</strong>.
            </>
          ) : null}
        </ModalDescription>

        <p className="mt-3 text-body-xs text-ink-tertiary">
          Role changes are eventually consistent: the user&rsquo;s active session still carries the
          old role until they sign in again (or up to 15 min via natural token rotation).
        </p>

        <div className="mt-6 flex flex-col gap-2">
          <label className="text-body-sm font-medium text-ink-primary" htmlFor="next-role">
            New role
          </label>
          <select
            id="next-role"
            value={nextRole}
            onChange={(e) => setNextRole(e.target.value as Role)}
            className="rounded-md border border-line bg-surface px-3 py-2 text-body-sm text-ink-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-red-500"
          >
            <option value="reader">Reader</option>
            <option value="author">Author</option>
            <option value="editor">Editor</option>
            <option value="admin">Admin</option>
          </select>
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={mutation.isPending}
            disabled={!target || target.role === nextRole}
            onClick={() => target && mutation.mutate({ id: target.id, role: nextRole })}
          >
            {target && target.role === nextRole ? 'No change' : 'Apply'}
          </Button>
        </div>
      </ModalBody>
    </Modal>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function SkeletonRows({ columns, rows }: { columns: number; rows: number }): JSX.Element {
  return (
    <table className="min-w-full divide-y divide-line" aria-busy="true">
      <tbody className="divide-y divide-line">
        {Array.from({ length: rows }).map((_, r) => (
          <tr key={r}>
            {Array.from({ length: columns }).map((_, c) => (
              <td key={c} className="px-4 py-3">
                <Skeleton className="h-4 w-32" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-left text-body-xs font-medium uppercase tracking-wide text-ink-tertiary ${className ?? ''}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={`px-4 py-3 text-body-sm text-ink-secondary ${className ?? ''}`}>{children}</td>
  );
}
