import DOMPurify from 'dompurify';
import { useMemo } from 'react';

interface SanitizedHtmlProps {
  /** HTML string from the backend. Already server-sanitized; this is defense-in-depth. */
  html: string;
  /** Tailwind classes for the wrapping `<article>`. Defaults to `prose max-w-none`. */
  className?: string;
}

/**
 * `<SanitizedHtml>` — defense-in-depth wrapper around `dangerouslySetInnerHTML`.
 *
 * Backend strictly sanitises article bodies on every save
 * (`docs/10-security.md §10.1` — DOMPurify-equivalent allowlist with every
 * `<a>` getting `rel="nofollow noopener" target="_blank"` and every
 * `<script>` / `<iframe>` / `javascript:` / `data:` stripped). We sanitise
 * again on render in case a future backend regression slips through, OR
 * the caller is composing content from multiple sources (e.g. an embed).
 *
 * The DOMPurify config matches the backend allowlist intent: standard HTML
 * profile, no SVG, no MathML, no JS URLs. Memoised on `html` so we don't
 * re-sanitise on every parent re-render.
 *
 * Used by:
 *   - editor preview (`/dashboard/editor/approvals/:id`) for the article body
 *   - public article page (`/article/:slug`) for the article body
 *
 * Comments deliberately do NOT go through this — they're plain text per
 * `docs/04-database-design.md §4.2.4`.
 */
export function SanitizedHtml({ html, className }: SanitizedHtmlProps): JSX.Element {
  const clean = useMemo(
    () =>
      DOMPurify.sanitize(html, {
        USE_PROFILES: { html: true },
        // Match backend: rel/target on links is enforced server-side, but if
        // a regression leaks, we don't want any anchor opening in the host tab.
        ADD_ATTR: ['target', 'rel'],
      }),
    [html],
  );
  return (
    <article
      className={className ?? 'prose max-w-none'}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
