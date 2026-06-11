/**
 * `<Seo>` — per-route document metadata (Sub-PR 5-fe-2).
 *
 * Wraps react-helmet-async. Every public route mounts one of these; the
 * `<HelmetProvider>` lives in `main.tsx`. Renders:
 *   - `<title>` as "<title> · The Infimit" (home passes the full brand
 *     title itself via `titleTemplate: false`)
 *   - meta description
 *   - canonical URL (origin + pathname, query stripped — search results
 *     and paginated category views canonicalise to their base path)
 *   - OpenGraph + Twitter card tags
 *   - optional JSON-LD structured data (`jsonLd` prop), used by the
 *     article page for the schema.org Article object
 *
 * SPA caveat (documented, accepted for P1): tags are set client-side, so
 * crawlers that don't execute JS see only the index.html defaults. Google
 * renders JS; full SSR/pre-rendering is the Phase 2 path if social-embed
 * fidelity (which uses non-JS scrapers) becomes a priority.
 */
import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';

const SITE_NAME = 'The Infimit';
const DEFAULT_DESCRIPTION = 'Global Higher Education News at Your Fingertips';

export interface SeoProps {
  /** Page title. Suffixed with "· The Infimit" unless `bare` is set. */
  title: string;
  /** Render the title exactly as given (the home page owns the full brand title). */
  bare?: boolean;
  description?: string;
  /** Absolute image URL for og:image / twitter:image (article covers). */
  image?: string | null;
  /** OpenGraph type — `article` on article pages, `website` everywhere else. */
  type?: 'website' | 'article';
  /** Optional schema.org object, serialised into a JSON-LD script tag. */
  jsonLd?: Record<string, unknown>;
}

export function Seo({
  title,
  bare = false,
  description = DEFAULT_DESCRIPTION,
  image = null,
  type = 'website',
  jsonLd,
}: SeoProps): JSX.Element {
  const { pathname } = useLocation();
  const fullTitle = bare ? title : `${title} · ${SITE_NAME}`;
  const canonical = `${window.location.origin}${pathname}`;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={canonical} />

      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:type" content={type} />
      <meta property="og:url" content={canonical} />
      {image ? <meta property="og:image" content={image} /> : null}

      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      {image ? <meta name="twitter:image" content={image} /> : null}

      {jsonLd ? <script type="application/ld+json">{JSON.stringify(jsonLd)}</script> : null}
    </Helmet>
  );
}
