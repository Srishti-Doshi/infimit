/**
 * SkipToContent — visually hidden until keyboard-focused, then appears in the
 * top-left as a "Skip to main content" link. WCAG 2.4.1 bypass-blocks.
 */
export function SkipToContent(): JSX.Element {
  return (
    <a
      href="#content"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-ink-primary focus:px-4 focus:py-2 focus:text-body-sm focus:font-medium focus:text-ink-inverse focus:shadow-elev-2"
    >
      Skip to content
    </a>
  );
}
