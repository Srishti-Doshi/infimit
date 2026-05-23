/**
 * Session model — docs/04-database-design.md §4.2.14.
 *
 * One document per active refresh token. `tokenId` is the JWT's `jti` claim;
 * it's the join key between the cookie the FE holds and the row stored here.
 *
 * Lifecycle:
 *   - issued on login or refresh → insert with `expiresAt = now + 30d`
 *   - rotated on use → mark current as `revokedAt = now`, push jti to Redis
 *     blocklist, insert a new doc for the rotated token
 *   - logout → mark `revokedAt = now`, push jti to blocklist
 *   - password change → mark all of user's sessions `revokedAt = now`
 *
 * The TTL index on `expiresAt` lets Mongo auto-prune expired docs so the
 * collection stays bounded without an external cleanup job.
 */
import { type HydratedDocument, model, Schema, type Types } from 'mongoose';

export interface SessionDocument {
  userId: Types.ObjectId;
  /** JWT `jti` claim — the token's unique id. */
  tokenId: string;
  userAgent: string | null;
  ip: string | null;
  expiresAt: Date;
  /** Null while session is live; set on rotation, logout, or password change. */
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const SessionSchema = new Schema<SessionDocument>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    tokenId: { type: String, required: true },
    userAgent: { type: String, default: null },
    ip: { type: String, default: null },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

// jti is globally unique across all live + expired tokens.
SessionSchema.index({ tokenId: 1 }, { unique: true });

// Common queries: list a user's active sessions, revoke-all-by-user.
SessionSchema.index({ userId: 1 });

// TTL index — Mongo auto-deletes docs after `expiresAt`. The `expireAfterSeconds: 0`
// means "as soon as the date is in the past, drop it."
SessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const Session = model<SessionDocument>('Session', SessionSchema);
export type SessionModel = HydratedDocument<SessionDocument>;
