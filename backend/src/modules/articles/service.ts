/**
 * Articles service — business logic for the articles module.
 *
 * Subphase 3 surface (authors):
 *   - createDraft, updateDraft, getArticleById, listArticles,
 *     submitForReview, softDeleteArticle
 *
 * Subphase 4 surface (editors + admins + the AI pipeline):
 *   - approveArticle      — submitted → approved; fires AI pipeline async
 *   - rejectArticle       — submitted → rejected with a reason
 *   - publishArticle      — approved OR unpublished → published; invalidates slug + feed caches
 *   - unpublishArticle    — published → unpublished; invalidates slug + feed caches
 *   - setPlacement        — placement flags on a published article (OCC)
 *   - regenerateSummary   — force re-summarize via aiProxy; invalidate slug cache
 *   - getArticleBySlug    — public read of a published article (cached)
 *
 * Cross-cutting:
 *   - Body sanitized server-side; plainText authoritative for char counts.
 *   - Optimistic concurrency on every state-flipping write.
 *   - Media refCount accounting on create/update/softDelete.
 *   - AI pipeline fan-out happens AFTER approval commits, via setImmediate.
 *     A failed AI call never blocks or rolls back the approval — the article
 *     persists with `ai.degraded=true` and an audit warning, and a Phase 2
 *     backfill cron will retry.
 *   - Cache invalidation is best-effort. `cache.del` swallows + logs Redis
 *     errors so a Redis hiccup never blocks publish/unpublish.
 */
import slugify from 'slugify';
import { Types } from 'mongoose';

import { auditLog, auditWarn } from '@/shared/audit';
import { ApiError } from '@/shared/errors';
import { ErrorCode } from '@/shared/errors/errorCodes';
import { cache } from '@/shared';
import { aiProxy } from '@/modules/ai-proxy';
import { mediaRepo } from '@/modules/media';
import { usersRepo } from '@/modules/users';
import { logger } from '@/config/logger';

import { articleEvents } from './events';
import type { ArticleModel, ArticleStatus } from './model';
import * as articlesRepo from './repository';
import { plainTextFromHtml, sanitizeArticleBody } from './sanitize';

import type { ArticleCategory } from '@/shared/constants/articleCategories';
import type { UserRole } from '@/modules/users';

const WORDS_PER_MINUTE = 200;

const MIN_PLAIN_TEXT_CHARS = 300;
const MAX_TITLE_CHARS = 200;
const MIN_TAGS = 1;
const MAX_TAGS = 10;

function toObjectIdArray(ids: ReadonlyArray<string | Types.ObjectId>): Types.ObjectId[] {
  return ids.map((id) => (id instanceof Types.ObjectId ? id : new Types.ObjectId(id)));
}

function dedupeObjectIds(ids: ReadonlyArray<Types.ObjectId>): Types.ObjectId[] {
  const seen = new Set<string>();
  const out: Types.ObjectId[] = [];
  for (const id of ids) {
    const k = id.toString();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(id);
    }
  }
  return out;
}

/**
 * Slug from title with `-2`, `-3`, ... collision suffix. Slugs are PERMANENT
 * once set — articles never re-slug on title edits in MVP, so this only runs
 * at createDraft. Even soft-deleted articles count for the collision check
 * (the URL is supposed to remain stable post-publish).
 */
