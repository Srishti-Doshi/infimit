import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileQuestion, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { BookmarkButton } from '@/components/bookmark-button';
import { DownloadPdfButton } from '@/components/download-pdf-button';
import { CommentThread } from '@/components/editor/comment-thread';
import { SanitizedHtml } from '@/components/sanitized-html';
import { SocialShare } from '@/components/social-share';
import { Button, Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { getArticleBySlug } from '@/lib/articles-api';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import { useArticleAnalytics } from '@/lib/use-article-analytics';

/**
 * `/article/:slug` — public reader view.
 *
 * Functional baseline per the FE handler doc — Subphase 5 polishes the
 * layout (typography, related articles, social meta, Lighthouse pass).
 * For Subphase 4 we ship:
 *   - GET /v1/articles/slug/:slug (404 if not published)
 *   - Sanitised body render via <SanitizedHtml> (defense-in-depth)
 *   - AI summary block (lightweight reader variant, no regenerate button —
 *     that's an editor action; readers only see the result)
 *   - Comments thread (reuses the editor preview's component)
 */
export default function ArticlePage(): JSX.Element {
  const { slug = '' } = useParams<{ slug: string }>();
  const bodyRef = useRef<HTMLDivElement>(null);

  const {
    data: article,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['articles', 'slug', slug],
    queryFn: () => getArticleBySlug(slug),
    enabled: slug.length > 0,
    // The article only changes when the editor edits + republishes. 60s stale
    // is a reasonable balance between freshness and avoiding hammers on the
    // backend's Redis cache.
    staleTime: 60_000,
  });

  // `view` after 1s dwell + `read_complete` at 90% of the article BODY
  // (not the document — comments would otherwise inflate the threshold)
  // or 2-min dwell. Keyed on the resolved id so the 404 path emits nothing.
  useArticleAnalytics(article?.id, bodyRef);

  if (isLoading) {
    return (
      <Container width="default" className="py-12">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-10 w-3/4" />
        <Skeleton className="mt-3 h-4 w-1/2" />
        <Skeleton className="mt-6 aspect-[16/9] w-full" />
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
          icon={<FileQuestion className="h-6 w-6" aria-hidden="true" />}
          title="Article not found"
          description="It may have been unpublished or the URL is incorrect."
          action={
            <Link to="/">
              <Button variant="primary">Back to home</Button>
            </Link>
          }
        />
      </Container>
    );
  }

  const aiSummary = article.ai?.summary?.trim();

  return (
    <Container width="default" className="py-12">
      {/* ─── Header ──────────────────────────────────────────────────── */}
      <header>
        <p className="text-body-xs font-medium uppercase tracking-wide text-brand-red-600">
          {ARTICLE_CATEGORY_LABELS[article.category]}
        </p>
        <h1 className="mt-2 font-display text-display-lg font-semibold text-ink-primary">
          {article.title}
        </h1>
        {article.subtitle ? (
          <p className="mt-3 text-body-lg text-ink-secondary">{article.subtitle}</p>
        ) : null}
        <p className="mt-4 text-body-sm text-ink-tertiary">
          By {article.author?.name ?? 'Unknown author'}
          {article.publishedAt ? (
            <>
              {' · '}
              <time dateTime={article.publishedAt}>
                {new Date(article.publishedAt).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </time>
            </>
          ) : null}
          {article.ai?.readingTimeMin ? <> · ~{article.ai.readingTimeMin} min read</> : null}
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <BookmarkButton articleId={article.id} />
          <DownloadPdfButton articleId={article.id} />
          <SocialShare articleId={article.id} title={article.title} />
        </div>
      </header>

      {/* ─── Cover ───────────────────────────────────────────────────── */}
      {article.coverImageUrl ? (
        <img
          src={article.coverImageUrl}
          alt=""
          className="mt-8 aspect-[16/9] w-full rounded-lg object-cover"
        />
      ) : null}

      {/* ─── AI summary (reader variant — no regenerate button) ───────── */}
      {aiSummary ? (
        <Card className="mt-8 border-brand-red-50 bg-brand-red-50/30">
          <CardBody>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-brand-red-500" aria-hidden="true" />
              <h2 className="font-display text-body-lg font-semibold text-ink-primary">
                AI summary
              </h2>
            </div>
            <p className="mt-2 text-body-base text-ink-primary">{aiSummary}</p>
          </CardBody>
        </Card>
      ) : null}

      {/* ─── Body — sanitised on render ─────────────────────────────── */}
      <Card className="mt-8">
        <CardBody ref={bodyRef}>
          <SanitizedHtml html={article.body ?? ''} />
        </CardBody>
      </Card>

      {/* ─── Comments ────────────────────────────────────────────────── */}
      <CommentThread articleId={article.id} />
    </Container>
  );
}
