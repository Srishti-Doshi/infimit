/**
 * User model — docs/04-database-design.md §4.2.1.
 *
 * One document per account regardless of role (reader / author / editor / admin).
 * `passwordHash` is `select: false` so queries never bring it into memory unless
 * explicitly requested with `.select('+passwordHash')` (login + change-password only).
 *
 * Soft-delete is via `deletedAt`. The partial unique index on `{ email }` where
 * `deletedAt: null` lets a soft-deleted email be re-registered. The 30-day delay
 * required by docs is enforced in the service layer, not at the DB.
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

export type UserRole = 'reader' | 'author' | 'editor' | 'admin';
export const USER_ROLES: readonly UserRole[] = ['reader', 'author', 'editor', 'admin'];

export interface UserDocument {
  email: string;
  /** Argon2id hash; never returned by default. */
  passwordHash: string;
  name: string;
  /** Public author slug. Null for readers. Unique among non-null values. */
  slug: string | null;
  role: UserRole;
  /** Required when role=author; otherwise null. */
  organisationId: Types.ObjectId | null;
  /** Editor scoping — categories an editor owns. Empty array = no scope. */
  sectionsOwned: string[];
  isEmailVerified: boolean;
  isActive: boolean;
  /** Soft-delete marker. Null means active. */
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 255,
    },
    slug: {
      type: String,
      default: null,
      lowercase: true,
      trim: true,
    },
    role: {
      type: String,
      enum: USER_ROLES,
      default: 'reader',
      required: true,
    },
    organisationId: {
      type: Schema.Types.ObjectId,
      ref: 'Organisation',
      default: null,
    },
    sectionsOwned: {
      type: [String],
      default: [],
    },
    isEmailVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    deletedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        // Defense-in-depth: even if a query slipped `+passwordHash`, never
        // serialize it to JSON responses.
        delete (ret as Record<string, unknown>).passwordHash;
        return ret;
      },
    },
  },
);

// Email uniqueness scoped to active (non-soft-deleted) records.
// A soft-deleted user's email can be re-registered (subject to the 30-day delay
// enforced in the service layer).
UserSchema.index(
  { email: 1 },
  {
    unique: true,
    partialFilterExpression: { deletedAt: null },
    name: 'email_unique_active',
  },
);

// Slug must be unique among real (string) values. Readers / editors / admins
// store slug:null and MUST NOT collide on it — `sparse: true` only excludes
// missing keys, not null values, so we use a partial index keyed on type=string.
UserSchema.index(
  { slug: 1 },
  {
    unique: true,
    partialFilterExpression: { slug: { $type: 'string' } },
    name: 'slug_unique_authors',
  },
);

// Common admin queries: list active editors, list authors by organisation.
UserSchema.index({ role: 1, isActive: 1 });
UserSchema.index({ organisationId: 1 });

export const User = model<UserDocument>('User', UserSchema);
export type UserModel = HydratedDocument<UserDocument>;
