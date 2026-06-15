import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, EyeOff, MessageSquare, X } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';

import { CommentRow } from '@/components/editor/comment-row';
import { Button, Card, CardBody, Container, EmptyState, Skeleton, toast } from '@/components/ui';
import {
  approveComment,
  hideComment,
  listPendingComments,
  rejectComment,
} from '@/lib/comments-api';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Comment } from '@/types/comment';

type Action = 'approve' | 'reject' | 'hide';

const ACTION_LABEL: Readonly<Record<Action, string>> = {
  approve: 'approved',
  reject: 'rejected',
  hide: 'hidden',
};

const ACTION_FN: Readonly<Record<Action, (id: string) => Promise<Comment>>> = {
  approve: approveComment,
  reject: rejectComment,
  hide: hideComment,
};

/**
 * `/dashboard/editor/comments/pending` — Subphase 4 moderation surface.
 *
 * Lists every comment in `status: 'pending'`. Backend authoritatively scopes
 * to editors / admins (RBAC enforced server-side); the page just renders
 * what comes back.
 *
 * Two moderation paths:
 *   - Single-row: per-row Approve / Reject / Hide buttons hit one endpoint
 *     and invalidate the pending-comments query so the row disappears.
 *   - Bulk: multi-select checkboxes + sticky action bar. Selected rows are
 *     moderated SERIALLY (one HTTP call at a time) with inline progress
 *     ("Processing 3 of 7…"). Continues on individual errors and surfaces
 *     a summary toast at the end (no all-or-nothing). Backend has no bulk
 *     endpoint by design — keeps the audit log per-comment.
 */
