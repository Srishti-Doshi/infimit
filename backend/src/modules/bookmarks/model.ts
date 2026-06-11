/**
 * Bookmark model — docs/04-database-design.md §4.2.12.
 *
 * One document per (userId, articleId) pair. The unique compound index
 * enforces "a user can bookmark a given article at most once" storage-side;
 * the service uses an upsert so the HTTP layer is end-to-end idempotent.
 *
 * No soft-delete: bookmarks are user-driven toggles. DELETE removes the row
 * outright. No optimistic concurrency: there's no two-step lifecycle, just
 * exists / doesn't.
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

export interface BookmarkDocument {
  userId: Types.ObjectId;
  articleId: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const BookmarkSchema = new Schema<BookmarkDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
  },
  {
    timestamps: true,
    versionKey: false,
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

// One bookmark per (user, article) — backs the idempotent POST upsert.
BookmarkSchema.index(
  { userId: 1, articleId: 1 },
  { unique: true, name: 'userId_articleId_unique' },
);
// "Show me MY bookmarks newest first." Backs the paginated list endpoint.
BookmarkSchema.index({ userId: 1, createdAt: -1 }, { name: 'userId_createdAt' });

export const Bookmark = model<BookmarkDocument>('Bookmark', BookmarkSchema);
export type BookmarkModel = HydratedDocument<BookmarkDocument>;
