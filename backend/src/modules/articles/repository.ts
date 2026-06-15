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

export interface SetAiFieldsInput {
  summary?: string;
  readingTimeMin?: number;
  degraded?: boolean;
  model?: string;
  keywords?: string[];
  ttsAudioUrl?: string | null;
}

/**
 * Write AI-pipeline fields onto an article. Used by `approve` (initial
 * summarize fan-out via `setImmediate`) and `regenerateSummary` (explicit
 * refresh).
 *
 * Does NOT bump `version` or use optimistic concurrency — AI fill-in is an
 * async side-effect that should never conflict with an in-flight editorial
 * action. If an editor unpublishes between the approve transition and the
 * AI write-back, we want the AI fields to land on the unpublished article
 * anyway (still useful when it's re-published) rather than dropping silently.
 *
 * Does NOT filter on status — the same reason. The article may have moved
 * on; the AI fields are still informative. `deletedAt:null` IS enforced so
 * we don't resurrect soft-deleted rows.
 */
export async function setAiFields(
  id: Types.ObjectId | string,
  fields: SetAiFieldsInput,
): Promise<ArticleModel | null> {
  // Build a dotted-path $set so we update sub-fields of `ai` without clobbering
  // the others (e.g. `keywords` set by a different path shouldn't get nuked
  // by a summary-only write).
  const set: Record<string, unknown> = {};
  if (fields.summary !== undefined) set['ai.summary'] = fields.summary;
  if (fields.readingTimeMin !== undefined) set['ai.readingTimeMin'] = fields.readingTimeMin;
  if (fields.degraded !== undefined) set['ai.degraded'] = fields.degraded;
  if (fields.model !== undefined) set['ai.model'] = fields.model;
  if (fields.keywords !== undefined) set['ai.keywords'] = fields.keywords;
  if (fields.ttsAudioUrl !== undefined) set['ai.ttsAudioUrl'] = fields.ttsAudioUrl;

  if (Object.keys(set).length === 0) {
    return Article.findOne({ _id: id, deletedAt: null }).exec();
  }

  return Article.findOneAndUpdate(
    { _id: id, deletedAt: null },
    { $set: set },
    { new: true },
  ).exec();
}

export interface SetPlacementInput {
  featured?: boolean;
  trending?: boolean;
  trail?: boolean;
  priority?: number;
}

/**
 * Optimistic-concurrency update for an article's placement sub-document. Only
 * `published` articles can have placement (a draft being "featured" makes no
 * sense). Matches (id, version, deletedAt:null, status:'published') and
 * increments version. Returns null on no-match — service maps that to 409
 * VERSION_CONFLICT or 409 INVALID_STATE depending on which discriminator was
 * the cause (service re-reads to differentiate).
 *
 * Dotted-path $set so we update only the requested placement fields and leave
 * the others untouched.
 */
export async function setPlacementWithVersion(
  id: Types.ObjectId | string,
  version: number,
  fields: SetPlacementInput,
): Promise<ArticleModel | null> {
  const set: Record<string, unknown> = {};
  if (fields.featured !== undefined) set['placement.featured'] = fields.featured;
  if (fields.trending !== undefined) set['placement.trending'] = fields.trending;
  if (fields.trail !== undefined) set['placement.trail'] = fields.trail;
  if (fields.priority !== undefined) set['placement.priority'] = fields.priority;

  const update: UpdateQuery<ArticleDocument> = {
    $set: set,
    $inc: { version: 1 },
  };
  return Article.findOneAndUpdate(
    { _id: id, version, deletedAt: null, status: 'published' },
    update,
    { new: true },
  ).exec();
}

// ═══ Subphase 5 — public reader queries ═════════════════════════════════
//
// All `published`-status reads with `deletedAt:null`. No RBAC at this layer —
// these are the public reader surface. Sorted `publishedAt desc` for the
// usual "newest first" reader expectation; trending uses `stats.trendingScore`
// as the primary sort key.

export interface PublicListFilter {
  category?: ArticleDocument['category'];
  location?: string;
  dateFrom?: Date;
  dateTo?: Date;
}

