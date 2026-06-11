/**
 * AnalyticsEvent model — docs/04-database-design.md §4.2.6.
 *
 * Append-only event log. One document per discrete reader / system action
 * (view, read_complete, share, bookmark, comment, ad_impression, ad_click).
 * The collection is the source of truth for behavioural analytics; the
 * denormalised `article.stats.*` counters are derived from it for hot-path
 * reads.
 *
 * Lifecycle:
 *   - `createdAt` carries a TTL index — events expire after 90 days.
 *     Phase 2 rolls the raw stream into `analytics_daily` before TTL prunes.
 *   - No soft delete. No update path either: events are immutable.
 *
 * userId is `null` for anonymous visitors. sessionId is the anon visitor
 * id; the FE generates and persists it client-side. The server NEVER trusts
 * a body-supplied userId — `userId` is always set from `req.user` when
 * the request is authenticated, ignored otherwise.
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

export const ANALYTICS_EVENT_TYPES = [
  'view',
  'read_complete',
  'share',
  'bookmark',
  'comment',
  'ad_impression',
  'ad_click',
] as const;
export type AnalyticsEventType = (typeof ANALYTICS_EVENT_TYPES)[number];

export interface AnalyticsEventDocument {
  type: AnalyticsEventType;
  articleId: Types.ObjectId | null;
  adId: Types.ObjectId | null;
  userId: Types.ObjectId | null;
  sessionId: string;
  referrer: string;
  userAgent: string;
  country: string;
  durationMs: number | null;
  createdAt: Date;
}

const TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days

const AnalyticsEventSchema = new Schema<AnalyticsEventDocument>(
  {
    type: { type: String, enum: ANALYTICS_EVENT_TYPES, required: true },
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', default: null },
    adId: { type: Schema.Types.ObjectId, ref: 'Ad', default: null },
    userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    sessionId: { type: String, default: '' },
    referrer: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    country: { type: String, default: '' },
    durationMs: { type: Number, default: null },
    // We manage createdAt manually so the TTL index has a stable field.
    createdAt: { type: Date, default: () => new Date() },
  },
  {
    versionKey: false,
    // Disable Mongoose timestamps (no updatedAt — events are immutable).
    timestamps: false,
    toJSON: {
      virtuals: true,
      transform(_doc, ret) {
        const r = ret as Record<string, unknown>;
        r.id = r._id;
        delete r._id;
        return r;
      },
    },
  },
);

// Indexes per docs/04-database-design.md §4.2.6.
AnalyticsEventSchema.index({ articleId: 1, createdAt: -1 }, { name: 'articleId_createdAt' });
AnalyticsEventSchema.index({ type: 1, createdAt: -1 }, { name: 'type_createdAt' });
// TTL: documents expire `TTL_SECONDS` after their createdAt. Mongo's background
// TTL monitor sweeps every 60s, so actual deletion is approximate. Pairs with
// the Phase 2 daily roll-up so historical counts are preserved post-prune.
AnalyticsEventSchema.index(
  { createdAt: 1 },
  { name: 'createdAt_ttl', expireAfterSeconds: TTL_SECONDS },
);
// For unique-reader detection on read_complete — find prior reads by the same
// user on the same article. Tight compound covers the equality lookup.
AnalyticsEventSchema.index({ articleId: 1, userId: 1, type: 1 }, { name: 'articleId_userId_type' });

export const AnalyticsEvent = model<AnalyticsEventDocument>('AnalyticsEvent', AnalyticsEventSchema);
export type AnalyticsEventModel = HydratedDocument<AnalyticsEventDocument>;
