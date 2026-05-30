/**
 * Article repository — data access for the articles collection.
 *
 * Every state-changing write goes through `updateWithVersion` or `transition`,
 * which compose `findOneAndUpdate({ _id, version, deletedAt: null }, ...)`
 * with `$inc: { version: 1 }`. A no-match means a concurrent writer raced us;
 * the service maps that to 409 VERSION_CONFLICT.
 *
 * Reads default-filter `deletedAt: null` — soft-deleted articles are gone for
 * every read path (incl. lists). Hard-delete is not exposed.
 */
import { type FilterQuery, type Types, type UpdateQuery } from 'mongoose';

import { Article, type ArticleDocument, type ArticleModel, type ArticleStatus } from './model';

export interface CreateArticleInput {
  title: string;
  slug: string;
  subtitle?: string;
  body: string;
  plainText: string;
  category: ArticleDocument['category'];
  subcategory?: string | null;
  location?: string;
  tags?: string[];
  coverImageMediaId?: Types.ObjectId | null;
  coverImageUrl?: string | null;
  media?: Types.ObjectId[];
  authorId: Types.ObjectId;
  organisationId?: Types.ObjectId | null;
}

export async function createArticle(input: CreateArticleInput): Promise<ArticleModel> {
  return Article.create({
    title: input.title,
    slug: input.slug,
    subtitle: input.subtitle ?? '',
    body: input.body,
    plainText: input.plainText,
    category: input.category,
    subcategory: input.subcategory ?? null,
    location: input.location ?? '',
    tags: input.tags ?? [],
    coverImageMediaId: input.coverImageMediaId ?? null,
    coverImageUrl: input.coverImageUrl ?? null,
    media: input.media ?? [],
    authorId: input.authorId,
    organisationId: input.organisationId ?? null,
    status: 'draft',
    version: 0,
  });
}

export async function findById(id: Types.ObjectId | string): Promise<ArticleModel | null> {
  return Article.findOne({ _id: id, deletedAt: null }).exec();
}

export async function findBySlug(slug: string): Promise<ArticleModel | null> {
  return Article.findOne({ slug, deletedAt: null }).exec();
}

/** Does ANY article (incl. soft-deleted) hold this slug? Used by slug
 * generation to avoid colliding even with deleted rows (the slug is meant to
 * be a permanent URL once published). */
export async function slugExists(slug: string): Promise<boolean> {
  const found = await Article.exists({ slug }).exec();
  return found !== null;
}

export interface ListArticlesOptions {
  page?: number;
  limit?: number;
}

export async function listByFilter(
  filter: FilterQuery<ArticleDocument>,
  options: ListArticlesOptions = {},
): Promise<{ items: ArticleModel[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const skip = (page - 1) * limit;
  const merged: FilterQuery<ArticleDocument> = { deletedAt: null, ...filter };

  const [items, total] = await Promise.all([
    Article.find(merged).sort({ updatedAt: -1 }).skip(skip).limit(limit).exec(),
    Article.countDocuments(merged).exec(),
  ]);

  return { items, total };
}

/**
 * Optimistic-concurrency update for a draft. Matches on (id, version,
 * deletedAt:null, status:'draft') and increments the version. Returns null on
 * no-match — the service distinguishes between "not found", "not a draft",
 * and "version conflict" by a follow-up read; in practice we treat null as
 * the version-conflict case.
 */
export async function updateDraftWithVersion(
  id: Types.ObjectId | string,
  version: number,
  patch: Partial<
    Pick<
      ArticleDocument,
      | 'title'
      | 'subtitle'
      | 'body'
      | 'plainText'
      | 'category'
      | 'subcategory'
      | 'location'
      | 'tags'
      | 'coverImageMediaId'
      | 'coverImageUrl'
      | 'media'
    >
  >,
): Promise<ArticleModel | null> {
  const update: UpdateQuery<ArticleDocument> = {
    $set: patch,
    $inc: { version: 1 },
  };
  return Article.findOneAndUpdate({ _id: id, version, deletedAt: null, status: 'draft' }, update, {
    new: true,
  }).exec();
}

export interface TransitionInput {
  id: Types.ObjectId | string;
  fromStatus: ArticleStatus;
  toStatus: ArticleStatus;
  version: number;
  /** Extra fields to set alongside the status flip (e.g. `submittedAt`). */
  set?: Partial<ArticleDocument>;
}

/**
 * State-machine transition with optimistic concurrency. Matches
 * (id, status=fromStatus, version=version, deletedAt:null) and flips status
 * to `toStatus`, bumping `version`. Used by service-layer flows like
 * submitForReview.
 */
export async function transition(input: TransitionInput): Promise<ArticleModel | null> {
  const update: UpdateQuery<ArticleDocument> = {
    $set: { status: input.toStatus, ...(input.set ?? {}) },
    $inc: { version: 1 },
  };
  return Article.findOneAndUpdate(
    { _id: input.id, status: input.fromStatus, version: input.version, deletedAt: null },
    update,
    { new: true },
  ).exec();
}

/**
 * Soft-delete an article. Sets `deletedAt = now`; does NOT bump version (the
 * row is no longer eligible for any further write). Returns the snapshot or
 * null if already deleted / not found.
 */
export async function softDeleteById(id: Types.ObjectId | string): Promise<ArticleModel | null> {
  return Article.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: { deletedAt: new Date() } },
    { new: true },
  ).exec();
}