/**
 * Public reader list: published-only articles matching the optional filters.
 * Backs `GET /v1/articles?category=...&location=...&dateFrom=...&dateTo=...`
 * per docs/05-api-documentation.md §5.5 + docs/13-feature-documentation.md A1.
 *
 * Index plan: `category_publishedAt` and `location_publishedAt` cover the
 * common per-section reader sweeps; `status_publishedAt` covers the
 * unfiltered case. Date-range filtering composes onto the `publishedAt` key
 * of whichever compound index gets selected.
 */
export async function listPublicByFilter(
  filter: PublicListFilter,
  options: ListArticlesOptions = {},
): Promise<{ items: ArticleModel[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const query: FilterQuery<ArticleDocument> = { status: 'published', deletedAt: null };
  if (filter.category) query.category = filter.category;
  if (filter.location) query.location = filter.location;
  if (filter.dateFrom || filter.dateTo) {
    const dateRange: Record<string, Date> = {};
    if (filter.dateFrom) dateRange.$gte = filter.dateFrom;
    if (filter.dateTo) dateRange.$lte = filter.dateTo;
    query.publishedAt = dateRange;
  }

  const [items, total] = await Promise.all([
    Article.find(query).sort({ publishedAt: -1 }).skip(skip).limit(limit).exec(),
    Article.countDocuments(query).exec(),
  ]);

  return { items, total };
}

export interface HomeFeedSections {
  trail: ArticleModel[];
  /**
   * All editorially-flagged featured articles, sorted by `placement.priority`
   * desc then `publishedAt` desc, capped at `HOME_FEATURED_LIMIT`. The FE
   * renders the first one as the lead hero and rotates through the rest as
   * a carousel. Empty array when nothing is flagged.
   */
  featured: ArticleModel[];
  latest: ArticleModel[];
}

/**
 * Home-feed slices in one Promise.all — three independent indexed queries.
 * The service composes these with the trending feed into the composite
 * `feed:home` cache payload.
 *
 * Limits per docs/13-feature-documentation.md A3:
 *   - trail (placement.trail=true) → up to 8 (horizontal scroll strip)
 *   - featured (placement.featured=true, priority desc) → up to 5 (carousel)
 *   - latest (status=published) → 20 (FE paginates beyond)
 */
const HOME_TRAIL_LIMIT = 8;
const HOME_FEATURED_LIMIT = 5;
const HOME_LATEST_LIMIT = 20;

export async function findHomeFeedSections(): Promise<HomeFeedSections> {
  const baseFilter = { status: 'published' as const, deletedAt: null };
  const [trail, featured, latest] = await Promise.all([
    Article.find({ ...baseFilter, 'placement.trail': true })
      .sort({ publishedAt: -1 })
      .limit(HOME_TRAIL_LIMIT)
      .exec(),
    Article.find({ ...baseFilter, 'placement.featured': true })
      .sort({ 'placement.priority': -1, publishedAt: -1 })
      .limit(HOME_FEATURED_LIMIT)
      .exec(),
    Article.find(baseFilter).sort({ publishedAt: -1 }).limit(HOME_LATEST_LIMIT).exec(),
  ]);
  return { trail, featured, latest };
}

/**
 * Fallback for the trending feed when the `feed:trending` Redis key is cold
 * (cron hasn't populated it yet, or in a fresh test env). Sorts by the
 * denormalised `stats.trendingScore` (written by the 5-d cron) with
 * `publishedAt desc` as a tiebreaker so brand-new articles aren't pinned
 * to the bottom forever.
 */
export async function findTrendingFallback(limit: number): Promise<ArticleModel[]> {
  return Article.find({ status: 'published', deletedAt: null })
    .sort({ 'stats.trendingScore': -1, publishedAt: -1 })
    .limit(limit)
    .exec();
}

/**
 * Editorially-pinned trending articles — `placement.trending = true`. These
 * lead the Trending rail ahead of the automatic engagement-scored set, letting
 * an editor surface a story before its view/save score catches up. Ordered by
 * `placement.priority` desc (the same editorial knob as Featured) then
 * `publishedAt` desc. The `placement_trending_score` index serves the equality
 * match on `placement.trending`.
 */
export async function findPinnedTrending(limit: number): Promise<ArticleModel[]> {
  return Article.find({ status: 'published', deletedAt: null, 'placement.trending': true })
    .sort({ 'placement.priority': -1, publishedAt: -1 })
    .limit(limit)
    .exec();
}

/**
 * Hydrate a list of article IDs into published `ArticleModel` docs, preserving
 * the input order. Filters out IDs that don't resolve to a published, non-
 * soft-deleted article (e.g. a previously-trending article that's since been
 * unpublished — drop it rather than show a 404'ing card).
 *
 * Used by the trending feed to materialise the cached `feed:trending` ID list
 * the cron writes.
 */
export async function findByIdsPreservingOrder(
  ids: ReadonlyArray<string>,
): Promise<ArticleModel[]> {
  if (ids.length === 0) return [];
  const valid = ids.filter((id) => /^[0-9a-fA-F]{24}$/.test(id));
  if (valid.length === 0) return [];
  const docs = await Article.find({
    _id: { $in: valid },
    status: 'published',
    deletedAt: null,
  }).exec();
  const byId = new Map(docs.map((d) => [d._id.toString(), d]));
  const out: ArticleModel[] = [];
  for (const id of ids) {
    const doc = byId.get(id);
    if (doc) out.push(doc);
  }
  return out;
}

/**
 * Atomic adjustment of the denormalised `stats.bookmarks` counter. Used by
 * the bookmarks module (5-b) on add (+1) and remove (-1). Best-effort: a
 * counter write failure is logged at the call site but never rolls back the
 * user-intent action.
 *
 * No status / deletedAt filter — even unpublished or soft-deleted articles
 * keep a counter, so removing a stale bookmark against an unpublished
 * article still corrects the count rather than leaving it stuck high. The
 * schema's `min: 0` defends the final stored value.
 */
export async function adjustBookmarkCount(
  id: Types.ObjectId | string,
  delta: number,
): Promise<void> {
  await Article.updateOne({ _id: id }, { $inc: { 'stats.bookmarks': delta } }).exec();
}

/**
 * Atomic adjustment of the denormalised `stats.commentsCount` counter — the
 * number of APPROVED (publicly visible) comments on an article. Maintained by
 * the comments module: +1 when a comment transitions INTO `approved`, -1 when
 * an approved comment transitions out (rejected/hidden) or an approved comment
 * is deleted. Best-effort, same contract as `adjustBookmarkCount`; the
 * schema's `min: 0` defends the final stored value.
 */
export async function adjustCommentCount(
  id: Types.ObjectId | string,
  delta: number,
): Promise<void> {
  await Article.updateOne({ _id: id }, { $inc: { 'stats.commentsCount': delta } }).exec();
}

/**
 * Atomic `$inc` of `stats.views`. Used by the analytics writer (5-c) on the
 * `view` event. Best-effort: a failed counter write doesn't roll back the
 * raw `analytics_events` insert.
 */
export async function adjustViewCount(id: Types.ObjectId | string, delta: number): Promise<void> {
  await Article.updateOne({ _id: id }, { $inc: { 'stats.views': delta } }).exec();
}

/**
 * Atomic `$inc` of `stats.uniqueReaders`. The analytics service gates this
 * behind a "first read_complete by this user on this article" check so two
 * `read_complete` events from the same user don't double-count.
 */
export async function adjustUniqueReaderCount(
  id: Types.ObjectId | string,
  delta: number,
): Promise<void> {
  await Article.updateOne({ _id: id }, { $inc: { 'stats.uniqueReaders': delta } }).exec();
}

/**
 * Atomic `$inc` of `stats.shares`. Driven by the `share` analytics event.
 */
export async function adjustShareCount(id: Types.ObjectId | string, delta: number): Promise<void> {
  await Article.updateOne({ _id: id }, { $inc: { 'stats.shares': delta } }).exec();
}

/**
 * List the `_id`s of every non-soft-deleted article authored by `authorId`.
 * Used by the analytics module to scope per-author stats queries. Returns a
 * thin id-only projection — full doc reads happen at the service layer when
 * the caller needs them.
 */
export async function listIdsByAuthor(
  authorId: Types.ObjectId | string,
): Promise<Types.ObjectId[]> {
  const docs = await Article.find({ authorId, deletedAt: null }, { _id: 1 }).lean().exec();
  return docs.map((d) => d._id);
}
