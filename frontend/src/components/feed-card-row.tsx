/**
 * `<FeedCardRow>` — shared layout for the newspaper-style article row used
 * by the home page's Latest Stories section, the category page, and the
 * search results page.
 *
 * Layout: one-row grid `[content | cover]` on tablet+, stacked on mobile.
 * Content side stacks `eyebrow → title → subtitle → byline`. Hairline
 * dividers between rows live on the parent `<ul className="divide-y">`.
 *
 * Two minor consumer-driven knobs:
 *   - `eyebrowPrefix` lets the home page show "Featured · …" while category /
 *     search pages just show the category name.
 *   - `accepts` either a `FeedCard` (compact public reader shape, e.g. from
 *     `GET /v1/articles?category=…`) OR a full `Article` (from
 *     `GET /v1/search`). The render path narrows to whichever fields are
 *     present.
 */
import { Link } from 'react-router-dom';

import { cn } from '@/lib/cn';
import type { Article, ArticleCategory, FeedCard } from '@/types/article';

const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  education_policy: 'Education Policy',
  campus_news: 'Campus News',
  research_innovation: 'Research & Innovation',
  student_achievements: 'Student Achievements',
  tech_in_education: 'Tech in Education',
};

const CATEGORY_GRADIENT: Record<ArticleCategory, string> = {
  education_policy: 'bg-gradient-to-br from-brand-red-100 to-brand-red-300',
  campus_news: 'bg-gradient-to-br from-blue-100 to-blue-300',
  research_innovation: 'bg-gradient-to-br from-violet-100 to-violet-300',
  student_achievements: 'bg-gradient-to-br from-emerald-100 to-emerald-300',
  tech_in_education: 'bg-gradient-to-br from-amber-100 to-amber-300',
};

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

interface FeedCardRowProps {
  /** Either the compact `FeedCard` shape (public list / feed endpoints) or
   * the full `Article` shape (search results, where the BE returns hydrated
   * docs). The render narrows to whichever fields are present. */
  card: FeedCard | Article;
  eyebrowPrefix?: string;
}

interface NormalisedCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  coverImageUrl: string | null;
  category: ArticleCategory;
  publishedAt: string | null;
  authorName: string | null;
  readingTimeMin: number;
}

function normalise(card: FeedCard | Article): NormalisedCard {
  if ('ai' in card && card.ai && 'readingTimeMin' in card.ai && 'stats' in card) {
    // FeedCard: ai.readingTimeMin is required; author may be present
    const fc = card as FeedCard;
    return {
      id: fc.id,
      slug: fc.slug,
      title: fc.title,
      subtitle: fc.subtitle ?? '',
      coverImageUrl: fc.coverImageUrl,
      category: fc.category,
      publishedAt: fc.publishedAt,
      authorName: fc.author?.name ?? null,
      readingTimeMin: fc.ai.readingTimeMin,
    };
  }
  // Article shape
  const a = card as Article;
  return {
    id: a.id,
    slug: a.slug ?? '',
    title: a.title,
    subtitle: a.subtitle ?? '',
    coverImageUrl: a.coverImageUrl ?? null,
    category: a.category,
    publishedAt: a.publishedAt ?? null,
    authorName: a.author?.name ?? null,
    readingTimeMin: a.ai?.readingTimeMin ?? 0,
  };
}

export function FeedCardRow({ card, eyebrowPrefix }: FeedCardRowProps): JSX.Element {
  const n = normalise(card);
  return (
    <Link to={`/article/${n.slug}`} className="group grid gap-5 py-6 sm:grid-cols-[1fr_200px]">
      <div className="min-w-0 space-y-2">
        <span className="inline-flex items-center gap-1 text-body-xs font-semibold uppercase tracking-wide text-brand-red-500">
          {eyebrowPrefix ? (
            <>
              {eyebrowPrefix}
              <span aria-hidden="true">·</span>
            </>
          ) : null}
          <span>{CATEGORY_LABEL[n.category]}</span>
        </span>
        <h3 className="font-display text-display-sm font-bold leading-tight text-ink-primary transition-colors group-hover:text-brand-red-600">
          {n.title}
        </h3>
        {n.subtitle ? (
          <p className="line-clamp-3 text-body-base text-ink-secondary">{n.subtitle}</p>
        ) : null}
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-xs text-ink-tertiary">
          {n.authorName ? <span>By {n.authorName}</span> : null}
          {n.publishedAt ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{formatDate(n.publishedAt)}</span>
            </>
          ) : null}
          {n.readingTimeMin > 0 ? (
            <>
              <span aria-hidden="true">·</span>
              <span>{n.readingTimeMin} min read</span>
            </>
          ) : null}
        </p>
      </div>
      <CoverArea
        coverImageUrl={n.coverImageUrl}
        category={n.category}
        wrapperClassName="aspect-[4/3] w-full overflow-hidden sm:order-last"
      />
    </Link>
  );
}

/**
 * Cover image with category-tinted gradient fallback. Mirrors the home
 * page's `<CoverArea>` so off-spec uploads stay consistent across surfaces.
 * Object-cover for compliant 16:9 uploads.
 */
function CoverArea({
  coverImageUrl,
  category,
  wrapperClassName,
}: {
  coverImageUrl: string | null;
  category: ArticleCategory;
  wrapperClassName: string;
}): JSX.Element {
  return (
    <div className={cn('relative', CATEGORY_GRADIENT[category], wrapperClassName)}>
      {coverImageUrl ? (
        <img
          src={coverImageUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 flex items-end p-3" aria-hidden="true">
          <span className="font-display text-body-xs font-bold uppercase tracking-wide text-ink-primary/70">
            {CATEGORY_LABEL[category]}
          </span>
        </div>
      )}
    </div>
  );
}

export const FEED_CATEGORY_LABEL = CATEGORY_LABEL;
