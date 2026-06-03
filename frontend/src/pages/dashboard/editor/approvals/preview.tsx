import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, EyeOff, FileText, Send, X } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ArticleStatusBadge } from '@/components/article-status-badge';
import { AISummaryBlock } from '@/components/editor/ai-summary-block';
import { CommentThread } from '@/components/editor/comment-thread';
import { PlacementPanel } from '@/components/editor/placement-panel';
import { RejectModal } from '@/components/editor/reject-modal';
import { SanitizedHtml } from '@/components/sanitized-html';
import { Button, Card, CardBody, Container, EmptyState, Skeleton, toast } from '@/components/ui';
import {
  approveArticle,
  getArticle,
  publishArticle,
  rejectArticle,
  unpublishArticle,
} from '@/lib/articles-api';
import { ARTICLE_CATEGORY_LABELS, type RejectArticleInput } from '@/lib/articles-schema';
import { toastError } from '@/lib/error-messages';
import { useAuthStore } from '@/store/auth-store';
import type { ApiError } from '@/types/api';

/**
 * `/dashboard/editor/approvals/:id` — Subphase 4 editor preview.
 *
 * Loads the article, renders it in a read-only preview, and exposes the
 * editorial action toolbar. Status drives button enablement:
 *
 *   - Approve  → enabled iff status === 'submitted'
 *   - Reject   → enabled iff status === 'submitted'  (opens <RejectModal>)
 *   - Publish  → enabled iff status === 'approved'
 *
 * AI summary block + force-regenerate land in FE-4b. Placement panel lands
 * later in this same PR. Comments section lands in FE-4c.
 *
 * Note on body rendering: backend sanitizes article HTML on every save
 * (docs/10-security.md §10.1); editor preview is a trusted-role surface, so
 * we render via dangerouslySetInnerHTML for now.
 *
 * TODO(dompurify): once `dompurify` lands as a dep (FE-4d brings it for the
 * public reader view), wrap this render with the sanitizer for defense in
 * depth. Tracked in FE-4d.
 */
