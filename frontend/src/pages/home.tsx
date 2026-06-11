/**
 * HomePage — public reader landing (Sub-PR 5-fa).
 *
 * Layout (taking the Figma reference seriously this time):
 *
 *   ┌───────────────────────────────────────────────────────┐
 *   │  FEATURED HERO                                         │
 *   │  ┌────────────────────────────────┐  ┌──────────────┐ │
 *   │  │  cover image (3:2)             │  │ Top Stories  │ │
 *   │  │                                 │  │  · card 1    │ │
 *   │  └────────────────────────────────┘  │  · card 2    │ │
 *   │  Category · H1 · subtitle · byline    │  · card 3    │ │
 *   │                                       │  · card 4    │ │
 *   │                                       └──────────────┘ │
 *   ├───────────────────────────────────────────────────────┤
 *   │  LATEST STORIES                                        │
 *   │  ┌──────┐  ┌──────┐  ┌──────┐                          │
 *   │  │ card │  │ card │  │ card │   3-col grid of cards    │
 *   │  └──────┘  └──────┘  └──────┘                          │
 *   │  ┌──────┐  ┌──────┐  ┌──────┐                          │
 *   │  │ card │  │ card │  │ card │                          │
 *   │  └──────┘  └──────┘  └──────┘                          │
 *   ├───────────────────────────────────────────────────────┤
 *   │  TRENDING (sidebar widget below grid on mobile)        │
 *   └───────────────────────────────────────────────────────┘
 *
 * Notes:
 *   - The TRAIL strip is dropped — the red TOP NEWS ticker in the chrome
 *     above already serves the headline-strip role. The BE still returns
 *     `trail`; we surface it as the "Top Stories" rail beside the hero.
 *   - Broken / missing cover images render as a category-tinted gradient
 *     block at the same aspect ratio as the real cover, so layout stays
 *     stable regardless of whether seed has real uploads.
 *   - Card images have a subtle hover scale; the parent card title shifts
 *     to brand-red on hover — light editorial polish, nothing flashy.
 */
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { Container, Spinner } from '@/components/ui';
import { Skeleton } from '@/components/ui/skeleton';
import { getHomeFeed } from '@/lib/articles-api';
import { cn } from '@/lib/cn';
import type { ArticleCategory, FeedCard, HomeFeed } from '@/types/article';

const CATEGORY_LABEL: Record<ArticleCategory, string> = {
  education_policy: 'Education Policy',
  campus_news: 'Campus News',
  research_innovation: 'Research & Innovation',
  student_achievements: 'Student Achievements',
  tech_in_education: 'Tech in Education',
};

/**
 * Tailwind class fragments for the category-tinted gradient fallback that
 * stands in for a missing or broken cover image. Each entry is a
 * `bg-gradient-to-br from-X to-Y` pair tuned to read as the section it
 * belongs to without straying from the brand palette.
 */
const CATEGORY_GRADIENT: Record<ArticleCategory, string> = {
  education_policy: 'bg-gradient-to-br from-brand-red-100 to-brand-red-300',
  campus_news: 'bg-gradient-to-br from-blue-100 to-blue-300',
  research_innovation: 'bg-gradient-to-br from-violet-100 to-violet-300',
  student_achievements: 'bg-gradient-to-br from-emerald-100 to-emerald-300',
  tech_in_education: 'bg-gradient-to-br from-amber-100 to-amber-300',
};

