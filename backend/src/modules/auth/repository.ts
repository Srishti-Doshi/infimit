/**
 * Session repository — the data-access layer for the refresh-token sessions
 * collection. Pure Mongoose calls; no error mapping (that belongs in service.ts).
 *
 * All operations assume `tokenId` is the JWT's `jti` claim — the same identifier
 * we push to the Redis blocklist when a session is revoked or rotated. Mongo
 * acts as the durable record (who owns this jti, when does it expire); Redis
 * acts as the fast O(1) check during auth verification.
 */
import { type Types } from 'mongoose';

import { type SessionDocument, type SessionModel, Session } from './model';

export interface CreateSessionInput {
  userId: Types.ObjectId;
  tokenId: string;
  expiresAt: Date;
  userAgent?: string | null;
  ip?: string | null;
}

export async function createSession(input: CreateSessionInput): Promise<SessionModel> {
  return Session.create({
    userId: input.userId,
    tokenId: input.tokenId,
    expiresAt: input.expiresAt,
    userAgent: input.userAgent ?? null,
    ip: input.ip ?? null,
    revokedAt: null,
  });
}

export async function findSessionByTokenId(tokenId: string): Promise<SessionModel | null> {
  return Session.findOne({ tokenId }).exec();
}

/**
 * Returns true iff the session exists, isn't revoked, and hasn't expired.
 * Use this in the refresh + authGuard paths.
 */
export async function isSessionActive(tokenId: string): Promise<boolean> {
  const session = await Session.findOne({ tokenId }).exec();
  if (!session) return false;
  if (session.revokedAt !== null) return false;
  if (session.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

export async function revokeSession(tokenId: string): Promise<boolean> {
  const result = await Session.updateOne(
    { tokenId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  ).exec();
  return result.modifiedCount === 1;
}

/**
 * Revoke every active session for a user. Used on password change and
 * potentially on suspicious-activity alerts (replay detection in refresh flow).
 * Returns the number of sessions revoked.
 */
export async function revokeAllSessionsForUser(userId: Types.ObjectId): Promise<number> {
  const result = await Session.updateMany(
    { userId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  ).exec();
  return result.modifiedCount;
}

/**
 * List every active session for a user. Useful for an eventual "active devices"
 * UI in Subphase 4. Not consumed by Subphase 2 auth flow itself.
 */
export async function listActiveSessionsForUser(
  userId: Types.ObjectId,
): Promise<SessionDocument[]> {
  return Session.find({
    userId,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean<SessionDocument[]>()
    .exec();
}