export default function PendingCommentsPage(): JSX.Element {
  const queryClient = useQueryClient();
  const [processingIds, setProcessingIds] = useState<ReadonlySet<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['comments', 'pending'],
    queryFn: () => listPendingComments(),
  });

  // Memoize so the empty-array fallback doesn't churn `items` on every render
  // and trip the react-hooks/exhaustive-deps rule downstream.
  const items = useMemo(() => data?.items ?? [], [data]);

  const allSelected = useMemo(
    () => items.length > 0 && items.every((c) => selectedIds.has(c.id)),
    [items, selectedIds],
  );
  const someSelected = selectedIds.size > 0;
  const isBatchRunning = batchProgress !== null;

  function toggleOne(id: string, next: boolean): void {
    setSelectedIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(id);
      else copy.delete(id);
      return copy;
    });
  }

  function toggleAll(next: boolean): void {
    if (next) setSelectedIds(new Set(items.map((c) => c.id)));
    else setSelectedIds(new Set());
  }

  // ─── single-row mutation ─────────────────────────────────────────────

  const single = useMutation({
    mutationFn: ({ id, action }: { id: string; action: Action }) => ACTION_FN[action](id),
    onMutate: ({ id }) => {
      setProcessingIds(new Set([id]));
    },
    onSuccess: async (_data, { action }) => {
      await queryClient.invalidateQueries({ queryKey: ['comments', 'pending'] });
      toast.success(`Comment ${ACTION_LABEL[action]}.`);
    },
    onError: (error: ApiError['error']) => toastError(error),
    onSettled: () => setProcessingIds(new Set()),
  });

  // ─── bulk action ─────────────────────────────────────────────────────
  //
  // Backend has no /comments/batch endpoint by design — each comment gets
  // its own audit log entry. So we serialise the requests client-side. A
  // single failure doesn't abort; we record the per-id outcome and report
  // the summary at the end.

  async function runBulk(action: Action): Promise<void> {
    if (selectedIds.size === 0 || isBatchRunning) return;
    const ids = Array.from(selectedIds);
    setProcessingIds(new Set(ids));
    setBatchProgress({ done: 0, total: ids.length });

    let ok = 0;
    let failed = 0;
    for (let i = 0; i < ids.length; i += 1) {
      const id = ids[i]!;
      try {
        await ACTION_FN[action](id);
        ok += 1;
      } catch (e) {
        failed += 1;
        // `e` flows through apiClient's `toApiError`, but a bulk pass would
        // toast N times if we surfaced every failure here. Swallow individual
        // errors and report the summary below — the per-item message lives in
        // the network tab for debugging.
        void e;
      }
      setBatchProgress({ done: i + 1, total: ids.length });
    }

    await queryClient.invalidateQueries({ queryKey: ['comments', 'pending'] });
    setSelectedIds(new Set());
    setProcessingIds(new Set());
    setBatchProgress(null);

    if (failed === 0) toast.success(`${ok} comments ${ACTION_LABEL[action]}.`);
    else if (ok === 0) toast.error(`Couldn’t ${action} any of the ${failed} comments.`);
    else toast.warning(`${ok} ${ACTION_LABEL[action]}, ${failed} failed.`);
  }

  // ─── render ──────────────────────────────────────────────────────────

  return (
    <Container width="default" className="py-12">
      <header>
        <h1 className="font-display text-display-md font-semibold text-ink-primary">
          Pending comments
        </h1>
        <p className="mt-2 text-body-base text-ink-secondary">
          Reader comments waiting on moderation. Approve to publish, reject to drop, or hide to
          soft-remove an already-public comment.
        </p>
      </header>

      {someSelected ? (
        <BulkActionBar
          count={selectedIds.size}
          progress={batchProgress}
          disabled={isBatchRunning}
          onAction={runBulk}
          onClear={() => setSelectedIds(new Set())}
        />
      ) : null}

      <Card className="mt-8">
        <CardBody className="overflow-x-auto p-0">
          {isLoading ? (
            <SkeletonRows columns={6} rows={4} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="h-6 w-6" aria-hidden="true" />}
              title="No comments waiting"
              description="The moderation queue is empty — nothing to triage right now."
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <th scope="col" className="w-10 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="Select all pending comments"
                      className="h-4 w-4 cursor-pointer accent-brand-red-500"
                      checked={allSelected}
                      disabled={isBatchRunning}
                      onChange={(e) => toggleAll(e.target.checked)}
                    />
                  </th>
                  <Th>Comment</Th>
                  <Th>Author</Th>
                  <Th>Article</Th>
                  <Th>Posted</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((comment) => (
                  <CommentRow
                    key={comment.id}
                    comment={comment}
                    isProcessing={processingIds.has(comment.id)}
                    onAction={(action) => single.mutate({ id: comment.id, action })}
                    selection={{
                      selected: selectedIds.has(comment.id),
                      onChange: (next) => toggleOne(comment.id, next),
                    }}
                  />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </Container>
  );
}

interface BulkActionBarProps {
  count: number;
  progress: { done: number; total: number } | null;
  disabled: boolean;
  onAction: (action: Action) => void;
  onClear: () => void;
}

function BulkActionBar({
  count,
  progress,
  disabled,
  onAction,
  onClear,
}: BulkActionBarProps): JSX.Element {
  return (
    <div
      role="region"
      aria-label="Bulk moderation actions"
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-brand-red-200 bg-brand-red-50/50 px-4 py-3"
    >
      <p className="text-body-sm text-ink-primary" aria-live="polite">
        {progress
          ? `Processing ${progress.done} of ${progress.total}…`
          : `${count} comment${count === 1 ? '' : 's'} selected`}
      </p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="secondary"
          iconLeft={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={() => onAction('approve')}
          disabled={disabled}
        >
          Approve all
        </Button>
        <Button
          size="sm"
          variant="ghost"
          iconLeft={<X className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={() => onAction('reject')}
          disabled={disabled}
        >
          Reject all
        </Button>
        <Button
          size="sm"
          variant="outline"
          iconLeft={<EyeOff className="h-3.5 w-3.5" aria-hidden="true" />}
          onClick={() => onAction('hide')}
          disabled={disabled}
        >
          Hide all
        </Button>
        <Button size="sm" variant="ghost" onClick={onClear} disabled={disabled}>
          Clear
        </Button>
      </div>
    </div>
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
