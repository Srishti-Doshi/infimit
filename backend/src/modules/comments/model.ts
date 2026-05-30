/**
 * Comment model — docs/04-database-design.md §4.2.4.
 *
 * SKELETON for Subphase 3: the collection + indexes are defined so the
 * migration script provisions them now, but the business logic (write path,
 * moderation queue, AI moderation pipeline) lands in Subphase 4. Articles
 * code only references this model indirectly via the `stats.commentsCount`
 * counter on the article document.
 *
 * Status flow (Subphase 4): pending → approved | rejected | hidden.
 * `aiModeration` is populated by the AI proxy in Subphase 4; in Subphase 3
 * the field exists with sensible defaults so the shape stays stable.
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

export type CommentStatus = 'pending' | 'approved' | 'rejected' | 'hidden';

export const COMMENT_STATUSES: readonly CommentStatus[] = [
  'pending',
  'approved',
  'rejected',
  'hidden',
];

export interface CommentAiModeration {
  toxic: boolean;
  score: number;
  labels: string[];
}

export interface CommentDocument {
  articleId: Types.ObjectId;
  userId: Types.ObjectId;
  /** Null for top-level; an ObjectId for a threaded reply. */
  parentId: Types.ObjectId | null;
  /** Plain text, ≤ 2000 chars (enforced at validator in Subphase 4). */
  body: string;
  status: CommentStatus;
  moderatedBy: Types.ObjectId | null;
  moderatedAt: Date | null;
  aiModeration: CommentAiModeration;
  createdAt: Date;
  updatedAt: Date;
}

const AiModerationSchema = new Schema<CommentAiModeration>(
  {
    toxic: { type: Boolean, default: false },
    score: { type: Number, default: 0, min: 0, max: 1 },
    labels: { type: [String], default: [] },
  },
  { _id: false },
);

const CommentSchema = new Schema<CommentDocument>(
  {
    articleId: { type: Schema.Types.ObjectId, ref: 'Article', required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
    body: { type: String, required: true, trim: true, minlength: 1, maxlength: 2000 },
    status: { type: String, enum: COMMENT_STATUSES, default: 'pending', required: true },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    moderatedAt: { type: Date, default: null },
    aiModeration: { type: AiModerationSchema, default: () => ({}) },
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

// Indexes per docs/04-database-design.md §4.2.4.
CommentSchema.index(
  { articleId: 1, status: 1, createdAt: -1 },
  { name: 'articleId_status_createdAt' },
);
CommentSchema.index({ userId: 1, createdAt: -1 }, { name: 'userId_createdAt' });
CommentSchema.index({ status: 1 }, { name: 'status_moderation_queue' });

export const Comment = model<CommentDocument>('Comment', CommentSchema);
export type CommentModel = HydratedDocument<CommentDocument>;
