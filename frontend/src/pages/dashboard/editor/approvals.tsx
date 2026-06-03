import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

import { ApprovalQueueRow } from '@/components/editor/approval-queue-row';
import { Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { listSubmittedArticles } from '@/lib/articles-api';

/**
 * `/dashboard/editor/approvals` — Subphase 4 editor surface.
 *
 * Lists every submitted article waiting on editorial review. Backend
 * authoritatively scopes editors to their `sectionsOwned`; admins see
 * everything. We don't second-guess the scope here — what the backend
 * returns IS the queue.
 *
 * Future: tabs (All / My section / Other sections), category + dateRange
 * filters, infinite scroll. None of those require new endpoints; backend
 * already paginates. Held back until FE-4b/4c/4d ship — the queue is
 * functional on Day 1 without them.
 */
export default function ApprovalsPage(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['articles', 'approvals'],
    queryFn: () => listSubmittedArticles(),
  });

  const items = data?.items ?? [];

  return (
    <Container width="default" className="py-12">
      <header>
        <h1 className="font-display text-display-md font-semibold text-ink-primary">
          Approval queue
        </h1>
        <p className="mt-2 text-body-base text-ink-secondary">
          Submitted articles waiting on editorial review. Click a row to open the preview and
          approve, reject, or publish.
        </p>
      </header>

      <Card className="mt-8">
        <CardBody className="p-0">
          {isLoading ? (
            <SkeletonRows columns={5} rows={4} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
              title="Inbox zero"
              description="No submissions are waiting for review right now."
            />
          ) : (
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-surface-subtle">
                <tr>
                  <Th>Title</Th>
                  <Th>Author</Th>
                  <Th>Category</Th>
                  <Th>Submitted</Th>
                  <Th>Status</Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {items.map((article) => (
                  <ApprovalQueueRow key={article.id} article={article} />
                ))}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
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
