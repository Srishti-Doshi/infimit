import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FilePlus, Newspaper, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import {
  Button,
  Card,
  CardBody,
  Container,
  EmptyState,
  Modal,
  ModalBody,
  ModalDescription,
  ModalTitle,
  Skeleton,
  toast,
} from '@/components/ui';
import { deleteEpaper, epaperDownloadUrl, listEpapers } from '@/lib/epaper-api';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Epaper } from '@/types/epaper';

/**
 * `/dashboard/admin/epapers` — admin archive view.
 *
 * Lists every published issue (newest issueDate first). Admin actions per
 * row: open the PDF in a new tab via the `download` 302 + delete the issue.
 * "New issue" CTA in the header opens `/new` (upload form).
 *
 * Backend public-list response is unchanged from what readers see — admins
 * just get the management actions stacked on top.
 */
export default function AdminEpapersPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Epaper | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['epapers', 'list'],
    queryFn: () => listEpapers(),
  });

  const items = data?.items ?? [];

  const remove = useMutation({
    mutationFn: (id: string) => deleteEpaper(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['epapers', 'list'] });
      toast.success('Issue deleted.');
      setDeleteTarget(null);
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  return (
    <Container width="default" className="py-12">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-display-md font-semibold text-ink-primary">
            E-paper archive
          </h1>
          <p className="mt-2 text-body-base text-ink-secondary">
            Every issue published to readers. Newest first. Upload a new issue by linking a PDF and
            a cover image.
          </p>
        </div>
        <Link to="/dashboard/admin/epapers/new">
          <Button variant="primary" iconLeft={<FilePlus className="h-4 w-4" aria-hidden="true" />}>
            New issue
          </Button>
        </Link>
      </header>

      <Card className="mt-8">
        <CardBody className="p-0">
          {isLoading ? (
            <SkeletonRows columns={5} rows={3} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Newspaper className="h-6 w-6" aria-hidden="true" />}
              title="No issues yet"
              description="Upload your first issue to get the archive started."
              action={
                <Link to="/dashboard/admin/epapers/new">
                  <Button
                    variant="primary"
                    iconLeft={<FilePlus className="h-4 w-4" aria-hidden="true" />}
                  >
                    New issue
                  </Button>
                </Link>
              }
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <Th>Title</Th>
                  <Th>Issue date</Th>
                  <Th>Pages</Th>
                  <Th>Downloads</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((epaper) => (
                  <Row
                    key={epaper.id}
                    epaper={epaper}
                    isDeleting={remove.isPending && remove.variables === epaper.id}
                    onDelete={() => setDeleteTarget(epaper)}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>

      <Modal
        open={deleteTarget !== null}
        onOpenChange={(o) => !o && !remove.isPending && setDeleteTarget(null)}
        size="sm"
      >
        <ModalBody className="px-6 py-7 sm:px-8">
          <ModalTitle>Delete issue</ModalTitle>
          <ModalDescription className="mt-2">
            {deleteTarget ? (
              <>
                Delete{' '}
                <strong className="text-ink-primary">&ldquo;{deleteTarget.title}&rdquo;</strong>?
                This can&rsquo;t be undone.
              </>
            ) : null}
          </ModalDescription>
          <div className="mt-6 flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={remove.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              loading={remove.isPending}
              onClick={() => deleteTarget && remove.mutate(deleteTarget.id)}
            >
              Delete
            </Button>
          </div>
        </ModalBody>
      </Modal>
    </Container>
  );
}

interface RowProps {
  epaper: Epaper;
  isDeleting: boolean;
  onDelete: () => void;
}

function Row({ epaper, isDeleting, onDelete }: RowProps): JSX.Element {
  return (
    <tr className={isDeleting ? 'bg-surface-subtle opacity-60' : 'hover:bg-surface-subtle'}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          {epaper.coverImageUrl ? (
            <img
              src={epaper.coverImageUrl}
              alt=""
              className="h-12 w-9 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="flex h-12 w-9 shrink-0 items-center justify-center rounded bg-surface-subtle text-ink-tertiary">
              <Newspaper className="h-4 w-4" aria-hidden="true" />
            </div>
          )}
          <p className="text-body-sm font-medium text-ink-primary">{epaper.title}</p>
        </div>
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">
        <time dateTime={epaper.issueDate}>
          {new Date(epaper.issueDate).toLocaleDateString(undefined, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </time>
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-secondary">
        {epaper.pageCount > 0 ? epaper.pageCount : '—'}
      </td>
      <td className="px-4 py-3 text-body-sm text-ink-tertiary">{epaper.stats.downloads}</td>
      <td className="px-4 py-3">
        <div className="flex items-center justify-end gap-1.5">
          <a
            href={epaperDownloadUrl(epaper.id)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-body-xs font-medium text-brand-red-500 transition-colors hover:bg-brand-red-50"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            Download
          </a>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={onDelete}
            disabled={isDeleting}
            aria-label={`Delete ${epaper.title}`}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
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

function Th({ children, className }: { children: ReactNode; className?: string }): JSX.Element {
  return (
    <th
      scope="col"
      className={`px-4 py-3 text-left text-body-xs font-medium uppercase tracking-wide text-ink-tertiary ${className ?? ''}`}
    >
      {children}
    </th>
  );
}