async function generateUniqueSlug(title: string): Promise<string> {
  const base = slugify(title, { lower: true, strict: true, trim: true }) || 'article';
  let candidate = base;
  let counter = 1;
  // eslint-disable-next-line no-await-in-loop
  while (await articlesRepo.slugExists(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

/**
 * Resolve a coverImage media id to a public URL via mediaRepo. Returns null
 * if no id supplied. Throws 422 if the id is supplied but no media doc exists.
 */
async function resolveCoverUrl(coverImageMediaId: Types.ObjectId | null): Promise<string | null> {
  if (!coverImageMediaId) return null;
  const cover = await mediaRepo.findById(coverImageMediaId);
  if (!cover) {
    throw ApiError.validation('coverImageMediaId references a non-existent media doc', {
      coverImageMediaId: coverImageMediaId.toString(),
    });
  }
  return cover.url;
}

/**
 * Bump refCount on every media id referenced by a freshly-saved article. The
 * `dedupeObjectIds` step prevents a single doc from being counted twice when
 * the cover image is also in the embed list.
 */
async function bumpMediaRefs(mediaIds: Types.ObjectId[]): Promise<void> {
  await Promise.all(dedupeObjectIds(mediaIds).map((id) => mediaRepo.adjustRefCount(id, +1)));
}

async function decrementMediaRefs(mediaIds: Types.ObjectId[]): Promise<void> {
  await Promise.all(dedupeObjectIds(mediaIds).map((id) => mediaRepo.adjustRefCount(id, -1)));
}

/**
 * Apply the diff between an article's previous and new media id sets:
 * decrement refCount on removed refs, bump on added refs. Unchanged ids are
 * left alone.
 */
async function reconcileMediaRefs(
  before: Types.ObjectId[],
  after: Types.ObjectId[],
): Promise<void> {
  const beforeSet = new Set(before.map((id) => id.toString()));
  const afterSet = new Set(after.map((id) => id.toString()));
  const added = after.filter((id) => !beforeSet.has(id.toString()));
  const removed = before.filter((id) => !afterSet.has(id.toString()));
  await Promise.all([
    ...added.map((id) => mediaRepo.adjustRefCount(id, +1)),
    ...removed.map((id) => mediaRepo.adjustRefCount(id, -1)),
  ]);
}

// ─── view shaping ───────────────────────────────────────────────────────

interface AuthorView {
  id: string;
  name: string;
}

interface ArticleListItemView {
  [key: string]: unknown;
  author: AuthorView | null;
}

/**
 * Batch-load authors for a set of article authorIds. Returns a Map keyed by
 * the user id string so callers can attach `author: { id, name }` alongside
 * the existing `authorId` reference. Includes soft-deleted users — an
 * article outlives its author account, and the byline should still render
 * if the author was later deactivated.
 */
async function loadAuthorsByIds(
  authorIds: ReadonlyArray<Types.ObjectId>,
): Promise<Map<string, AuthorView>> {
  const unique = dedupeObjectIds(authorIds);
  if (unique.length === 0) return new Map();
  const users = await usersRepo.findManyByIds(unique);
  return new Map(users.map((u) => [u._id.toString(), { id: u._id.toString(), name: u.name }]));
}

// ─── create draft ───────────────────────────────────────────────────────

export interface CreateDraftInput {
  authorId: string;
  organisationId: string | null;
  title: string;
  subtitle?: string;
  body?: string;
  category: ArticleCategory;
  subcategory?: string | null;
  location?: string;
  tags?: string[];
  coverImageMediaId?: string | null;
  mediaIds?: string[];
}

export async function createDraft(input: CreateDraftInput): Promise<ArticleModel> {
  const authorObjectId = new Types.ObjectId(input.authorId);
  const orgObjectId = input.organisationId ? new Types.ObjectId(input.organisationId) : null;

  const cover = input.coverImageMediaId ? new Types.ObjectId(input.coverImageMediaId) : null;
  const embeds = toObjectIdArray(input.mediaIds ?? []);
  // The `media[]` array is the canonical reference list — it includes the
  // cover image AND every embed. Dedupe so refCount accounting is correct.
  const allMedia = dedupeObjectIds(cover ? [cover, ...embeds] : embeds);

  const coverUrl = await resolveCoverUrl(cover);
  const sanitizedBody = input.body ? sanitizeArticleBody(input.body) : '';
  const plainText = sanitizedBody ? plainTextFromHtml(sanitizedBody) : '';

  const slug = await generateUniqueSlug(input.title);

  const article = await articlesRepo.createArticle({
    title: input.title,
    slug,
    subtitle: input.subtitle,
    body: sanitizedBody,
    plainText,
    category: input.category,
    subcategory: input.subcategory ?? null,
    location: input.location,
    tags: input.tags ?? [],
    coverImageMediaId: cover,
    coverImageUrl: coverUrl,
    media: allMedia,
    authorId: authorObjectId,
    organisationId: orgObjectId,
  });

  await bumpMediaRefs(allMedia);

  auditLog(
    {
      entity: 'article',
      entityId: article._id.toString(),
      action: 'created',
      actor: input.authorId,
      details: { category: input.category, slug },
    },
    'article_created',
  );

  articleEvents.emit('article.created', {
    articleId: article._id.toString(),
    authorId: input.authorId,
    category: input.category,
  });

  return article;
}

// ─── update draft ───────────────────────────────────────────────────────

export interface UpdateDraftInput {
  articleId: string;
  actorId: string;
  actorRole: UserRole;
  version: number;
  patch: {
    title?: string;
    subtitle?: string;
    body?: string;
    category?: ArticleCategory;
    subcategory?: string | null;
    location?: string;
    tags?: string[];
    coverImageMediaId?: string | null;
    mediaIds?: string[];
  };
}

export async function updateDraft(input: UpdateDraftInput): Promise<ArticleModel> {
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }

  const existing = await articlesRepo.findById(input.articleId);
  if (!existing) {
    throw ApiError.notFound('Article not found');
  }
  if (existing.status !== 'draft') {
    throw ApiError.invalidState('Only draft articles can be edited at this surface');
  }

  // RBAC: author owns their draft; editors/admins can also edit drafts (for
  // copy-edit during review handoff). Readers and other authors are denied.
  const isOwner = existing.authorId.toString() === input.actorId;
  const isPrivileged = input.actorRole === 'editor' || input.actorRole === 'admin';
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('Not permitted to edit this article');
  }

  const set: Record<string, unknown> = {};
  let newMedia = existing.media;
  let coverChanged = false;

  if (input.patch.title !== undefined) set.title = input.patch.title;
  if (input.patch.subtitle !== undefined) set.subtitle = input.patch.subtitle;
  if (input.patch.category !== undefined) set.category = input.patch.category;
  if (input.patch.subcategory !== undefined) set.subcategory = input.patch.subcategory ?? null;
  if (input.patch.location !== undefined) set.location = input.patch.location;
  if (input.patch.tags !== undefined) set.tags = input.patch.tags;

  if (input.patch.body !== undefined) {
    const sanitized = sanitizeArticleBody(input.patch.body);
    set.body = sanitized;
    set.plainText = plainTextFromHtml(sanitized);
  }

  if (input.patch.coverImageMediaId !== undefined) {
    coverChanged = true;
    const cover = input.patch.coverImageMediaId
      ? new Types.ObjectId(input.patch.coverImageMediaId)
      : null;
    set.coverImageMediaId = cover;
    set.coverImageUrl = await resolveCoverUrl(cover);
  }

  if (input.patch.mediaIds !== undefined || coverChanged) {
    // When the patch explicitly changes the cover (`coverChanged`), trust the
    // new value even if it's null — Remove sends `coverImageMediaId: null` and
    // a `??` fallback would incorrectly keep the old cover in `media[]` as an
    // orphan (#35).
    const cover = coverChanged
      ? (set.coverImageMediaId as Types.ObjectId | null)
      : existing.coverImageMediaId;
    const embeds = input.patch.mediaIds
      ? toObjectIdArray(input.patch.mediaIds)
      : existing.media.filter((m) => m.toString() !== existing.coverImageMediaId?.toString());
    newMedia = dedupeObjectIds(cover ? [cover, ...embeds] : embeds);
    set.media = newMedia;
  }

  const updated = await articlesRepo.updateDraftWithVersion(existing._id, input.version, set);

  if (!updated) {
    // The match might have failed for THREE reasons: version mismatch, the
    // article was soft-deleted concurrently, or the status changed off-draft.
    // The most useful classification for the FE is VERSION_CONFLICT since
    // the row still exists and is reachable — the FE refetches + retries.
    throw new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Article was modified elsewhere', {
      details: { currentVersion: existing.version },
    });
  }

  // After the row is updated, reconcile media refCounts to match `newMedia`.
  // Doing this AFTER the write means a concurrency-rejected update doesn't
  // mis-adjust refCounts.
  if (set.media) {
    await reconcileMediaRefs(existing.media, newMedia);
  }

  auditLog(
    {
      entity: 'article',
      entityId: updated._id.toString(),
      action: 'draft_updated',
      actor: input.actorId,
      details: { fields: Object.keys(set), version: updated.version },
    },
    'article_draft_updated',
  );

  return updated;
}

