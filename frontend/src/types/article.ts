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

  /** Optimistic-concurrency token — every PATCH must echo this back. */
  version: number;

  publishedAt?: string | null;
  submittedAt?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
