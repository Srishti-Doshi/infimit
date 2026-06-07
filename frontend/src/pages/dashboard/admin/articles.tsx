import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ExternalLink, FileText, Redo2, Undo2 } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ArticleStatusBadge } from '@/components/article-status-badge';
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
import { listArticles, publishArticle, unpublishArticle } from '@/lib/articles-api';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Article } from '@/types/article';

/**
 * AdminArticlesPage (`/dashboard/admin/articles`).
 *
 * Surfaces the missing admin-side article-management UI flagged in #50.
 * Subphase 4's BE shipped Unpublish + Re-publish endpoints; this page is the
 * FE half that closes the loop. Admin can:
 *
 *   - See every article in `published` or `unpublished` state.
 *   - Take a published article offline (`POST /:id/unpublish`).
 *   - Put an unpublished article back live (`POST /:id/publish`, now accepts
 *     the `unpublished → published` transition since PR #58 widened
 *     `publishArticle`).
 *   - Hop to the public reader for any live article.
 *
 * Out of scope for this MVP (file follow-ups if hit during real use):
 *   - Status filter tabs (Published / Unpublished / Draft / All).
 *   - Pagination, search, sort.
 *   - Placement edit + bulk actions.
 *   - Author name in the row (BE populate landed via #59; rendering it on
 *     this surface is a separate cosmetic follow-up).
 */

type ActionKind = 'unpublish' | 'republish';
type ActionTarget = { kind: ActionKind; article: Article } | null;

export default function AdminArticlesPage(): JSX.Element {
  const [action, setAction] = useState<ActionTarget>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'articles'],
    queryFn: () => listArticles({}),
  });

  // Client-side filter: only published + unpublished are relevant on this
  // surface. Drafts / submitted / approved / rejected belong to the
  // approvals queue. Sorted publishedAt desc so the most recently
  // (un)published article surfaces first.
  const managedArticles = (data?.items ?? [])
    .filter((a) => a.status === 'published' || a.status === 'unpublished')
    .sort((a, b) => {
      const aTime = a.publishedAt ? new Date(a.publishedAt).getTime() : 0;
      const bTime = b.publishedAt ? new Date(b.publishedAt).getTime() : 0;
      return bTime - aTime;
    });

  return (
    <Container width="default" className="py-12">
      <Link
        to="/dashboard/admin"
        className="inline-flex items-center gap-1 text-body-sm text-ink-secondary hover:text-ink-primary"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Admin console
      </Link>

      <div className="mt-4">
        <h1 className="font-display text-display-md font-semibold text-ink-primary">Articles</h1>
        <p className="mt-1 text-body-sm text-ink-secondary">
          {isLoading
            ? 'Loading…'
            : `${managedArticles.length} published or unpublished article${
                managedArticles.length === 1 ? '' : 's'
              }`}
        </p>
      </div>

      <Card className="mt-6">
        <CardBody className="p-0">
          {isLoading ? (
            <SkeletonRows columns={4} rows={3} />
          ) : managedArticles.length === 0 ? (
            <EmptyState
              icon={<FileText className="h-6 w-6" aria-hidden="true" />}
              title="No published articles yet"
              description="Once editors publish their first article it will appear here for management."
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-line">
                <thead className="bg-surface-subtle">
                  <tr>
                    <Th>Title</Th>
                    <Th>Status</Th>
                    <Th>Section</Th>
                    <Th>Published</Th>
                    <Th className="text-right">Actions</Th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {managedArticles.map((article) => (
                    <ArticleRow
                      key={article.id}
                      article={article}
                      onAction={(kind) => setAction({ kind, article })}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmActionModal
        action={action}
        onClose={() => setAction(null)}
        onSettled={() => {
          void queryClient.invalidateQueries({ queryKey: ['admin', 'articles'] });
          setAction(null);
        }}
      />
    </Container>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────

interface ArticleRowProps {
  article: Article;
  onAction: (kind: ActionKind) => void;
}

function ArticleRow({ article, onAction }: ArticleRowProps): JSX.Element {
  const published = article.status === 'published';
  return (
    <tr>
      <Td className="font-medium text-ink-primary">
        <span title={article.title}>{article.title}</span>
      </Td>
      <Td>
        <ArticleStatusBadge status={article.status} />
      </Td>
      <Td>{ARTICLE_CATEGORY_LABELS[article.category]}</Td>
      <Td>{article.publishedAt ? formatDate(article.publishedAt) : '—'}</Td>
      <Td className="text-right">
        {published ? (
          <div className="inline-flex items-center gap-2">
            {article.slug ? (
              <Link
                to={`/article/${article.slug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 text-body-sm font-medium text-ink-secondary hover:text-ink-primary"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                View
              </Link>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              iconLeft={<Undo2 className="h-4 w-4" aria-hidden="true" />}
              onClick={() => onAction('unpublish')}
            >
              Unpublish
            </Button>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            iconLeft={<Redo2 className="h-4 w-4" aria-hidden="true" />}
            onClick={() => onAction('republish')}
          >
            Re-publish
          </Button>
        )}
      </Td>
    </tr>
  );
}

// ── Confirm modal ─────────────────────────────────────────────────────────

interface ConfirmActionModalProps {
  action: ActionTarget;
  onClose: () => void;
  onSettled: () => void;
}

function ConfirmActionModal({ action, onClose, onSettled }: ConfirmActionModalProps): JSX.Element {
  // Both actions hit a single article-id POST endpoint and return the updated
  // article. Branch on `kind` inside the mutation fn so the React Query cache
  // invalidation path stays unified.
  const mutation = useMutation({
    mutationFn: (target: NonNullable<ActionTarget>) =>
      target.kind === 'unpublish'
        ? unpublishArticle(target.article.id)
        : publishArticle(target.article.id),
    onSuccess: (_data, target) => {
      toast.success(target.kind === 'unpublish' ? 'Article unpublished' : 'Article re-published');
      onSettled();
    },
    onError: (error: ApiError['error']) => {
      toastError(error);
      onSettled();
    },
  });

  const open = action !== null;
  const isRepublish = action?.kind === 'republish';
  const title = isRepublish ? 'Re-publish article' : 'Unpublish article';
  const cta = isRepublish ? 'Re-publish' : 'Unpublish';

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} size="sm">
      <ModalBody className="px-6 py-7 sm:px-8">
        <ModalTitle>{title}</ModalTitle>
        <ModalDescription className="mt-2">
          {isRepublish ? (
            <>
              Put <strong className="text-ink-primary">{action?.article.title}</strong> back live.
              The public page will be reachable again immediately, and the author is notified.
            </>
          ) : (
            <>
              Take <strong className="text-ink-primary">{action?.article.title}</strong> offline.
              The public page will start returning 404 immediately, and the author is notified.
            </>
          )}
        </ModalDescription>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            variant="primary"
            loading={mutation.isPending}
            onClick={() => action && mutation.mutate(action)}
          >
            {cta}
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
      className={`px-4 py-3 text-left text-body-xs font-medium uppercase tracking-wide text-ink-tertiary ${
        className ?? ''
      }`}
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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