// ─── reads ──────────────────────────────────────────────────────────────

export interface ArticleViewer {
  id: string;
  role: UserRole;
}

/**
 * Read a single article by id. In Subphase 3 the visible scope is the article's
 * author + editors + admins (drafts and submitted articles are not public).
 * Subphase 4 widens this to "published" articles being readable without auth.
 */
export async function getArticleById(
  id: string,
  viewer: ArticleViewer | null,
): Promise<ArticleListItemView> {
  if (!Types.ObjectId.isValid(id)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(id);
  if (!article) throw ApiError.notFound('Article not found');

  if (!viewer) throw ApiError.unauthorized();
  const isOwner = article.authorId.toString() === viewer.id;
  const isPrivileged = viewer.role === 'editor' || viewer.role === 'admin';
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('Not permitted to view this article');
  }

  const authors = await loadAuthorsByIds([article.authorId]);
  return {
    ...(article.toJSON() as Record<string, unknown>),
    author: authors.get(article.authorId.toString()) ?? null,
  };
}

export interface ListInput {
  /** Filter to a specific subset of statuses. Single value or list. */
  status?: ArticleStatus[];
  /** 'me' resolves to the viewer's id; anything else passes through for editor/admin. */
  authorId?: string | 'me';
  page?: number;
  limit?: number;
  viewer: ArticleViewer;
}