function formatDate(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function HomePage(): JSX.Element {
  const { data, isPending, isError, refetch } = useQuery<HomeFeed>({
    queryKey: ['feed', 'home'],
    queryFn: getHomeFeed,
    staleTime: 60_000,
  });

  if (isPending) {
    return (
      <Container width="wide" className="space-y-8 py-6">
        <HomeSkeleton />
      </Container>
    );
  }

  if (isError || !data) {
    return (
      <Container width="wide" className="py-16">
        <div className="mx-auto max-w-md text-center">
          <p className="font-display text-display-sm text-ink-primary">Something went wrong</p>
          <p className="mt-2 text-body-base text-ink-secondary">
            We couldn&apos;t load the home feed. Please try again in a moment.
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-4 inline-flex items-center rounded-md bg-brand-red-500 px-4 py-2 text-body-sm font-medium text-white shadow-sm transition-colors hover:bg-brand-red-600"
          >
            Retry
          </button>
        </div>
      </Container>
    );
  }

  return (
    <div className="pb-16">
      {data.featured.length > 0 ? (
        <Container width="wide" className="pt-6">
          <FeaturedHero articles={data.featured} topStories={data.trail.slice(0, 4)} />
        </Container>
      ) : null}
      <Container width="wide" className="mt-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
          <LatestStories items={data.latest} />
          {data.trending.length > 0 ? <TrendingList items={data.trending} /> : null}
        </div>
      </Container>
    </div>
  );
}

// ─── Featured hero (carousel) ───────────────────────────────────────────

interface FeaturedHeroProps {
  articles: FeedCard[];
  topStories: FeedCard[];
}

const CAROUSEL_AUTO_ADVANCE_MS = 4_500;

function FeaturedHero({ articles, topStories }: FeaturedHeroProps): JSX.Element {
  return (
    <section aria-labelledby="featured-heading" className="border-b border-line pb-8">
      <h2 id="featured-heading" className="sr-only">
        Featured stories
      </h2>
      <div className="grid gap-8 lg:grid-cols-[2fr_1fr]">
        <FeaturedCarousel articles={articles} />
        <aside aria-label="Top stories" className="lg:border-l lg:border-line lg:pl-8">
          <h3 className="border-b-2 border-brand-red-500 pb-2 font-display text-body-base font-bold uppercase tracking-wide text-ink-primary">
            Top Stories
          </h3>
          {topStories.length === 0 ? (
            <p className="mt-3 text-body-sm text-ink-secondary">More stories coming soon.</p>
          ) : (
            <ul className="divide-y divide-line">
              {topStories.map((card) => (
                <li key={card.id} className="py-4 first:pt-4 last:pb-0">
                  <Link to={`/article/${card.slug}`} className="group block space-y-1.5">
                    <CategoryEyebrow category={card.category} />
                    <p className="line-clamp-3 font-display text-body-base font-semibold leading-snug text-ink-primary transition-colors group-hover:text-brand-red-600">
                      {card.title}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </section>
  );
}

/**
 * Auto-advancing carousel for the featured-hero column. Behaviour:
 *   - Single article → renders statically, no nav controls.
 *   - Multiple articles → auto-advances every 7s. Hovering the carousel
 *     pauses the timer; moving the mouse away resumes. Same for keyboard
 *     focus inside the region (a11y: keyboard users get a stable target).
 *   - Prev / Next arrows for manual control. Dot indicators below for
 *     direct jump.
 *
 * Hand-built with `useState` + `useEffect` — no carousel dependency added.
 * The state lives entirely in this component; siblings don't observe.
 */
function FeaturedCarousel({ articles }: { articles: FeedCard[] }): JSX.Element {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = articles.length;
  const containerRef = useRef<HTMLDivElement>(null);

  // Snap back to a valid index if the source list shrinks (e.g. an editor
  // unflagged the article we were showing). Without this, we'd render
  // `articles[stale-index]` → undefined → crash.
  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  useEffect(() => {
    if (paused || count <= 1) return undefined;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % count);
    }, CAROUSEL_AUTO_ADVANCE_MS);
    return () => window.clearInterval(id);
  }, [paused, count]);

  const article = articles[index] ?? articles[0];
  if (!article) return <></>;

  const goPrev = (): void => setIndex((i) => (i - 1 + count) % count);
  const goNext = (): void => setIndex((i) => (i + 1) % count);

  return (
    <div
      ref={containerRef}
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        // Resume only when focus genuinely leaves the carousel region.
        if (!containerRef.current?.contains(e.relatedTarget)) setPaused(false);
      }}
      aria-roledescription={count > 1 ? 'carousel' : undefined}
      aria-label={count > 1 ? 'Featured stories' : undefined}
    >
      {/* Slide track — one full-width slide per article, horizontally
          translated by `index * 100%`. `overflow-hidden` clips the
          off-screen slides; `transition-transform` provides the modern
          slide-left animation. */}
      <div className="overflow-hidden">
        <div
          className="flex transition-transform duration-500 ease-out"
          style={{ transform: `translateX(-${index * 100}%)` }}
          aria-live={count > 1 ? 'polite' : undefined}
        >
          {articles.map((slide, i) => (
            <div
              key={slide.id}
              className="w-full flex-shrink-0"
              aria-hidden={i === index ? undefined : true}
            >
              <Link
                to={`/article/${slide.slug}`}
                className="group block"
                aria-label={`Featured article: ${slide.title}`}
                tabIndex={i === index ? 0 : -1}
              >
                <div className="grid gap-5 md:grid-cols-[1.3fr_1fr] md:[grid-template-rows:360px]">
                  <CoverArea
                    article={slide}
                    wrapperClassName="h-[220px] w-full overflow-hidden md:h-full"
                  />
                  <div className="flex flex-col justify-center gap-3 px-1">
                    <CategoryEyebrow category={slide.category} prefix="Featured" />
                    {/* Only the visible slide carries the H1 — off-screen
                        slides get h2 so the document outline doesn't see
                        multiple H1s. */}
                    {i === index ? (
                      <h1 className="font-display text-display-md font-bold leading-tight text-ink-primary transition-colors group-hover:text-brand-red-600">
                        {slide.title}
                      </h1>
                    ) : (
                      <h2 className="font-display text-display-md font-bold leading-tight text-ink-primary transition-colors group-hover:text-brand-red-600">
                        {slide.title}
                      </h2>
                    )}
                    {slide.subtitle ? (
                      <p className="line-clamp-3 text-body-lg text-ink-secondary">
                        {slide.subtitle}
                      </p>
                    ) : null}
                    <FeedCardByline card={slide} />
                  </div>
                </div>
              </Link>
            </div>
          ))}
        </div>
      </div>
      {count > 1 ? (
        <>
          {/* Prev / Next — solid dark pill with shadow, vertically centered
              on the carousel area at both edges of the full slide (image +
              content). Big enough to be obviously tappable; high-contrast
              so they don't hide on photo backgrounds. */}
          <button
            type="button"
            onClick={goPrev}
            aria-label="Previous featured story"
            className="absolute left-3 top-[110px] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink-primary/85 text-body-xl font-bold leading-none text-white shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-colors hover:bg-brand-red-600 md:top-[180px]"
          >
            <span aria-hidden="true">‹</span>
          </button>
          <button
            type="button"
            onClick={goNext}
            aria-label="Next featured story"
            className="absolute right-3 top-[110px] inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-ink-primary/85 text-body-xl font-bold leading-none text-white shadow-lg ring-1 ring-black/5 backdrop-blur-sm transition-colors hover:bg-brand-red-600 md:top-[180px]"
          >
            <span aria-hidden="true">›</span>
          </button>
          <div className="mt-4 flex items-center justify-center gap-2" role="tablist">
            {articles.map((c, i) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Go to slide ${i + 1}: ${c.title}`}
                onClick={() => setIndex(i)}
                className={cn(
                  'h-2 rounded-full transition-all',
                  i === index ? 'w-6 bg-brand-red-500' : 'w-2 bg-line hover:bg-ink-tertiary',
                )}
              />
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}

// ─── Latest stories grid ────────────────────────────────────────────────

interface SectionProps {
  items: FeedCard[];
}

function LatestStories({ items }: SectionProps): JSX.Element {
  if (items.length === 0) {
    return (
      <section aria-labelledby="latest-heading">
        <SectionHeading id="latest-heading">Latest Stories</SectionHeading>
        <p className="mt-4 border-y border-line py-6 text-center text-body-sm text-ink-secondary">
          No published articles yet. Check back soon.
        </p>
      </section>
    );
  }
  return (
    <section aria-labelledby="latest-heading">
      <SectionHeading id="latest-heading">Latest Stories</SectionHeading>
      <ul className="divide-y divide-line">
        {items.map((card) => (
          <li key={card.id}>
            <Link
              to={`/article/${card.slug}`}
              className="group grid gap-5 py-6 sm:grid-cols-[1fr_200px]"
            >
              <div className="min-w-0 space-y-2">
                <CategoryEyebrow category={card.category} />
                <h3 className="font-display text-display-sm font-bold leading-tight text-ink-primary transition-colors group-hover:text-brand-red-600">
                  {card.title}
                </h3>
                {card.subtitle ? (
                  <p className="line-clamp-3 text-body-base text-ink-secondary">{card.subtitle}</p>
                ) : null}
                <FeedCardByline card={card} />
              </div>
              <CoverArea
                article={card}
                wrapperClassName="aspect-[4/3] w-full overflow-hidden sm:order-last"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ─── Trending sidebar ───────────────────────────────────────────────────

function TrendingList({ items }: SectionProps): JSX.Element {
  const top = items.slice(0, 5);
  return (
    <aside
      aria-labelledby="trending-heading"
      className="space-y-4 lg:border-l lg:border-line lg:pl-8"
    >
      <SectionHeading id="trending-heading">Trending</SectionHeading>
      <ol className="divide-y divide-line">
        {top.map((card, index) => (
          <li key={card.id} className="flex items-start gap-3 py-4 first:pt-4 last:pb-0">
            <span
              className="w-7 flex-shrink-0 font-display text-body-xl font-bold leading-none text-brand-red-500"
              aria-hidden="true"
            >
              {index + 1}
            </span>
            <Link
              to={`/article/${card.slug}`}
              className="font-display text-body-sm font-semibold leading-snug text-ink-primary transition-colors hover:text-brand-red-600"
            >
              {card.title}
            </Link>
          </li>
        ))}
      </ol>
      <Link
        to="/search"
        className="inline-flex text-body-xs font-medium text-brand-red-500 hover:text-brand-red-600"
      >
        See more →
      </Link>
    </aside>
  );
}

// ─── primitives ─────────────────────────────────────────────────────────

function SectionHeading({ id, children }: { id: string; children: React.ReactNode }): JSX.Element {
  return (
    <h2
      id={id}
      className="border-b-2 border-brand-red-500 pb-2 font-display text-display-sm font-bold leading-none text-ink-primary"
    >
      {children}
    </h2>
  );
}

function CategoryEyebrow({
  category,
  prefix,
}: {
  category: ArticleCategory;
  prefix?: string;
}): JSX.Element {
  return (
    <span className="inline-flex items-center gap-1 text-body-xs font-semibold uppercase tracking-wide text-brand-red-500">
      {prefix ? (
        <>
          {prefix}
          <span aria-hidden="true">·</span>
        </>
      ) : null}
      <span>{CATEGORY_LABEL[category]}</span>
    </span>
  );
}

function FeedCardByline({ card }: { card: FeedCard }): JSX.Element {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-body-xs text-ink-tertiary">
      {card.author ? <span>By {card.author.name}</span> : null}
      {card.publishedAt ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{formatDate(card.publishedAt)}</span>
        </>
      ) : null}
      {card.ai.readingTimeMin > 0 ? (
        <>
          <span aria-hidden="true">·</span>
          <span>{card.ai.readingTimeMin} min read</span>
        </>
      ) : null}
    </p>
  );
}

/**
 * CoverArea — wraps the cover image (or its fallback) in a fixed-aspect
 * container. The wrapper's class controls aspect / radius / shadow; the
 * inner image fills it via absolute positioning. When the URL is missing
 * OR fails to load, we render a category-tinted gradient block at the same
 * dimensions so the surrounding layout never shifts.
 */
function CoverArea({
  article,
  wrapperClassName,
}: {
  article: Pick<FeedCard, 'coverImageUrl' | 'category' | 'title'>;
  wrapperClassName: string;
}): JSX.Element {
  const [errored, setErrored] = useState(false);
  const showFallback = !article.coverImageUrl || errored;
  return (
    <div
      className={cn(
        'relative',
        // Category-tinted gradient is the BACKDROP — visible only when no
        // real cover loaded (missing URL or onError fallback). When the
        // image is present, `object-cover` fills the container edge-to-
        // edge (16:9 uploads per the editorial guideline match this
        // perfectly; off-spec uploads are cropped, matching how every
        // newspaper site treats covers).
        CATEGORY_GRADIENT[article.category],
        wrapperClassName,
      )}
    >
      {showFallback ? (
        <div className="absolute inset-0 flex items-end p-4" aria-hidden="true">
          <span className="font-display text-body-xs font-bold uppercase tracking-wide text-ink-primary/70">
            {CATEGORY_LABEL[article.category]}
          </span>
        </div>
      ) : (
        <img
          src={article.coverImageUrl ?? ''}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setErrored(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
        />
      )}
    </div>
  );
}

// ─── loading skeleton ──────────────────────────────────────────────────

function HomeSkeleton(): JSX.Element {
  return (
    <div className="space-y-10">
      <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-4">
          <Skeleton className="aspect-[3/2] w-full rounded-lg" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <div className="space-y-3">
          <Skeleton className="h-5 w-32" />
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="grid gap-3 sm:grid-cols-[80px_1fr]">
              <Skeleton className="aspect-[4/3] rounded-md" />
              <div className="space-y-1.5">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="grid gap-10 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <Skeleton className="h-8 w-40" />
          <div className="grid gap-6 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="space-y-3">
                <Skeleton className="aspect-[16/10] rounded-md" />
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-5 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-8 w-32" />
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-5 w-5" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
      <div className="flex items-center justify-center pt-2">
        <Spinner size="sm" label="Loading home feed" />
      </div>
    </div>
  );
}
