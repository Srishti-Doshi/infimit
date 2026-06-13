import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileQuestion, Sparkles } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { BookmarkButton } from '@/components/bookmark-button';
import { DownloadPdfButton } from '@/components/download-pdf-button';
import { SanitizedHtml } from '@/components/sanitized-html';
import { Seo } from '@/components/seo';
import { SocialShare } from '@/components/social-share';
import { Button, Card, CardBody, Container, EmptyState, Skeleton } from '@/components/ui';
import { getArticleBySlug } from '@/lib/articles-api';
import { ARTICLE_CATEGORY_LABELS } from '@/lib/articles-schema';
import { useArticleAnalytics } from '@/lib/use-article-analytics';

/**
 * Comments load AFTER the article's first paint (handler-doc guidance:
 * "defer comments query after main paint"). Two reasons:
 *   - the section is below the fold, so rendering it inside the article's
 *     first commit only makes that commit's style/layout task longer — it
 *     was the page's biggest main-thread block on the v0.5.0 Lighthouse run;
 *   - lazy() splits the comments code (form, moderation states, API client)
 *     out of the entry bundle ArticlePage now rides in.
 * The placeholder mirrors the section's reserved heights so the deferred
 * mount stays CLS-neutral.
 */
const CommentThread = lazy(() =>
  import('@/components/editor/comment-thread').then((m) => ({ default: m.CommentThread })),
);

function CommentsPlaceholder(): JSX.Element {
  return (
    <div className="mt-10 border-t border-line pt-8">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="mt-6 h-28 w-full" />
      <div className="mt-8 min-h-[12rem]" />
    </div>
  );
}

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

  // Flips after the first commit paints — gates the deferred comments mount.
  const [pastFirstPaint, setPastFirstPaint] = useState(false);
  useEffect(() => {
    setPastFirstPaint(true);
  }, []);

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
    // The skeleton mirrors the loaded page block-for-block — kicker, title,
    // subtitle, byline, action row, cover, body, comments — at matching
    // offsets, so the loading→loaded swap doesn't move anything already on
    // screen. The old header-only skeleton was the page's dominant CLS
    // source (0.29 of 0.34): the missing byline/action rows meant every
    // block below them dropped ~90px when content arrived, and the short
    // overall height left the footer visible mid-viewport before being
    // shoved off. The body card carries the same min-h floor as the loaded
    // body so a short article can't collapse the reservation and shift the
    // page back up.
    // Deliberately NOT reserved: the AI-summary card — no published article
    // renders it while the ai-proxy circuit is open. Re-measure CLS when
    // the AI service merges; if the card returns, add a placeholder here.
    return (
      <Container width="default" className="py-12">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="mt-4 h-10 w-3/4" />
        <Skeleton className="mt-3 h-5 w-1/2" />
        <Skeleton className="mt-4 h-4 w-64" />
        <div className="mt-5 flex flex-wrap gap-3">
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-44" />
        </div>
        <Skeleton className="mt-8 aspect-[16/9] w-full" />
        <Card className="mt-8">
          <CardBody className="min-h-[40vh] space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-10/12" />
          </CardBody>
        </Card>
        <div className="mt-10 border-t border-line pt-8">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="mt-6 h-28 w-full" />
          <div className="mt-8 min-h-[12rem] space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
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

  // schema.org Article — the JSON-LD payload search engines read for rich
  // results. Description prefers the AI summary (concise, editor-reviewed)
  // over the subtitle.
  const seoDescription = aiSummary || article.subtitle || article.title;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    ...(article.publishedAt ? { datePublished: article.publishedAt } : {}),
    author: { '@type': 'Person', name: article.author?.name ?? 'The Infimit' },
    publisher: { '@type': 'Organization', name: 'The Infimit' },
    ...(article.coverImageUrl ? { image: article.coverImageUrl } : {}),
    description: seoDescription,
  };

  return (
    <Container width="default" className="py-12">
      <Seo
        title={article.title}
        description={seoDescription}
        image={article.coverImageUrl ?? null}
        type="article"
        jsonLd={jsonLd}
      />
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
          decoding="async"
          // The cover is the page's LCP element and, being SPA-rendered, is
          // only discovered after JS + the article fetch — the priority hint
          // moves it ahead of other in-flight requests once it is. Lowercase
          // via spread: React 18 doesn't know the camelCase prop.
          {...{ fetchpriority: 'high' }}
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
      {/* min-h matches the loading skeleton's body card — see the skeleton
          comment above for the CLS rationale. */}
      <Card className="mt-8">
        <CardBody ref={bodyRef} className="min-h-[40vh]">
          <SanitizedHtml html={article.body ?? ''} />
        </CardBody>
      </Card>

      {/* ─── Comments — deferred past first paint, see CommentThread note ── */}
      {pastFirstPaint ? (
        <Suspense fallback={<CommentsPlaceholder />}>
          <CommentThread articleId={article.id} />
        </Suspense>
      ) : (
        <CommentsPlaceholder />
      )}
    </Container>
  );
}