export async function listArticles(input: ListInput): Promise<{
  items: ArticleListItemView[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: Record<string, unknown> = {};
  if (input.status?.length) {
    filter.status = input.status.length === 1 ? input.status[0] : { $in: input.status };
  }

  // RBAC + scope:
  //  - authors are restricted to their own articles regardless of the
  //    authorId param.
  //  - editors and admins may scope by authorId or omit it for a broader list.
  if (input.viewer.role === 'author' || input.viewer.role === 'reader') {
    filter.authorId = new Types.ObjectId(input.viewer.id);
  } else if (input.authorId === 'me') {
    filter.authorId = new Types.ObjectId(input.viewer.id);
  } else if (input.authorId) {
    if (!Types.ObjectId.isValid(input.authorId)) {
      throw ApiError.validation('Invalid authorId');
    }
    filter.authorId = new Types.ObjectId(input.authorId);
  }

  const { items, total } = await articlesRepo.listByFilter(filter, {
    page: input.page,
    limit: input.limit,
  });

  const authors = await loadAuthorsByIds(items.map((a) => a.authorId));
  const shaped: ArticleListItemView[] = items.map((a) => ({
    ...(a.toJSON() as Record<string, unknown>),
    author: authors.get(a.authorId.toString()) ?? null,
  }));

  return { items: shaped, total, page: input.page ?? 1, limit: input.limit ?? 20 };
}

// ─── submit for review ──────────────────────────────────────────────────

/**
 * Submit a draft for editor review. Enforces the full validation table from
 * docs/07-workflows.md §7.1 (`draft → submitted`):
 *   - actor is the author of the article
 *   - title non-empty, ≤ 200 chars
 *   - plainText ≥ 300 chars
 *   - category set to valid enum (schema already enforces; defensive recheck)
 *   - coverImageMediaId present
 *   - tags array length 1–10
 *   - author isActive AND isEmailVerified
 *   - article currently in `draft` state (optimistic concurrency on version)
 */
export async function submitForReview(articleId: string, userId: string): Promise<ArticleModel> {
  if (!Types.ObjectId.isValid(articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(articleId);
  if (!article) throw ApiError.notFound('Article not found');

  if (article.status !== 'draft') {
    throw ApiError.invalidState('Only draft articles can be submitted');
  }
  if (article.authorId.toString() !== userId) {
    throw ApiError.forbidden('Only the author can submit this article');
  }

  const author = await usersRepo.findById(userId);
  if (!author || author.deletedAt !== null) {
    throw ApiError.unauthorized('User no longer exists');
  }
  if (!author.isActive) {
    throw new ApiError(403, ErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
  }
  if (!author.isEmailVerified) {
    throw new ApiError(
      403,
      ErrorCode.EMAIL_NOT_VERIFIED,
      'Email must be verified before submitting',
    );
  }

  // ─── content validation (precise per-field 422s so the FE can render
  // inline errors next to the offending input) ───────────────────────
  if (!article.title || article.title.trim().length === 0) {
    throw ApiError.validation('Title is required', { field: 'title' });
  }
  if (article.title.length > MAX_TITLE_CHARS) {
    throw ApiError.validation(`Title exceeds ${MAX_TITLE_CHARS}-character limit`, {
      field: 'title',
      limit: MAX_TITLE_CHARS,
    });
  }
  if (!article.plainText || article.plainText.length < MIN_PLAIN_TEXT_CHARS) {
    throw ApiError.validation(
      `Body must be at least ${MIN_PLAIN_TEXT_CHARS} characters of plain text`,
      {
        field: 'body',
        currentLength: article.plainText?.length ?? 0,
        minLength: MIN_PLAIN_TEXT_CHARS,
      },
    );
  }
  if (!article.coverImageMediaId) {
    throw ApiError.validation('Cover image is required', { field: 'coverImageMediaId' });
  }
  if (!article.tags || article.tags.length < MIN_TAGS || article.tags.length > MAX_TAGS) {
    throw ApiError.validation(`Tags must contain between ${MIN_TAGS} and ${MAX_TAGS} entries`, {
      field: 'tags',
      currentCount: article.tags?.length ?? 0,
      min: MIN_TAGS,
      max: MAX_TAGS,
    });
  }

  // ─── state transition ─────────────────────────────────────────────
  const transitioned = await articlesRepo.transition({
    id: article._id,
    fromStatus: 'draft',
    toStatus: 'submitted',
    version: article.version,
    set: { submittedAt: new Date() },
  });
  if (!transitioned) {
    throw new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Article was modified elsewhere', {
      details: { currentVersion: article.version },
    });
  }

  // ─── notify editors of the section (Subphase 3 STUB: audit-log only). ──
  // The real notifications module subscribes to `article.submitted` in
  // Subphase 4 and persists in-app + email notifications. For now we look up
  // active editors whose sectionsOwned includes this category and emit the
  // event so the audit trail records who would have been notified.
  const editors = await usersRepo.findActiveEditorsForSection(article.category);
  const notifyEditorIds = editors.map((e) => e._id.toString());

  auditLog(
    {
      entity: 'article',
      entityId: transitioned._id.toString(),
      action: 'submitted',
      actor: userId,
      details: { category: article.category, notifyEditorIds },
    },
    'article_submitted',
  );

  articleEvents.emit('article.submitted', {
    articleId: transitioned._id.toString(),
    authorId: userId,
    category: article.category,
    notifyEditorIds,
  });

  return transitioned;
}

// ─── soft delete ────────────────────────────────────────────────────────

export interface SoftDeleteInput {
  articleId: string;
  actorId: string;
  actorRole: UserRole;
}

export async function softDeleteArticle(input: SoftDeleteInput): Promise<void> {
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(input.articleId);
  if (!article) throw ApiError.notFound('Article not found');

  const isOwner = article.authorId.toString() === input.actorId;
  const isPrivileged = input.actorRole === 'editor' || input.actorRole === 'admin';
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('Not permitted to delete this article');
  }

  const deleted = await articlesRepo.softDeleteById(article._id);
  if (!deleted) {
    // Concurrent delete — treat as success (idempotent).
    return;
  }

  // Decrement refCount on every media this article referenced.
  await decrementMediaRefs(article.media);

  auditLog(
    {
      entity: 'article',
      entityId: article._id.toString(),
      action: 'soft_deleted',
      actor: input.actorId,
      details: { status: article.status, mediaCount: article.media.length },
    },
    'article_soft_deleted',
  );
}

// ═══ Subphase 4 surface ═════════════════════════════════════════════════
//
// Editorial workflow (approve / reject / publish / unpublish / placement)
// plus the AI pipeline orchestration on approve. Service-layer RBAC checks
// supplement the route-layer requireRole — defense in depth.

function wordCount(text: string): number {
  if (!text) return 0;
  return text
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

/** Cache keys that should be invalidated when an article's public view
 * changes (publish, unpublish, regenerate-AI on a published article). */
function publicCacheKeys(slug: string, category: ArticleCategory): string[] {
  return [
    cache.cacheKeys.articleSlug(slug),
    cache.cacheKeys.feedHome(),
    cache.cacheKeys.feedTrending(),
    cache.cacheKeys.feedCategory(category),
  ];
}

/**
 * Background fan-out for the AI summary after an article is approved.
 * Runs via `setImmediate` from `approveArticle` so the HTTP response returns
 * before the AI call starts. NEVER throws — failures are audit-warn'd and
 * eaten so an AI outage can't block or roll back the approval.
 *
 * Two writes: the AI summary fields land via `setAiFields` (does not bump
 * version — see repo.ts for why). If the AI proxy returns degraded=true,
 * we still write the (empty) summary + degraded flag so the FE can show
 * "summary unavailable" without a separate "did we even try" check.
 */
async function runApprovalAiPipeline(article: ArticleModel): Promise<void> {
  try {
    const text = article.plainText ?? '';
    const [summarizeResult, readingTimeMin] = await Promise.all([
      aiProxy.summarize(text, { maxWords: 60, style: 'neutral' }),
      Promise.resolve(Math.ceil(wordCount(text) / WORDS_PER_MINUTE)),
    ]);

    await articlesRepo.setAiFields(article._id, {
      summary: summarizeResult.summary,
      readingTimeMin,
      degraded: summarizeResult.degraded,
      model: summarizeResult.model,
    });

    auditLog(
      {
        entity: 'article',
        entityId: article._id.toString(),
        action: 'ai_pipeline_completed',
        details: {
          degraded: summarizeResult.degraded,
          model: summarizeResult.model,
          readingTimeMin,
          summaryLength: summarizeResult.summary.length,
        },
      },
      'article_ai_pipeline_completed',
    );
  } catch (err) {
    // Should never trip because aiProxy's fallback swallows breaker
    // rejections — but if axios construction itself fails or setAiFields
    // hits a DB error, we land here. Audit-warn, don't rethrow.
    auditWarn(
      {
        entity: 'article',
        entityId: article._id.toString(),
        action: 'ai_pipeline_failed',
        details: { error: err instanceof Error ? err.message : String(err) },
      },
      'article_ai_pipeline_failed',
    );
  }
}

// ─── approve ────────────────────────────────────────────────────────────

export interface ApproveArticleInput {
  articleId: string;
  actorId: string;
  actorRole: UserRole;
}

/**
 * Editor / admin approves a submitted article. Transitions to `approved`,
 * records the approver, and schedules the AI summary fan-out via setImmediate
 * so the response returns instantly. The AI pipeline never blocks or
 * rolls back this state change.
 */
export async function approveArticle(input: ApproveArticleInput): Promise<ArticleModel> {
  if (input.actorRole !== 'editor' && input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only editors or admins can approve articles');
  }
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(input.articleId);
  if (!article) throw ApiError.notFound('Article not found');
  if (article.status !== 'submitted') {
    throw ApiError.invalidState('Only submitted articles can be approved');
  }
  // COI guard: editor/admin who authored the submission cannot approve it.
  // Added in the #32 fix-PR alongside widening submit to accept editor —
  // the original code prevented the scenario by keeping editor off submit;
  // we now allow editor to submit and block self-approve here instead.
  if (article.authorId.toString() === input.actorId) {
    throw ApiError.forbidden('You cannot approve your own submission');
  }

  const transitioned = await articlesRepo.transition({
    id: article._id,
    fromStatus: 'submitted',
    toStatus: 'approved',
    version: article.version,
    set: { approvedAt: new Date(), editorId: new Types.ObjectId(input.actorId) },
  });
  if (!transitioned) {
    throw new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Article was modified elsewhere', {
      details: { currentVersion: article.version },
    });
  }

  auditLog(
    {
      entity: 'article',
      entityId: transitioned._id.toString(),
      action: 'approved',
      actor: input.actorId,
      details: { category: article.category },
    },
    'article_approved',
  );

  articleEvents.emit('article.approved', {
    articleId: transitioned._id.toString(),
    authorId: article.authorId.toString(),
    editorId: input.actorId,
    category: article.category,
  });

  // Fire AI pipeline async — don't await. `runApprovalAiPipeline` is its own
  // error boundary; `.catch` here is defence-in-depth in case the function
  // signature ever drifts.
  setImmediate(() => {
    void runApprovalAiPipeline(transitioned).catch((err: unknown) => {
      logger.warn({ err, articleId: transitioned._id.toString() }, 'ai_pipeline_unhandled');
    });
  });

  return transitioned;
}

