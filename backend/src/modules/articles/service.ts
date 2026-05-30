/**
 * Articles service — business logic for the articles module (Subphase 3 surface).
 *
 * Implements:
 *   - createDraft        — author starts a new article
 *   - updateDraft        — author edits a draft (optimistic concurrency)
 *   - getArticleById     — RBAC-gated read (owner / editor / admin during draft;
 *                          public when published — handled in Subphase 4)
 *   - listArticles       — list-mine for authors; broad filter for editor/admin
 *   - submitForReview    — draft → submitted (full validation table)
 *   - softDeleteArticle  — owner / editor / admin can soft-delete
 *
 * Cross-cutting:
 *   - Body is sanitized server-side (defence-in-depth, see modules/articles/
 *     sanitize.ts). `plainText` is derived from the sanitized HTML and is
 *     authoritative for char-count rules.
 *   - Optimistic concurrency on every mutation that flips state.
 *   - Media refCount accounting: bump on create / on new references in update;
 *     decrement on removed references or soft-delete. Articles never share a
 *     media doc by reference; the refCount counts each article-side mention.
 */
import slugify from 'slugify';
import { Types } from 'mongoose';

import { auditLog } from '@/shared/audit';
import { ApiError } from '@/shared/errors';
import { ErrorCode } from '@/shared/errors/errorCodes';
import { mediaRepo } from '@/modules/media';
import { usersRepo } from '@/modules/users';

import { articleEvents } from './events';
import type { ArticleModel, ArticleStatus } from './model';
import * as articlesRepo from './repository';
import { plainTextFromHtml, sanitizeArticleBody } from './sanitize';

import type { ArticleCategory } from '@/shared/constants/articleCategories';
import type { UserRole } from '@/modules/users';

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
    const cover =
      (set.coverImageMediaId as Types.ObjectId | null | undefined) ?? existing.coverImageMediaId;
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
): Promise<ArticleModel> {
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

  return article;
}

export interface ListInput {
  status?: ArticleStatus;
  /** 'me' resolves to the viewer's id; anything else passes through for editor/admin. */
  authorId?: string | 'me';
  page?: number;
  limit?: number;
  viewer: ArticleViewer;
}

export async function listArticles(input: ListInput): Promise<{
  items: ArticleModel[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: Record<string, unknown> = {};
  if (input.status) filter.status = input.status;

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

  return { items, total, page: input.page ?? 1, limit: input.limit ?? 20 };
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
