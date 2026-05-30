/**
 * Article model — docs/04-database-design.md §4.2.3.
 *
 * One document per article, regardless of state. The state machine
 * (draft → submitted → approved → published / rejected / unpublished) is
 * enforced at the service layer per docs/07-workflows.md §7.1.
 *
 * Subphase 3 only writes `draft` and `submitted` — the later states are added
 * in Subphase 4. The full status enum is defined here so the schema is stable
 * for future writes without a migration.
 *
 * Concurrency: every write that bumps state uses optimistic concurrency on
 * the `version` field. Repository methods compose `findOneAndUpdate({ _id,
 * version }, { $inc: { version: 1 }, ... })`; a no-match means VERSION_CONFLICT.
 *
 * Soft-delete: `deletedAt` marks the article as gone. Repository `find*`
 * methods default-filter `deletedAt: null`.
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

import { ARTICLE_CATEGORIES, type ArticleCategory } from '@/shared/constants/articleCategories';

export type ArticleStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'unpublished';

export const ARTICLE_STATUSES: readonly ArticleStatus[] = [
  'draft',
  'submitted',
  'approved',
  'published',
  'rejected',
  'unpublished',
];

export interface ArticlePlacement {
  featured: boolean;
  trending: boolean;
  trail: boolean;
  priority: number;
}

export interface ArticleAi {
  summary: string;
  keywords: string[];
  readingTimeMin: number;
  ttsAudioUrl: string | null;
  embedding: number[] | null;
}

export interface ArticleStats {
  views: number;
  uniqueReaders: number;
  shares: number;
  bookmarks: number;
  commentsCount: number;
  trendingScore: number;
}

export interface ArticleDocument {
  title: string;
  slug: string;
  subtitle: string;
  /** Sanitized HTML (see docs/10-security.md §10.1). */
  body: string;
  /** Stripped plain text derived from body — authoritative for char counts + AI. */
  plainText: string;

  /** Resolved CDN URL of the cover image (populated from coverImageMediaId on save). */
  coverImageUrl: string | null;
  /** Reference to the media doc that supplies the cover image. */
  coverImageMediaId: Types.ObjectId | null;
  /** All media referenced anywhere in the article (cover + embeds). */
  media: Types.ObjectId[];

  category: ArticleCategory;
  subcategory: string | null;
  tags: string[];
  location: string;

  authorId: Types.ObjectId;
  organisationId: Types.ObjectId | null;
  editorId: Types.ObjectId | null;

  status: ArticleStatus;
  rejectionReason: string | null;

  placement: ArticlePlacement;
  ai: ArticleAi;
  stats: ArticleStats;

  /** Optimistic concurrency token — incremented on every state-changing write. */
  version: number;

  publishedAt: Date | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const PlacementSchema = new Schema<ArticlePlacement>(
  {
    featured: { type: Boolean, default: false },
    trending: { type: Boolean, default: false },
    trail: { type: Boolean, default: false },
    priority: { type: Number, default: 0, min: 0, max: 100 },
  },
  { _id: false },
);

const AiSchema = new Schema<ArticleAi>(
  {
    summary: { type: String, default: '' },
    keywords: { type: [String], default: [] },
    readingTimeMin: { type: Number, default: 0, min: 0 },
    ttsAudioUrl: { type: String, default: null },
    embedding: { type: [Number], default: null },
  },
  { _id: false },
);

const StatsSchema = new Schema<ArticleStats>(
  {
    views: { type: Number, default: 0, min: 0 },
    uniqueReaders: { type: Number, default: 0, min: 0 },
    shares: { type: Number, default: 0, min: 0 },
    bookmarks: { type: Number, default: 0, min: 0 },
    commentsCount: { type: Number, default: 0, min: 0 },
    trendingScore: { type: Number, default: 0 },
  },
  { _id: false },
);

const ArticleSchema = new Schema<ArticleDocument>(
  {
    title: { type: String, required: true, trim: true, minlength: 1, maxlength: 200 },
    slug: { type: String, required: true, lowercase: true, trim: true },
    subtitle: { type: String, default: '', trim: true, maxlength: 500 },
    // body and plainText carry the rich text + its stripped form. Body cap is
    // 500 KB (enforced at the Zod validator) per docs and the threat model.
    body: { type: String, default: '' },
    plainText: { type: String, default: '' },

    coverImageUrl: { type: String, default: null },
    coverImageMediaId: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    media: { type: [Schema.Types.ObjectId], ref: 'Media', default: [] },

    category: {
      type: String,
      enum: ARTICLE_CATEGORIES,
      required: true,
    },
    subcategory: { type: String, default: null, trim: true },
    tags: { type: [String], default: [] },
    location: { type: String, default: '', trim: true, maxlength: 100 },

    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organisationId: { type: Schema.Types.ObjectId, ref: 'Organisation', default: null },
    editorId: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    status: {
      type: String,
      enum: ARTICLE_STATUSES,
      default: 'draft',
      required: true,
    },
    rejectionReason: { type: String, default: null },

    placement: { type: PlacementSchema, default: () => ({}) },
    ai: { type: AiSchema, default: () => ({}) },
    stats: { type: StatsSchema, default: () => ({}) },

    version: { type: Number, default: 0, min: 0 },

    publishedAt: { type: Date, default: null },
    submittedAt: { type: Date, default: null },
    approvedAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        // Canonical id for the FE. Mirrors User + Organisation models.
        r.id = r._id;
        delete r._id;
        return r;
      },
    },
  },
);

// Indexes per docs/04-database-design.md §4.2.3.
// Slug is required, so a plain unique index is enough — no partial filter.
ArticleSchema.index({ slug: 1 }, { unique: true, name: 'slug_unique' });
ArticleSchema.index({ status: 1, publishedAt: -1 }, { name: 'status_publishedAt' });
ArticleSchema.index({ category: 1, publishedAt: -1 }, { name: 'category_publishedAt' });
ArticleSchema.index({ location: 1, publishedAt: -1 }, { name: 'location_publishedAt' });
ArticleSchema.index({ authorId: 1, createdAt: -1 }, { name: 'authorId_createdAt' });
ArticleSchema.index(
  { 'placement.featured': 1, publishedAt: -1 },
  { name: 'placement_featured_publishedAt' },
);
ArticleSchema.index(
  { 'placement.trending': 1, 'stats.trendingScore': -1 },
  { name: 'placement_trending_score' },
);
ArticleSchema.index({ tags: 1 }, { name: 'tags' });
// Full-text index across title + body + tags. Searchable in Subphase 5; built now
// so it doesn't require a backfill migration when search lands.
ArticleSchema.index(
  { title: 'text', plainText: 'text', tags: 'text' },
  { name: 'fulltext_search' },
);

export const Article = model<ArticleDocument>('Article', ArticleSchema);
export type ArticleModel = HydratedDocument<ArticleDocument>;