// ─── reject ─────────────────────────────────────────────────────────────

export interface RejectArticleInput {
  articleId: string;
  actorId: string;
  actorRole: UserRole;
  rejectionReason: string;
}

export async function rejectArticle(input: RejectArticleInput): Promise<ArticleModel> {
  if (input.actorRole !== 'editor' && input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only editors or admins can reject articles');
  }
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(input.articleId);
  if (!article) throw ApiError.notFound('Article not found');
  if (article.status !== 'submitted') {
    throw ApiError.invalidState('Only submitted articles can be rejected');
  }

  const transitioned = await articlesRepo.transition({
    id: article._id,
    fromStatus: 'submitted',
    toStatus: 'rejected',
    version: article.version,
    set: {
      rejectionReason: input.rejectionReason,
      editorId: new Types.ObjectId(input.actorId),
    },
  });
  if (!transitioned) {
    throw new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Article was modified elsewhere', {
      details: { currentVersion: article.version },
    });
  }

  auditLog(
    {
      entity: 'article',
      entityId: transitioned._id.toString(),
      action: 'rejected',
      actor: input.actorId,
      details: { category: article.category, rejectionReason: input.rejectionReason },
    },
    'article_rejected',
  );

  articleEvents.emit('article.rejected', {
    articleId: transitioned._id.toString(),
    authorId: article.authorId.toString(),
    editorId: input.actorId,
    category: article.category,
    rejectionReason: input.rejectionReason,
  });

  return transitioned;
}

