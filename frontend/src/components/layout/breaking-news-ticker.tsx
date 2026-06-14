import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';

import { getHomeFeed } from '@/lib/articles-api';

const TICKER_LIMIT = 8;

/**
 * BreakingNewsTicker — red horizontal bar with marquee-style scrolling
 * headlines. Headlines are REAL published articles (trending, falling back to
 * latest) pulled from the home feed, and each links to its article — not the
 * old hardcoded placeholder strings.
 *
 * Shares the home page's `['feed', 'home']` query key so it reuses that cache
 * instead of issuing a second request. Renders nothing until there's at least
 * one headline, so the bar never shows an empty marquee.
 *
 * The sequence is duplicated so the CSS keyframe (-50% translate) loops
 * seamlessly. Honors prefers-reduced-motion via the global tailwind.css rule
 * that pins animation-duration to 0.01ms.
 */
export function BreakingNewsTicker(): JSX.Element | null {
  const { data: feed } = useQuery({
    queryKey: ['feed', 'home'],
    queryFn: getHomeFeed,
    staleTime: 60_000,
  });

  const source = feed?.trending?.length ? feed.trending : (feed?.latest ?? []);
  const headlines = source.slice(0, TICKER_LIMIT);

  if (headlines.length === 0) return null;

  // Duplicate the sequence so the marquee loop has no visible seam.
  const items = [...headlines, ...headlines];

  return (
    <div
      className="flex items-stretch overflow-hidden bg-brand-red-500 text-ink-inverse"
      role="region"
      aria-label="Top headlines"
    >
      <span className="flex shrink-0 items-center bg-brand-red-700 px-3 py-1.5 text-body-xs font-bold uppercase tracking-wider">
        Top News
      </span>
      <div className="flex-1 overflow-hidden">
        <ul className="inline-flex w-max animate-ticker items-center gap-8 whitespace-nowrap py-1.5 pl-8 pr-0 text-body-xs">
          {items.map((article, i) => (
            <li key={`${article.id}-${i}`} className="inline-flex items-center gap-8">
              <Link to={`/article/${article.slug}`} className="transition-opacity hover:opacity-80">
                {article.title}
              </Link>
              <span className="text-ink-inverse/50" aria-hidden="true">
                •
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