export default function ApprovalPreviewPage(): JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [rejectOpen, setRejectOpen] = useState(false);

  const {
    data: article,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['articles', id],
    queryFn: () => getArticle(id),
    enabled: id.length > 0,
  });

  const invalidateAll = (): Promise<void> =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['articles', id] }),
      queryClient.invalidateQueries({ queryKey: ['articles', 'approvals'] }),
    ]).then(() => undefined);

  const approveMutation = useMutation({
    mutationFn: () => approveArticle(id),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Article approved. AI summary will appear shortly.');
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  const rejectMutation = useMutation({
    mutationFn: (body: RejectArticleInput) => rejectArticle(id, body),
    onSuccess: async () => {
      await invalidateAll();
      setRejectOpen(false);
      toast.success('Submission rejected — author has been notified.');
      navigate('/dashboard/editor/approvals');
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  const publishMutation = useMutation({
    mutationFn: () => publishArticle(id),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Article published.');
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  // Unpublish is admin-only — backend enforces with 403 FORBIDDEN. The
  // button is also gated client-side so non-admins never see it, but the
  // mutation is defined unconditionally so hook order stays stable.
  const unpublishMutation = useMutation({
    mutationFn: () => unpublishArticle(id),
    onSuccess: async () => {
      await invalidateAll();
      toast.success('Article unpublished.');
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  const isMutating =
    approveMutation.isPending ||
    rejectMutation.isPending ||
    publishMutation.isPending ||
    unpublishMutation.isPending;

  // ─── Loading / error states ──────────────────────────────────────────

  if (isLoading) {
    return (
      <Container width="default" className="py-12">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="mt-3 h-4 w-1/3" />
        <Card className="mt-8">
          <CardBody className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
          </CardBody>
        </Card>
      </Container>
    );
  }

  if (isError || !article) {
    return (
      <Container width="default" className="py-12">
        <EmptyState
          icon={<FileText className="h-6 w-6" aria-hidden="true" />}
          title="Article not found"
          description="It may have been withdrawn or you don't have access to it."
          action={
            <Link to="/dashboard/editor/approvals">
              <Button variant="primary">Back to approval queue</Button>
            </Link>
          }
        />
      </Container>
    );
  }

  const canApprove = article.status === 'submitted';
  const canReject = article.status === 'submitted';
  const canPublish = article.status === 'approved';
  // Unpublish: admin-only and only meaningful when the piece is currently live.
  // Backend also enforces RBAC (403 on non-admin); this guard keeps the button
  // out of editors' sight so they never have to wonder why it exists.
  const canUnpublish = user?.role === 'admin' && article.status === 'published';

  return (
    <Container width="default" className="py-12">
      <Link
        to="/dashboard/editor/approvals"
        className="inline-flex items-center gap-1.5 text-body-sm text-ink-secondary transition-colors hover:text-brand-red-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Approval queue
      </Link>

      {/* ─── Header ──────────────────────────────────────────────────── */}
      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-3">
            <ArticleStatusBadge status={article.status} />
            <span className="text-body-sm text-ink-tertiary">
              {ARTICLE_CATEGORY_LABELS[article.category]}
            </span>
          </div>
          <h1 className="mt-2 font-display text-display-md font-semibold text-ink-primary">
            {article.title}
          </h1>
          {article.subtitle ? (
            <p className="mt-2 text-body-base text-ink-secondary">{article.subtitle}</p>
          ) : null}
          <p className="mt-3 text-body-sm text-ink-tertiary">
            By {article.author?.name ?? 'Unknown author'}
            {article.submittedAt ? (
              <>
                {' · submitted '}
                <time dateTime={article.submittedAt}>
                  {new Date(article.submittedAt).toLocaleDateString()}
                </time>
              </>
            ) : null}
          </p>
        </div>

        {/* ─── Action toolbar ──────────────────────────────────────── */}
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            iconLeft={<X className="h-4 w-4" aria-hidden="true" />}
            onClick={() => setRejectOpen(true)}
            disabled={!canReject || isMutating}
          >
            Reject
          </Button>
          <Button
            variant="secondary"
            iconLeft={<Check className="h-4 w-4" aria-hidden="true" />}
            onClick={() => approveMutation.mutate()}
            disabled={!canApprove || isMutating}
          >
            {approveMutation.isPending ? 'Approving…' : 'Approve'}
          </Button>
          <Button
            variant="primary"
            iconLeft={<Send className="h-4 w-4" aria-hidden="true" />}
            onClick={() => publishMutation.mutate()}
            disabled={!canPublish || isMutating}
          >
            {publishMutation.isPending ? 'Publishing…' : 'Publish'}
          </Button>
          {canUnpublish ? (
            <Button
              variant="outline"
              iconLeft={<EyeOff className="h-4 w-4" aria-hidden="true" />}
              onClick={() => unpublishMutation.mutate()}
              disabled={isMutating}
            >
              {unpublishMutation.isPending ? 'Unpublishing…' : 'Unpublish'}
            </Button>
          ) : null}
        </div>
      </header>

      {/* ─── Cover ───────────────────────────────────────────────────── */}
      {article.coverImageUrl ? (
        <img
          src={article.coverImageUrl}
          alt=""
          className="mt-6 aspect-[16/9] w-full rounded-lg object-cover"
        />
      ) : null}

      {/* ─── AI summary (approved/published/unpublished, when AI ran) ─ */}
      <AISummaryBlock article={article} />

      {/* ─── Editorial placement (published-only) ───────────────────── */}
      <PlacementPanel article={article} />

      {/* ─── Body ────────────────────────────────────────────────────── */}
      <Card className="mt-8">
        <CardBody>
          {article.body ? (
            <SanitizedHtml html={article.body} />
          ) : (
            <p className="text-body-base italic text-ink-tertiary">
              This submission has no body content.
            </p>
          )}
        </CardBody>
      </Card>

      {/* ─── Comments thread ─────────────────────────────────────────── */}
      <CommentThread articleId={article.id} />

      <RejectModal
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        articleTitle={article.title}
        onSubmit={(body) => rejectMutation.mutate(body)}
        isSubmitting={rejectMutation.isPending}
      />
    </Container>
  );
}