// ─── publish ────────────────────────────────────────────────────────────

export interface PublishArticleInput {
  articleId: string;
  actorId: string;
  actorRole: UserRole;
}

export async function publishArticle(input: PublishArticleInput): Promise<ArticleModel> {
  if (input.actorRole !== 'editor' && input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only editors or admins can publish articles');
  }
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(input.articleId);
  if (!article) throw ApiError.notFound('Article not found');
  if (article.status !== 'approved' && article.status !== 'unpublished') {
    throw ApiError.invalidState('Only approved or unpublished articles can be published');
  }

  const transitioned = await articlesRepo.transition({
    id: article._id,
    fromStatus: article.status,
    toStatus: 'published',
    version: article.version,
    set: { publishedAt: article.publishedAt ?? new Date() },
  });
  if (!transitioned) {
    throw new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Article was modified elsewhere', {
      details: { currentVersion: article.version },
    });
  }

  // Best-effort cache invalidation. `cache.del` swallows errors internally
  // so a Redis hiccup can't block the publish. The slug cache is the most
  // critical — a stale read would 404 because the pre-publish version
  // returned 404 from getArticleBySlug; cache TTL of 5min is the upper
  // bound on staleness.
  await cache.del(...publicCacheKeys(transitioned.slug, article.category));

  auditLog(
    {
      entity: 'article',
      entityId: transitioned._id.toString(),
      action: 'published',
      actor: input.actorId,
      details: { category: article.category, slug: transitioned.slug },
    },
    'article_published',
  );

  articleEvents.emit('article.published', {
    articleId: transitioned._id.toString(),
    authorId: article.authorId.toString(),
    editorId: input.actorId,
    category: article.category,
    slug: transitioned.slug,
  });

  return transitioned;
}

