/**
 * Comment domain types. Mirror the backend Comment model + state machine
 * (docs/04-database-design.md §4.2.4, docs/07-workflows.md §7.2).
 *
 * Subphase 4 frontend writes (post) and moderates (approve / reject / hide).
 * Replies are one-level deep in P1; the type allows nested arrays so a future
 * threaded view doesn't need a schema change.
 */

export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

export const COMMENT_STATUSES: readonly CommentStatus[] = [
  'pending',
  'approved',
  'rejected',
  'hidden',
];

/** Minimal user projection the backend joins onto comment rows. */
export interface CommentAuthorRef {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

/** Minimal article projection the backend joins onto moderation-queue rows so editors can click through to the source. */
export interface CommentArticleRef {
  id: string;
  title: string;
  slug?: string;
}

export interface Comment {
  id: string;
  articleId: string;
  /** Optional article projection — present on the moderation queue, absent on per-article reads. */
  article?: CommentArticleRef;
  userId: string;
  /** Optional author projection — present when the backend joined it in. */
  author?: CommentAuthorRef;
  /** Null for top-level comments; an id for a threaded reply. */
  parentId: string | null;
  body: string;
  status: CommentStatus;
  moderatedBy?: string | null;
  moderatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}
