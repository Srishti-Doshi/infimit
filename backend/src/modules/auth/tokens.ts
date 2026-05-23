/**
 * Token-pair issuance — used by both /register and /login.
 *
 * Generates a fresh access token (15 min) and refresh token (30 days), persists
 * the refresh's jti to the `sessions` collection (so it can be revoked), and
 * returns the pair plus TTLs for cookie wiring at the controller layer.
 *
 * The access token carries everything authGuard needs to populate `req.user`
 * without a DB hit — sub, email, role, organisationId (optional).
 */
import { randomUUID } from 'node:crypto';
import { type Request } from 'express';
import { type Types } from 'mongoose';

import { loadEnv } from '@/config/env';
import { signAccessToken, signRefreshToken, type UserRoleClaim } from '@/shared/crypto';

import { createSession } from './repository';

const FALLBACK_ACCESS_TTL_SEC = 15 * 60;
const FALLBACK_REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

export interface IssueTokenInput {
  userId: Types.ObjectId;
  email: string;
  role: UserRoleClaim;
  organisationId: Types.ObjectId | null;
  /** Optional — used to capture ua/ip on the session record. */
  req?: Request;
}

export interface IssuedTokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (echoed back to the client per API §5.2). */
  expiresIn: number;
  /** Seconds until the refresh token expires (drives the cookie's Max-Age). */
  refreshExpiresIn: number;
}

/**
 * Parse a tiny duration string like "15m" / "30d" / "1h" / "60s" → seconds.
 * Falls back to the provided default on any malformed input.
 */
function parseTtlSeconds(ttl: string, fallback: number): number {
  const match = /^(\d+)\s*([smhd])$/i.exec(ttl);
  if (!match) return fallback;
  const value = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 60 * 60;
    case 'd':
      return value * 24 * 60 * 60;
    default:
      return fallback;
  }
}

export async function issueTokenPair(input: IssueTokenInput): Promise<IssuedTokenPair> {
  const env = loadEnv();
  const accessTtlSec = parseTtlSeconds(env.JWT_ACCESS_TTL, FALLBACK_ACCESS_TTL_SEC);
  const refreshTtlSec = parseTtlSeconds(env.JWT_REFRESH_TTL, FALLBACK_REFRESH_TTL_SEC);

  const accessJti = randomUUID();
  const refreshJti = randomUUID();

  const accessToken = signAccessToken(
    {
      sub: input.userId.toString(),
      email: input.email,
      role: input.role,
      organisationId: input.organisationId ? input.organisationId.toString() : null,
      jti: accessJti,
    },
    `${accessTtlSec}s`,
  );

  const refreshToken = signRefreshToken(
    { sub: input.userId.toString(), jti: refreshJti },
    `${refreshTtlSec}s`,
  );

  await createSession({
    userId: input.userId,
    tokenId: refreshJti,
    expiresAt: new Date(Date.now() + refreshTtlSec * 1000),
    userAgent: input.req?.headers['user-agent'] ?? null,
    ip: input.req?.ip ?? null,
  });

  return {
    accessToken,
    refreshToken,
    expiresIn: accessTtlSec,
    refreshExpiresIn: refreshTtlSec,
  };
}