// ─── unpublish ──────────────────────────────────────────────────────────

export interface UnpublishArticleInput {
  articleId: string;
  actorId: string;
  actorRole: UserRole;
}

export async function unpublishArticle(input: UnpublishArticleInput): Promise<ArticleModel> {
  // Doc: 👑-only. Editors don't get the unpublish hammer — that's an admin
  // call (removing live content has bigger blast radius than rejecting a
  // submission).
  if (input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only admins can unpublish articles');
  }
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(input.articleId);
  if (!article) throw ApiError.notFound('Article not found');
  if (article.status !== 'published') {
    throw ApiError.invalidState('Only published articles can be unpublished');
  }

  const transitioned = await articlesRepo.transition({
    id: article._id,
    fromStatus: 'published',
    toStatus: 'unpublished',
    version: article.version,
  });
  if (!transitioned) {
    throw new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Article was modified elsewhere', {
      details: { currentVersion: article.version },
    });
  }

  await cache.del(...publicCacheKeys(transitioned.slug, article.category));

  auditLog(
    {
      entity: 'article',
      entityId: transitioned._id.toString(),
      action: 'unpublished',
      actor: input.actorId,
      details: { category: article.category, slug: transitioned.slug },
    },
    'article_unpublished',
  );

  articleEvents.emit('article.unpublished', {
    articleId: transitioned._id.toString(),
    authorId: article.authorId.toString(),
    adminId: input.actorId,
    category: article.category,
    slug: transitioned.slug,
  });

  return transitioned;
}

// ─── placement ──────────────────────────────────────────────────────────

export interface SetPlacementInput {
  articleId: string;
  actorId: string;
  actorRole: UserRole;
  version: number;
  patch: {
    featured?: boolean;
    trending?: boolean;
    trail?: boolean;
    priority?: number;
  };
}

export async function setPlacement(input: SetPlacementInput): Promise<ArticleModel> {
  if (input.actorRole !== 'editor' && input.actorRole !== 'admin') {
    throw ApiError.forbidden('Only editors or admins can set placement');
  }
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(input.articleId);
  if (!article) throw ApiError.notFound('Article not found');
  if (article.status !== 'published') {
    throw ApiError.invalidState('Only published articles can have placement set');
  }

  const updated = await articlesRepo.setPlacementWithVersion(
    article._id,
    input.version,
    input.patch,
  );
  if (!updated) {
    throw new ApiError(409, ErrorCode.VERSION_CONFLICT, 'Article was modified elsewhere', {
      details: { currentVersion: article.version },
    });
  }

  // Placement changes are FE-visible (featured strip, trending rail) so
  // invalidate the related feed caches. The slug-page cache is not affected
  // because placement isn't rendered on the article page.
  await cache.del(
    cache.cacheKeys.feedHome(),
    cache.cacheKeys.feedTrending(),
    cache.cacheKeys.feedCategory(article.category),
  );

  auditLog(
    {
      entity: 'article',
      entityId: updated._id.toString(),
      action: 'placement_updated',
      actor: input.actorId,
      details: { fields: Object.keys(input.patch), version: updated.version },
    },
    'article_placement_updated',
  );

  return updated;
}

