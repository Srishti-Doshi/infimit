import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
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
  createOrganisation,
  deleteOrganisation,
  listOrganisations,
  updateOrganisation,
} from '@/lib/admin-api';
import {
  createOrganisationSchema,
  ORG_CATEGORIES,
  updateOrganisationSchema,
  type CreateOrganisationInput,
  type UpdateOrganisationInput,
} from '@/lib/admin-schema';
import { mapToFieldError, toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Organisation } from '@/types/organisation';

export default function AdminOrganisationsPage(): JSX.Element {
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Organisation | null>(null);
  const [removeTarget, setRemoveTarget] = useState<Organisation | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'organisations'],
    queryFn: listOrganisations,
  });

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['admin', 'organisations'] });

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
          <h1 className="font-display text-display-md font-semibold text-ink-primary">
            Organisations
          </h1>
          <p className="mt-1 text-body-sm text-ink-secondary">
            {data ? `${data.total} organisation${data.total === 1 ? '' : 's'}` : 'Loading…'}
          </p>
        </div>
        <Button
          variant="primary"
          iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}
          onClick={() => setCreateOpen(true)}
        >
          Add organisation
        </Button>
      </div>

      <Card className="mt-6">
        <CardBody className="p-0">
          {isLoading ? (
            <SkeletonRows columns={5} rows={3} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
              title="No organisations yet"
              description="Onboard a partner organisation to start receiving submissions."
              action={
                <Button
                  variant="primary"
                  iconLeft={<Plus className="h-4 w-4" aria-hidden="true" />}
                  onClick={() => setCreateOpen(true)}
                >
                  Add organisation
                </Button>
              }
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <Th>Name</Th>
                  <Th>Slug</Th>
                  <Th>Category</Th>
                  <Th>Verified</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.items.map((org) => (
                  <tr key={org.id}>
                    <Td className="font-medium text-ink-primary">{org.name}</Td>
                    <Td>{org.slug}</Td>
                    <Td>{categoryLabel(org.category)}</Td>
                    <Td>{org.verified ? 'Yes' : 'No'}</Td>
                    <Td className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Pencil className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => setEditTarget(org)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        iconLeft={<Trash2 className="h-4 w-4" aria-hidden="true" />}
                        onClick={() => setRemoveTarget(org)}
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

      <CreateOrganisationModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={() => {
          invalidate();
          setCreateOpen(false);
        }}
      />
      <EditOrganisationModal
        target={editTarget}
        onClose={() => setEditTarget(null)}
        onSaved={() => {
          invalidate();
          setEditTarget(null);
        }}
      />
      <RemoveOrganisationModal
        target={removeTarget}
        onClose={() => setRemoveTarget(null)}
        onRemoved={() => {
          invalidate();
          setRemoveTarget(null);
        }}
      />
    </Container>
  );
}

function categoryLabel(value: Organisation['category']): string {
  return ORG_CATEGORIES.find((c) => c.value === value)?.label ?? value;
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
  onSaved: () => void;
}

function CreateOrganisationModal({ open, onClose, onSaved }: CreateProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<CreateOrganisationInput>({
    resolver: zodResolver(createOrganisationSchema),
    defaultValues: {
      name: '',
      slug: '',
      category: 'college',
      description: '',
      website: '',
      contactEmail: '',
    },
  });

  const mutation = useMutation({
    mutationFn: createOrganisation,
    onSuccess: () => {
      toast.success('Organisation added');
      reset();
      onSaved();
    },
    onError: (error: ApiError['error']) => {
      const handled = mapToFieldError(error, setError, {
        CONFLICT: { field: 'slug', message: 'That slug is already taken.' },
      });
      if (!handled) toastError(error);
    },
  });

  return (
    <Modal open={open} onOpenChange={(o) => !o && (onClose(), reset())} size="md">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>Add organisation</ModalTitle>
        <ModalDescription className="mt-1">
          Slug is permanent — it appears in author URLs and submission payloads.
        </ModalDescription>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          noValidate
        >
          <Input
            label="Name"
            placeholder="Infimit College Press"
            errorText={errors.name?.message}
            {...register('name')}
          />
          <Input
            label="Slug"
            placeholder="infimit-press"
            helperText="Lowercase letters, numbers and hyphens. Cannot be changed later."
            errorText={errors.slug?.message}
            {...register('slug')}
          />
          <div className="flex flex-col gap-1.5">
            <label className="text-body-sm font-medium text-ink-primary" htmlFor="org-category">
              Category
            </label>
            <select
              id="org-category"
              className="h-11 rounded-md border border-line bg-surface px-3 text-body-sm text-ink-primary focus-visible:outline-2 focus-visible:outline-brand-red-500"
              {...register('category')}
            >
              {ORG_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Input
            label="Website"
            placeholder="https://example.edu"
            errorText={errors.website?.message}
            {...register('website')}
          />
          <Input
            type="email"
            label="Contact email"
            placeholder="press@example.edu"
            errorText={errors.contactEmail?.message}
            {...register('contactEmail')}
          />

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => (onClose(), reset())}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={mutation.isPending}>
              Add organisation
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

interface EditProps {
  target: Organisation | null;
  onClose: () => void;
  onSaved: () => void;
}

function EditOrganisationModal({ target, onClose, onSaved }: EditProps): JSX.Element {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<UpdateOrganisationInput>({
    resolver: zodResolver(updateOrganisationSchema),
    defaultValues: {},
  });

  useEffect(() => {
    if (target) {
      reset({
        name: target.name,
        category: target.category,
        description: target.description ?? '',
        website: target.website ?? '',
        contactEmail: target.contactEmail ?? '',
        verified: target.verified,
      });
    }
  }, [target, reset]);

  const mutation = useMutation({
    mutationFn: (body: UpdateOrganisationInput) => updateOrganisation(target!.id, body),
    onSuccess: () => {
      toast.success('Organisation updated');
      onSaved();
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  return (
    <Modal open={target !== null} onOpenChange={(o) => !o && onClose()} size="md">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>Edit organisation</ModalTitle>
        <ModalDescription className="mt-1">
          Slug is fixed; everything else is editable.
        </ModalDescription>

        <form
          className="mt-6 flex flex-col gap-4"
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          noValidate
        >
          <Input label="Name" errorText={errors.name?.message} {...register('name')} />
          <div className="flex flex-col gap-1.5">
            <label
              className="text-body-sm font-medium text-ink-primary"
              htmlFor="org-edit-category"
            >
              Category
            </label>
            <select
              id="org-edit-category"
              className="h-11 rounded-md border border-line bg-surface px-3 text-body-sm text-ink-primary focus-visible:outline-2 focus-visible:outline-brand-red-500"
              {...register('category')}
            >
              {ORG_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <Input label="Website" errorText={errors.website?.message} {...register('website')} />
          <Input
            type="email"
            label="Contact email"
            errorText={errors.contactEmail?.message}
            {...register('contactEmail')}
          />
          <label className="flex items-center gap-2 text-body-sm text-ink-primary">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line text-brand-red-500 focus-visible:outline-brand-red-500"
              {...register('verified')}
            />
            Verified
          </label>

          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              loading={mutation.isPending}
              disabled={!isDirty}
            >
              Save changes
            </Button>
          </div>
        </form>
      </ModalBody>
    </Modal>
  );
}

interface RemoveProps {
  target: Organisation | null;
  onClose: () => void;
  onRemoved: () => void;
}

function RemoveOrganisationModal({ target, onClose, onRemoved }: RemoveProps): JSX.Element {
  const mutation = useMutation({
    mutationFn: (id: string) => deleteOrganisation(id),
    onSuccess: () => {
      toast.success('Organisation removed');
      onRemoved();
    },
    onError: (error: ApiError['error']) => {
      // Override the generic CONFLICT copy with cascade-specific guidance —
      // the user needs to know *why* the delete refused.
      if (error.code === 'CONFLICT') {
        toast.error('Active authors reference this organisation. Reassign or remove them first.');
        return;
      }
      toastError(error);
    },
  });

  return (
    <Modal open={target !== null} onOpenChange={(o) => !o && onClose()} size="sm">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>Remove organisation</ModalTitle>
        <ModalDescription className="mt-2">
          {target ? (
            <>
              Remove <strong className="text-ink-primary">{target.name}</strong>? The backend
              refuses if any active authors still reference this organisation.
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
