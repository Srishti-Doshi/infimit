import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { Button, Card, CardBody, EmptyState, Skeleton, toast } from '@/components/ui';
import { listArticleComments, postComment } from '@/lib/comments-api';
import { postCommentSchema } from '@/lib/comments-schema';
import { toastError } from '@/lib/error-messages';
import { useAuthStore } from '@/store/auth-store';
import type { ApiError } from '@/types/api';

interface CommentThreadProps {
  articleId: string;
}

const MAX = 2000;

/**
 * `<CommentThread>` — reusable comments section for an article surface.
 *
 * Renders the approved-comments list (top-level only in P1; one-level
 * threading lands in Phase 2) and a post-comment form for authenticated
 * users. New comments land with `status: 'pending'` server-side and surface
 * in the moderator queue — they don't immediately appear in the thread,
 * which is why the success toast tells the user their comment is awaiting
 * review.
 *
 * Comments render as plain text (`docs/04-database-design.md §4.2.4`) — we
 * deliberately do NOT use dangerouslySetInnerHTML even though backend
 * sanitises. Treating the body as text avoids accidental rich-rendering
 * regressions if backend ever changes its sanitisation rules.
 *
 * Mounted on both the editor preview page (FE-4c) and the public
 * `/article/:slug` page (FE-4d).
 */
export function CommentThread({ articleId }: CommentThreadProps): JSX.Element {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [body, setBody] = useState('');
  const [touched, setTouched] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['comments', 'article', articleId],
    queryFn: () => listArticleComments(articleId),
    enabled: articleId.length > 0,
  });

  const comments = data?.items ?? [];

  const mutation = useMutation({
    mutationFn: () => postComment(articleId, { body: body.trim() }),
    onSuccess: async () => {
      // New comment is `pending` and won't appear in this thread yet — but
      // invalidate the cache anyway so any concurrent admin view picks it up.
      await queryClient.invalidateQueries({ queryKey: ['comments', 'article', articleId] });
      await queryClient.invalidateQueries({ queryKey: ['comments', 'pending'] });
      setBody('');
      setTouched(false);
      toast.success('Comment posted — it’s now awaiting moderation.');
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  const trimmed = body.trim();
  const parse = postCommentSchema.safeParse({ body: trimmed });
  const isValid = parse.success;
  const errorMessage =
    !parse.success && touched ? (parse.error.issues[0]?.message ?? 'Invalid comment') : null;

  function handleSubmit(e: React.FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setTouched(true);
    if (!isValid || mutation.isPending) return;
    mutation.mutate();
  }

  return (
    <section aria-labelledby="comments-heading" className="mt-10 border-t border-line pt-8">
      <h2
        id="comments-heading"
        className="font-display text-display-sm font-semibold text-ink-primary"
      >
        Comments
        {data ? (
          <span className="ml-2 text-body-sm font-normal text-ink-tertiary">
            {data.total} {data.total === 1 ? 'reply' : 'replies'}
          </span>
        ) : null}
      </h2>

      {/* ─── post-comment form ───────────────────────────────────────── */}
      {user ? (
        <form onSubmit={handleSubmit} className="mt-6">
          <label htmlFor="new-comment" className="sr-only">
            Write a comment
          </label>
          <textarea
            id="new-comment"
            name="body"
            rows={3}
            maxLength={MAX}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={errorMessage ? true : undefined}
            aria-describedby={errorMessage ? 'new-comment-error' : 'new-comment-help'}
            placeholder="Share your thoughts on this piece…"
            className="w-full resize-y rounded-md border border-line bg-surface px-3 py-2 text-body-base text-ink-primary outline-none transition-colors focus:border-brand-red-500 focus:ring-2 focus:ring-brand-red-500/20"
          />
          <div className="mt-1.5 flex items-center justify-between gap-3">
            <p id="new-comment-help" className="text-body-xs text-ink-tertiary" aria-live="polite">
              {trimmed.length} / {MAX}
            </p>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={!isValid || mutation.isPending}
            >
              {mutation.isPending ? 'Posting…' : 'Post comment'}
            </Button>
          </div>
          {errorMessage ? (
            <p id="new-comment-error" role="alert" className="mt-1 text-body-xs text-status-error">
              {errorMessage}
            </p>
          ) : null}
        </form>
      ) : (
        <Card className="mt-6 bg-surface-subtle">
          <CardBody className="py-6 text-center">
            <p className="text-body-sm text-ink-secondary">
              <Link to="/auth/login" className="text-brand-red-600 hover:underline">
                Sign in
              </Link>{' '}
              to leave a comment.
            </p>
          </CardBody>
        </Card>
      )}

      {/* ─── existing approved comments ──────────────────────────────── */}
      <div className="mt-8 space-y-4">
        {isLoading ? (
          <>
            <CommentSkeleton />
            <CommentSkeleton />
          </>
        ) : comments.length === 0 ? (
          <EmptyState
            icon={<MessageSquare className="h-6 w-6" aria-hidden="true" />}
            title="No comments yet"
            description="Be the first to share your thoughts on this piece."
          />
        ) : (
          comments.map((comment) => (
            <article key={comment.id} className="rounded-md border border-line p-4">
              <header className="flex items-baseline justify-between gap-3">
                <p className="text-body-sm font-medium text-ink-primary">
                  {comment.author?.name ?? 'Anonymous'}
                </p>
                <time dateTime={comment.createdAt} className="text-body-xs text-ink-tertiary">
                  {new Date(comment.createdAt).toLocaleDateString()}
                </time>
              </header>
              {/* Plain text — see docs/04-database-design.md §4.2.4. */}
              <p className="mt-2 whitespace-pre-wrap text-body-base text-ink-primary">
                {comment.body}
              </p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function CommentSkeleton(): JSX.Element {
  return (
    <div className="rounded-md border border-line p-4">
      <div className="flex items-baseline justify-between gap-3">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="mt-3 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-11/12" />
    </div>
  );
}