// ─── regenerate AI summary ──────────────────────────────────────────────

export interface RegenerateSummaryInput {
  articleId: string;
  actorId: string;
  actorRole: UserRole;
}

/**
 * Force-regenerate the AI summary on an approved or published article.
 *
 * RBAC: author (owner only), editor, admin. The author's case is "I revised
 * something subtle and want a fresh summary" — they keep ownership over the
 * AI on their own articles.
 *
 * Synchronous: the FE waits for the response (unlike approval's setImmediate
 * fan-out) because the user explicitly triggered this and expects a result.
 * Returns the updated `ai` payload so the FE can update its view without
 * a refetch.
 */
export async function regenerateSummary(input: RegenerateSummaryInput): Promise<ArticleModel> {
  if (!Types.ObjectId.isValid(input.articleId)) {
    throw ApiError.notFound('Article not found');
  }
  const article = await articlesRepo.findById(input.articleId);
  if (!article) throw ApiError.notFound('Article not found');

  if (article.status !== 'approved' && article.status !== 'published') {
    throw ApiError.invalidState('Only approved or published articles can regenerate AI summary');
  }

  // RBAC: author may regenerate ONLY their own article; editor / admin may
  // regenerate any.
  const isOwner = article.authorId.toString() === input.actorId;
  const isPrivileged = input.actorRole === 'editor' || input.actorRole === 'admin';
  if (!isOwner && !isPrivileged) {
    throw ApiError.forbidden('Not permitted to regenerate this summary');
  }

  const result = await aiProxy.summarize(article.plainText ?? '', {
    maxWords: 60,
    style: 'neutral',
  });
  const readingTimeMin = Math.ceil(wordCount(article.plainText ?? '') / WORDS_PER_MINUTE);

  const updated = await articlesRepo.setAiFields(article._id, {
    summary: result.summary,
    readingTimeMin,
    degraded: result.degraded,
    model: result.model,
  });
  if (!updated) {
    // Race with soft-delete between the read and the write. Surface as 404.
    throw ApiError.notFound('Article not found');
  }

  // If the article is published, the cached slug-page now has a stale
  // summary — invalidate so the next public read sees fresh AI fields.
  if (updated.status === 'published') {
    await cache.del(cache.cacheKeys.articleSlug(updated.slug));
  }

  auditLog(
    {
      entity: 'article',
      entityId: updated._id.toString(),
      action: 'ai_summary_regenerated',
      actor: input.actorId,
      details: { degraded: result.degraded, model: result.model, readingTimeMin },
    },
    'article_ai_summary_regenerated',
  );

  return updated;
}

// ─── public slug read (cached) ──────────────────────────────────────────

interface PublicArticleView {
  [key: string]: unknown;
}

/**
 * Read a PUBLISHED article by slug. Public — no auth required. Reads pass
 * through `cache.getOrSet` so popular articles never round-trip to Mongo
 * after the first hit. TTL is 5 minutes; publish/unpublish/regenerate
 * invalidate eagerly.
 *
 * Returns the article's `toJSON()` shape directly (not the hydrated
 * document) since the cached JSON survives JSON.parse round-trip. The
 * controller wraps it in the success envelope.
 */
export async function getArticleBySlug(slug: string): Promise<PublicArticleView> {
  const cacheKey = cache.cacheKeys.articleSlug(slug);
  return cache.getOrSet<PublicArticleView>(cacheKey, cache.CACHE_TTL.articleSlug, async () => {
    const article = await articlesRepo.findBySlug(slug);
    if (!article || article.status !== 'published') {
      throw ApiError.notFound('Article not found');
    }
    const authors = await loadAuthorsByIds([article.authorId]);
    return {
      ...(article.toJSON() as Record<string, unknown>),
      author: authors.get(article.authorId.toString()) ?? null,
    } as PublicArticleView;
  });
}
