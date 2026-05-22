const TICKER_ITEMS = [
  'Breaking: Stock market reaches record high',
  'Heavy rain alert issued in several states',
  'New smartphone launch shocks tech industry',
  'India to host the next global AI summit',
];

/**
 * BreakingNewsTicker — red horizontal bar with marquee-style scrolling headlines.
 * Sequence is duplicated so the CSS keyframe (-50% translate) loops seamlessly.
 * Honors prefers-reduced-motion via the global tailwind.css rule that pins
 * animation-duration to 0.01ms.
 */
export function BreakingNewsTicker(): JSX.Element {
  const items = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <div
      className="flex items-stretch overflow-hidden bg-brand-red-500 text-ink-inverse"
      role="region"
      aria-label="Breaking news headlines"
    >
      <span className="flex shrink-0 items-center bg-brand-red-700 px-3 py-1.5 text-body-xs font-bold uppercase tracking-wider">
        Top News
      </span>
      <div className="flex-1 overflow-hidden">
        <ul className="inline-flex w-max animate-ticker items-center gap-8 whitespace-nowrap py-1.5 pl-8 pr-0 text-body-xs">
          {items.map((item, i) => (
            <li key={i} className="inline-flex items-center gap-8">
              <span>{item}</span>
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
