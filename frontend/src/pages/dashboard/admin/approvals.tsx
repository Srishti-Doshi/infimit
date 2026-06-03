import { useQuery } from '@tanstack/react-query';
import { Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

import { ApprovalQueueRow } from '@/components/editor/approval-queue-row';
import { Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { listSubmittedArticles } from '@/lib/articles-api';

/**
 * `/dashboard/admin/approvals` — Subphase 4 admin surface.
 *
 * Admin variant of the editor approvals queue. Backend authoritatively
 * returns the FULL platform backlog when an admin hits `GET /v1/articles?
 * status=submitted` (no section scoping), so the page itself is identical
 * to the editor variant apart from copy.
 *
 * Row links point to `/dashboard/editor/approvals/:id` — the preview page
 * is role-aware (admin-only unpublish toggle, etc.) and admins are inside
 * the editor RBAC group, so the URL change mid-flow is intentional. Keeps
 * preview behavior in one place.
 *
 * Shared cache key (`['articles', 'approvals']`) with the editor page is
 * safe because a single user has a single role — the cache always
 * represents "submissions visible to me right now."
 */
export default function AdminApprovalsPage(): JSX.Element {
  const { data, isLoading } = useQuery({
    queryKey: ['articles', 'approvals'],
    queryFn: () => listSubmittedArticles(),
  });

  const items = data?.items ?? [];

  return (
    <Container width="default" className="py-12">
      <header>
        <h1 className="font-display text-display-md font-semibold text-ink-primary">
          Platform approvals
        </h1>
        <p className="mt-2 text-body-base text-ink-secondary">
          Every submission waiting on editorial review across all sections.
        </p>
      </header>

      <Card className="mt-8">
        <CardBody className="p-0">
          {isLoading ? (
            <SkeletonRows columns={5} rows={4} />
          ) : items.length === 0 ? (
            <EmptyState
              icon={<Inbox className="h-6 w-6" aria-hidden="true" />}
              title="No platform submissions"
              description="Every section is at inbox zero."
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
