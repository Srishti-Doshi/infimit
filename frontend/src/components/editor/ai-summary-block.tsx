import { useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2, RefreshCw, Sparkles } from 'lucide-react';

import { AiSummary } from '@/components/ai-summary';
import { Button, Card, CardBody, toast } from '@/components/ui';
import { regenerateArticleSummary } from '@/lib/articles-api';
import { toastError } from '@/lib/error-messages';
import type { ApiError } from '@/types/api';
import type { Article } from '@/types/article';

interface AISummaryBlockProps {
  article: Article;
}

/**
 * `<AISummaryBlock>` — surfaces the AI-generated summary that the backend's
 * `articles.approve` pipeline writes to `article.ai.*`.
 *
 * Visibility rules:
 *   - Not rendered for drafts / submitted articles — AI hasn't run yet.
 *   - Rendered for approved / published / unpublished if `article.ai.summary`
 *     is non-empty.
 *   - Rendered with an in-progress placeholder (spinner) when the pipeline is
 *     still in flight (status === 'approved', summary empty, and NOT degraded)
 *     — the approve handler fires the pipeline asynchronously, so there's a
 *     window where the editor sees the approve toast but no summary yet.
 *   - Rendered with the degraded badge + retry message when
 *     `ai.degraded === true` even if `ai.summary` is empty — surfaces the
 *     circuit-open state to the editor so they can hit Regenerate instead
 *     of staring at a silently-missing block. Pins #75. Because degraded
 *     means the pipeline FINISHED (in fallback mode), it is excluded from the
 *     in-progress check above, so "in progress" and "completed degraded"
 *     never render at once (#48).
 *
 * Degraded UX (per FE handler doc §4):
 *   - `ai.degraded === true` shows a subtle "Auto-summary unavailable" badge.
 *     Degraded means the ai-proxy circuit was open (the AI service was
 *     unreachable at approve time), so the summary is empty — the editor hits
 *     Regenerate to retry.
 *   - Force-regenerate ALWAYS sends `force: true` and bypasses cache.
 *   - On `AI_UNAVAILABLE` (503), `toastError` surfaces the user-facing copy
 *     from error-messages.ts. We don't add a custom toast for it — the
 *     centralized mapping is the single source of truth.
 */
export function AISummaryBlock({ article }: AISummaryBlockProps): JSX.Element | null {
  // Hooks must run unconditionally — early returns live AFTER hook calls.
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => regenerateArticleSummary(article.id),
    onSuccess: (updated) => {
      // Refresh the cached article so the new summary + degraded flag flow
      // back into the preview page without needing a refetch round-trip.
      queryClient.setQueryData(['articles', article.id], updated);
      if (updated.ai?.degraded) {
        toast.warning('AI service degraded — retried with fallback summary.');
      } else {
        toast.success('AI summary regenerated.');
      }
    },
    onError: (error: ApiError['error']) => toastError(error),
  });

  const ai = article.ai;
  const hasSummary = Boolean(ai?.summary);
  // Degraded means the pipeline FINISHED in fallback mode, so it is NOT
  // awaiting — excluding it is what lets the body tell in-progress apart from
  // completed-degraded (#48).
  const isAwaitingPipeline = article.status === 'approved' && !hasSummary && !ai?.degraded;

  // Don't render for pre-approval states.
  if (
    article.status !== 'approved' &&
    article.status !== 'published' &&
    article.status !== 'unpublished'
  ) {
    return null;
  }
  if (!hasSummary && !isAwaitingPipeline && !ai?.degraded) return null;

  return (
    <Card className="mt-6 border-brand-red-50 bg-brand-red-50/30">
      <CardBody>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-brand-red-500" aria-hidden="true" />
            <h2 className="font-display text-body-lg font-semibold text-ink-primary">AI summary</h2>
            {ai?.degraded ? <DegradedBadge /> : null}
          </div>
          <Button
            variant="ghost"
            size="sm"
            iconLeft={
              <RefreshCw
                className={mutation.isPending ? 'h-4 w-4 animate-spin' : 'h-4 w-4'}
                aria-hidden="true"
              />
            }
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? 'Regenerating…' : 'Regenerate'}
          </Button>
        </div>

        <div className="mt-3">
          {isAwaitingPipeline ? (
            <p className="flex items-center gap-2 text-body-base italic text-ink-tertiary">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              The AI summary is still being generated — refresh in a moment, or use Regenerate.
            </p>
          ) : hasSummary ? (
            <AiSummary text={ai?.summary ?? ''} />
          ) : (
            <p className="text-body-base italic text-ink-tertiary">
              The AI service was unreachable, so no summary is available yet. Click Regenerate to
              retry.
            </p>
          )}
        </div>

        {ai?.model ? (
          <p className="mt-3 text-body-xs text-ink-tertiary">
            Model: <span className="font-medium text-ink-secondary">{ai.model}</span>
            {ai.readingTimeMin ? <> · ~{ai.readingTimeMin} min read</> : null}
          </p>
        ) : null}
      </CardBody>
    </Card>
  );
}

/**
 * Inline pill shown when `article.ai.degraded === true`. Per the FE handler
 * doc, this should be subtle (not shouty) — editors need to know the summary
 * is a fallback, but it isn't an error worth red colour.
 */
function DegradedBadge(): JSX.Element {
  return (
    <span
      role="status"
      className="inline-flex items-center gap-1 rounded-full bg-yellow-100 px-2 py-0.5 text-body-xs font-medium text-yellow-800"
    >
      <AlertTriangle className="h-3 w-3" aria-hidden="true" />
      Auto-summary unavailable
    </span>
  );
}
