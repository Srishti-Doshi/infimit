import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, UsersRound } from 'lucide-react';
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
import { createEditor, deleteEditor, listEditors, type ListedEditor } from '@/lib/admin-api';
import { CONTENT_CATEGORIES, createEditorSchema, type CreateEditorInput } from '@/lib/admin-schema';
import { mapToFieldError, toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';

export default function AdminEditorsPage(): JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<ListedEditor | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({ queryKey: ['admin', 'editors'], queryFn: listEditors });

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
          <h1 className="font-display text-display-md font-semibold text-ink-primary">Editors</h1>
          <p className="mt-1 text-body-sm text-ink-secondary">
            {data ? `${data.total} editor${data.total === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        <Button
          variant="primary"
          iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setCreateOpen(true)}
        >
          Create editor
        </Button>
      </div>

      <Card className="mt-6">
        <CardBody className="overflow-x-auto p-0">
          {isLoading ? (
            <SkeletonRows columns={4} rows={3} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={<UsersRound className="h-6 w-6" aria-hidden="true" />}
              title="No editors yet"
              description="Invite an editor to start triaging submissions."
              action={
                <Button
                  variant="primary"
                  iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => setCreateOpen(true)}
                >
                  Create editor
                </Button>
              }
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Sections</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((editor) => (
                  <tr key={editor.id}>
                    <Td className="font-medium text-ink-primary">{editor.name}</Td>
                    <Td>{editor.email}</Td>
                    <Td>{editor.sectionsOwned?.length ? editor.sectionsOwned.join(', ') : '—'}</Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => setRemoveTarget(editor)}
                      >
                        Remove
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <CreateEditorModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'editors'] });
          setCreateOpen(false);
        }}
      />
      <RemoveEditorModal
        target={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onRemoved={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'editors'] });
          setRemoveTarget(null);
        }}
      />
    </Container>
  );
}

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

// ── Modals ────────────────────────────────────────────────────────────────

interface CreateProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

function CreateEditorModal({ open, onClose, onCreated }: CreateProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateEditorInput>({
    resolver: zodResolver(createEditorSchema),
    defaultValues: { name: '', email: '', password: '', sectionsOwned: [] },
  });

  const mutation = useMutation({
    mutationFn: createEditor,
    onSuccess: () => {
      toast.success('Editor created');
      reset();
      onCreated();
    },
    onError: (error: ApiError['error']) => {
      const handled = mapToFieldError(error, setError, {
        EMAIL_EXISTS: { field: 'email', message: 'An account already exists for this email.' },
        EMAIL_RECENTLY_DELETED: {
          field: 'email',
          message: 'This email was recently in use; pick another.',
        },
      });
      if (!handled) toastError(error);
    },
  });

  return (
    <Modal open={open} onOpenChange={(o) => !o && (onClose(), reset())} size="md">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>Create editor</ModalTitle>
        <ModalDescription className="mt-1">
          The editor receives credentials by email and can sign in immediately.
        </ModalDescription>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          noValidate
        >
          <Input
            label="Name"
            placeholder="Rohan Desai"
            autoComplete="name"
            errorText={errors.name?.message}
            {...register('name')}
          />
          <Input
            type="email"
            label="Email"
            placeholder="rohan@infimit.com"
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

          <fieldset>
            <legend className="text-body-sm font-medium text-ink-primary">Sections owned</legend>
            <p className="text-body-xs text-ink-tertiary">
              Optional. Leave empty for cross-section reach.
            </p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {CONTENT_CATEGORIES.map((cat) => (
                <label
                  key={cat.value}
                  className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-body-sm text-ink-primary"
                >
                  <input
                    type="checkbox"
                    value={cat.value}
                    className="h-4 w-4 rounded border-line text-brand-red-500 focus-visible:outline-brand-red-500"
                    {...register('sectionsOwned')}
                  />
                  {cat.label}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => (onClose(), reset())}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              Create editor
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

interface RemoveProps {
  target: ListedEditor | null;
  onClose: () => void;
  onRemoved: () => void;
}

function RemoveEditorModal({ target, onClose, onRemoved }: RemoveProps): JSX.Element {
  const mutation = useMutation({
    mutationFn: (id: string) => deleteEditor(id),
    onSuccess: () => {
      toast.success('Editor removed');
      onRemoved();
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  return (
    <Modal open={target !== null} onOpenChange={(o) => !o && onClose()} size="sm">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>Remove editor</ModalTitle>
        <ModalDescription className="mt-2">
          {target ? (
            <>
              Remove <strong className="text-ink-primary">{target.name}</strong>? They&rsquo;ll lose
              access immediately and the email is reserved for 30 days.
            </>
          ) : null}
        </ModalDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={mutation.isPending}
            onClick={() => target && mutation.mutate(target.id)}
          >
            Remove
          </Button>
        </div>
      </ModalBody>
    </Modal>
  );
}
