/**
 * RS256 JWT helpers — docs/10-security.md §10.2.
 *
 * Two keypairs:
 *   - access keypair  → access tokens (15 min) AND single-use purpose tokens
 *                       (email-verify 24 h / password-reset 1 h)
 *   - refresh keypair → refresh tokens (30 days)
 *
 * Keeping purpose tokens on the access keypair is a deliberate choice — they're
 * functionally short-lived signed envelopes whose `purpose` claim distinguishes
 * them. Refresh keys stay isolated to refresh tokens specifically, so a leaked
 * access private key can't be used to mint long-lived sessions.
 *
 * Keys are loaded from disk at boot via `loadJwtKeys()` (called from server.ts).
 * If a key file is missing the process exits — we'd rather fail loudly at startup
 * than 500 on the first auth request.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import jwt, { type Algorithm, type JwtPayload, type SignOptions } from 'jsonwebtoken';

import { loadEnv } from '@/config/env';
import { logger } from '@/config/logger';

const ALG: Algorithm = 'RS256';

interface KeyPair {
  privateKey: string;
  publicKey: string;
}

let accessKeys: KeyPair | null = null;
let refreshKeys: KeyPair | null = null;

function readKey(path: string): string {
  const abs = resolve(path);
  try {
    return readFileSync(abs, 'utf-8');
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to read JWT key at ${abs}. ` +
        `Run \`npx tsx scripts/generate-keys.ts\` to generate dev keypairs. ` +
        `Original error: ${reason}`,
    );
  }
}

/**
 * Load and cache both keypairs from disk. Call once at boot.
 * Subsequent calls re-read the files (useful for tests / key rotation drills).
 */
export function loadJwtKeys(): void {
  const env = loadEnv();
  accessKeys = {
    privateKey: readKey(env.JWT_ACCESS_PRIVATE_KEY_PATH),
    publicKey: readKey(env.JWT_ACCESS_PUBLIC_KEY_PATH),
  };
  refreshKeys = {
    privateKey: readKey(env.JWT_REFRESH_PRIVATE_KEY_PATH),
    publicKey: readKey(env.JWT_REFRESH_PUBLIC_KEY_PATH),
  };
  logger.info('jwt_keys_loaded');
}

/** Reset for tests — drops cached keys so the next call re-reads from disk. */
export function resetJwtKeysForTests(): void {
  accessKeys = null;
  refreshKeys = null;
}

function requireAccess(): KeyPair {
  if (!accessKeys) {
    throw new Error('JWT access keys not loaded. Call loadJwtKeys() at boot.');
  }
  return accessKeys;
}

function requireRefresh(): KeyPair {
  if (!refreshKeys) {
    throw new Error('JWT refresh keys not loaded. Call loadJwtKeys() at boot.');
  }
  return refreshKeys;
}

// ─── Token payload shapes ──────────────────────────────────────────────────

export type UserRoleClaim = 'reader' | 'author' | 'editor' | 'admin';

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
  role: UserRoleClaim;
  /** Required when role=author, present-but-null otherwise. */
  organisationId: string | null;
  jti: string;
}

export interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

export type PurposeTokenKind = 'verify' | 'reset';

export interface PurposeTokenPayload {
  sub: string;
  jti: string;
  purpose: PurposeTokenKind;
}

interface DecodedTimestamps {
  iat: number;
  exp: number;
}

// ─── Signing ───────────────────────────────────────────────────────────────

export function signAccessToken(
  payload: AccessTokenPayload,
  expiresIn: SignOptions['expiresIn'] = '15m',
): string {
  const { privateKey } = requireAccess();
  return jwt.sign(payload, privateKey, { algorithm: ALG, expiresIn });
}

export function signRefreshToken(
  payload: RefreshTokenPayload,
  expiresIn: SignOptions['expiresIn'] = '30d',
): string {
  const { privateKey } = requireRefresh();
  return jwt.sign(payload, privateKey, { algorithm: ALG, expiresIn });
}

export function signPurposeToken(
  payload: PurposeTokenPayload,
  expiresIn: SignOptions['expiresIn'],
): string {
  const { privateKey } = requireAccess();
  return jwt.sign(payload, privateKey, { algorithm: ALG, expiresIn });
}

// ─── Verification ──────────────────────────────────────────────────────────

function assertObjectPayload(payload: string | JwtPayload): asserts payload is JwtPayload {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('JWT payload is a string; expected object claims');
  }
}

export function verifyAccessToken(token: string): AccessTokenPayload & DecodedTimestamps {
  const { publicKey } = requireAccess();
  const decoded = jwt.verify(token, publicKey, { algorithms: [ALG] });
  assertObjectPayload(decoded);
  if (
    typeof decoded.sub !== 'string' ||
    typeof decoded.jti !== 'string' ||
    typeof decoded.email !== 'string' ||
    !decoded.role
  ) {
    throw new Error('Invalid access-token payload shape');
  }
  return decoded as AccessTokenPayload & DecodedTimestamps;
}

export function verifyRefreshToken(token: string): RefreshTokenPayload & DecodedTimestamps {
  const { publicKey } = requireRefresh();
  const decoded = jwt.verify(token, publicKey, { algorithms: [ALG] });
  assertObjectPayload(decoded);
  if (typeof decoded.sub !== 'string' || typeof decoded.jti !== 'string') {
    throw new Error('Invalid refresh-token payload shape');
  }
  return decoded as RefreshTokenPayload & DecodedTimestamps;
}

export function verifyPurposeToken(
  token: string,
  expectedPurpose: PurposeTokenKind,
): PurposeTokenPayload & DecodedTimestamps {
  const { publicKey } = requireAccess();
  const decoded = jwt.verify(token, publicKey, { algorithms: [ALG] });
  assertObjectPayload(decoded);
  if (
    typeof decoded.sub !== 'string' ||
    typeof decoded.jti !== 'string' ||
    decoded.purpose !== expectedPurpose
  ) {
    throw new Error(`Invalid ${expectedPurpose}-token payload shape`);
  }
  return decoded as PurposeTokenPayload & DecodedTimestamps;
}
