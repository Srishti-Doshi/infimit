/**
 * Article domain types. Mirror the backend Article model + state machine
 * (docs/04-database-design.md §4.2.3, docs/07-workflows.md §7.1).
 *
 * Subphase 3 frontend only writes `draft` (via create + auto-save PATCH) and
 * triggers `submitted` (via POST /:id/submit). The remaining statuses are part
 * of the contract — kept on the type so future subphases don't widen the union.
 */

export const ARTICLE_CATEGORIES = [
  'education_policy',
  'campus_news',
  'research_innovation',
  'student_achievements',
  'tech_in_education',
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

export type ArticleStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'unpublished';

export interface ArticleAuthorRef {
  id: string;
  name: string;
  slug?: string | null;
  avatarUrl?: string | null;
}

/**
 * Editorial-surface placement flags + priority. Editors / admins set these on
 * a published article via `PATCH /v1/articles/:id/placement`. Backend defaults
 * to all-false / priority=0 on create; populated for every article doc, so
 * the field is required on the read shape.
 */
export interface ArticlePlacement {
  featured: boolean;
  trending: boolean;
  trail: boolean;
  /** 0–100. Higher = higher in editor-curated lists. */
  priority: number;
}

/**
 * AI-derived enrichments persisted on the article. Populated by the backend
 * `articles.approve` pipeline; `degraded=true` when the AI proxy fell back
 * to its circuit-open response and the summary should be regenerated.
 */
export interface ArticleAi {
  summary: string;
  keywords: string[];
  readingTimeMin: number;
  ttsAudioUrl: string | null;
  degraded: boolean;
  /** Model identifier, e.g. `bart-large-cnn` or `circuit-open` on fallback. */
  model: string;
}

export interface ArticleStats {
  views: number;
  uniqueReaders: number;
  shares: number;
  bookmarks: number;
  commentsCount: number;
  trendingScore: number;
}

/**
 * Compact reader-feed card shape — what the backend's `GET /v1/articles/feed/*`
 * + `GET /v1/articles?category=...` endpoints return per item (5-a).
 *
 * Deliberately smaller than `Article` — no body / plainText / internal AI
 * fields / version / media list. ~200–500 bytes per card vs 5–20 KB for
 * the full article doc; lets the home feed land 30+ cards in a single
 * payload without blowing the wire-size budget.
 */
export interface FeedCard {
  id: string;
  slug: string;
  title: string;
  subtitle: string;
  coverImageUrl: string | null;
  category: ArticleCategory;
  location: string;
  publishedAt: string | null;
  author: ArticleAuthorRef | null;
  ai: {
    summary: string;
    readingTimeMin: number;
    degraded: boolean;
  };
  stats: {
    views: number;
    commentsCount: number;
    bookmarks: number;
  };
}

/**
 * Home-feed composite payload — what `GET /v1/articles/feed/home` returns
 * inside `data.feed`.
 *
 *   - `trail`: editorial top-headline strip (server falls back to latest 5
 *     when no article has `placement.trail=true`)
 *   - `featured`: every editorially-flagged featured article, sorted by
 *     `placement.priority` desc then `publishedAt` desc, capped at 5 by
 *     the backend. FE renders as a carousel — first one is the visible
 *     hero, the rest rotate.
 *   - `latest`: chronologically reverse-sorted published articles
 *   - `trending`: ordered IDs hydrated from the `feed:trending` Redis key
 */
export interface HomeFeed {
  trail: FeedCard[];
  featured: FeedCard[];
  latest: FeedCard[];
  trending: FeedCard[];
}

export interface Article {
  id: string;
  title: string;
  slug?: string;
  subtitle?: string;
  /** Sanitized HTML from Tiptap. */
  body?: string;
  /** Plain-text projection of body — char counts at submit-time use this. */
  plainText?: string;

  coverImageUrl?: string | null;
  coverImageMediaId?: string | null;
  /** All media referenced anywhere (cover + embeds). */
  media?: string[];

  category: ArticleCategory;
  subcategory?: string | null;
  tags?: string[];
  location?: string | null;

  authorId: string;
  /** Optional author projection — present when the backend joined it in. */
  author?: ArticleAuthorRef;
  organisationId?: string | null;
  editorId?: string | null;

  status: ArticleStatus;
  rejectionReason?: string | null;

  /** Editorial placement flags. Populated for every doc; defaults are all-false / priority=0. */
  placement?: ArticlePlacement;
  /** AI enrichments. Populated lazily by the approve pipeline. */
  ai?: ArticleAi;
  stats?: ArticleStats;

  /** Optimistic-concurrency token — every PATCH must echo this back. */
  version: number;

  publishedAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
