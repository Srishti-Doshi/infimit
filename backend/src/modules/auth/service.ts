/**
 * Auth service — business logic for register / login / refresh / verify / reset.
 *
 * Service is the only layer that:
 *   - Maps repository nulls to ApiError (404 / 409 / etc.).
 *   - Composes hashing + token issuance + session creation as one transaction.
 *   - Emits audit logs (`audit: true`) for every state-changing event.
 *
 * Subphase 2 step 5 implements `registerUser`. Login / refresh / etc. fill in
 * in later steps so this file grows incrementally.
 */
import { randomUUID } from 'node:crypto';
import { type Request } from 'express';
import { Types } from 'mongoose';

import { auditLog, auditWarn } from '@/shared/audit';
import { ApiError } from '@/shared/errors';
import { ErrorCode } from '@/shared/errors/errorCodes';
import {
  hashPassword,
  signPurposeToken,
  verifyPassword,
  verifyPurposeToken,
  verifyRefreshToken,
} from '@/shared/crypto';

import { orgsRepo } from '@/modules/organisations';
import { usersRepo, type UserModel } from '@/modules/users';

import { blocklistJti, isJtiBlocklisted } from './blocklist';
import { clearFailedLogins, isAccountLocked, recordFailedLogin } from './brute-force';
import { sendPasswordResetEmail, sendVerifyEmail } from './email';
import { isSessionActive, revokeAllSessionsForUser, revokeSession } from './repository';
import { issueTokenPair, type IssuedTokenPair } from './tokens';

const REREGISTER_BLOCK_DAYS = 30;
const VERIFY_TOKEN_TTL = '24h';

export interface RegisterInput {
  role: 'reader' | 'author';
  name: string;
  email: string;
  password: string;
  organisationSlug?: string;
}

export interface RegisterResult {
  user: UserModel;
  tokens: IssuedTokenPair;
}

/**
 * Convert a name to a URL-safe author slug. Minimal regex slugifier — good
 * enough for ASCII English names. Unicode normalisation lands in a future
 * cleanup if/when we have authors with non-ASCII names.
 */
function generateSlug(name: string): string {
  const slug = name
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'user';
}

async function uniqueAuthorSlug(name: string): Promise<string> {
  const base = generateSlug(name);
  let candidate = base;
  let counter = 1;
  // Try base, base-2, base-3, …  Sequential is fine — author signups are not
  // a high-frequency event.
  // eslint-disable-next-line no-await-in-loop
  while (await usersRepo.findBySlug(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
}

export async function registerUser(input: RegisterInput, req?: Request): Promise<RegisterResult> {
  const { role, name, email, password, organisationSlug } = input;

  // 1. Email must be free among active accounts.
  const existing = await usersRepo.findActiveByEmail(email);
  if (existing) {
    throw new ApiError(409, ErrorCode.EMAIL_EXISTS, 'Email is already registered');
  }

  // 2. 30-day re-registration delay for soft-deleted accounts.
  const recentlyDeleted = await usersRepo.findMostRecentlyDeletedByEmail(email);
  if (recentlyDeleted?.deletedAt) {
    const elapsedMs = Date.now() - recentlyDeleted.deletedAt.getTime();
    const blockMs = REREGISTER_BLOCK_DAYS * 24 * 60 * 60 * 1000;
    if (elapsedMs < blockMs) {
      throw new ApiError(
        409,
        ErrorCode.EMAIL_RECENTLY_DELETED,
        `This email was recently deactivated. Re-registration is allowed after ${REREGISTER_BLOCK_DAYS} days.`,
      );
    }
  }

  // 3. Author registrations require an existing organisation.
  let organisationId: Types.ObjectId | null = null;
  if (role === 'author') {
    if (!organisationSlug) {
      throw ApiError.validation('organisationSlug is required for author registrations');
    }
    const org = await orgsRepo.findBySlug(organisationSlug);
    if (!org) {
      throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
    }
    organisationId = org._id;
  }

  // 4. Hash + persist.
  const passwordHash = await hashPassword(password);
  const slug = role === 'author' ? await uniqueAuthorSlug(name) : null;
  const user = await usersRepo.createUser({
    email,
    passwordHash,
    name,
    slug,
    role,
    organisationId,
  });

  // 5. Issue tokens + create session.
  const tokens = await issueTokenPair({
    userId: user._id,
    email: user.email,
    role: user.role,
    organisationId: user.organisationId,
    req,
  });

  // 6. Email verification token (single-use; jti is blocklisted on consumption
  //    in the verify-email step we'll wire up in Step 7).
  const verifyJti = randomUUID();
  const verifyToken = signPurposeToken(
    { sub: user._id.toString(), jti: verifyJti, purpose: 'verify' },
    VERIFY_TOKEN_TTL,
  );
  sendVerifyEmail(user.email, verifyToken);

  // 7. Audit log.
  auditLog(
    {
      entity: 'user',
      entityId: user._id.toString(),
      action: 'register',
      details: { role: user.role },
    },
    'auth_register',
  );

  return { user, tokens };
}

// ─── login ───────────────────────────────────────────────────────────────

export interface LoginInput {
  email: string;
  password: string;
}

export interface LoginResult {
  user: UserModel;
  tokens: IssuedTokenPair;
}

/**
 * Verify credentials and issue a token pair.
 *
 * Both "user not found" and "wrong password" surface as the same generic 401 —
 * never leak which one failed (prevents email enumeration via response shape).
 * Per docs §5.2, login also fails 403 ACCOUNT_DISABLED when isActive=false.
 */
export async function loginUser(input: LoginInput, req?: Request): Promise<LoginResult> {
  // 0. Brute-force lockout — check BEFORE any DB work. If an attacker is hitting
  //    a known email past the threshold, we want to short-circuit before doing
  //    expensive Argon2 verification or even a Mongo query.
  const lockStatus = await isAccountLocked(input.email);
  if (lockStatus.locked) {
    throw ApiError.rateLimited('Too many failed sign-in attempts. Try again later.', {
      retryAfterSec: lockStatus.retryAfterSec,
    });
  }

  const user = await usersRepo.findActiveByEmailWithPassword(input.email);
  if (!user) {
    // Record failure even for unknown emails so an attacker can't distinguish
    // "valid email, wrong password" from "no such email" via lockout behaviour.
    await recordFailedLogin(input.email);
    throw new ApiError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  if (!user.isActive) {
    throw new ApiError(403, ErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
  }

  const ok = await verifyPassword(user.passwordHash, input.password);
  if (!ok) {
    const after = await recordFailedLogin(input.email);
    if (after.locked) {
      auditWarn(
        {
          entity: 'user',
          entityId: user._id.toString(),
          action: 'account_locked_brute_force',
          details: { retryAfterSec: after.retryAfterSec },
        },
        'auth_account_locked',
      );
      throw ApiError.rateLimited('Too many failed sign-in attempts. Try again later.', {
        retryAfterSec: after.retryAfterSec,
      });
    }
    throw new ApiError(401, ErrorCode.INVALID_CREDENTIALS, 'Invalid email or password');
  }

  // Successful login — clear the counter so a single bad password ages out
  // automatically once the user logs in correctly.
  await clearFailedLogins(input.email);

  const tokens = await issueTokenPair({
    userId: user._id,
    email: user.email,
    role: user.role,
    organisationId: user.organisationId,
    req,
  });

  auditLog({ entity: 'user', entityId: user._id.toString(), action: 'login' }, 'auth_login');

  return { user, tokens };
}

// ─── refresh ─────────────────────────────────────────────────────────────

export interface RefreshResult {
  user: UserModel;
  tokens: IssuedTokenPair;
}

/**
 * Rotate a refresh token. Critical security flow:
 *
 *   1. Verify JWT signature + exp.
 *   2. Check blocklist — if the jti is already there, this token was used
 *      and rotated, so possession of it now means THEFT. Revoke every active
 *      session for the user and refuse.
 *   3. Check session is active in Mongo (the durable record).
 *   4. Look up user — still exists, still active.
 *   5. Revoke + blocklist the current jti (atomically commits the rotation).
 *   6. Issue a fresh pair.
 */
export async function refreshTokens(refreshToken: string, req?: Request): Promise<RefreshResult> {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  // Replay detection — this jti was already rotated. Defensive revoke.
  if (await isJtiBlocklisted(payload.jti)) {
    if (Types.ObjectId.isValid(payload.sub)) {
      const userObjectId = new Types.ObjectId(payload.sub);
      const revoked = await revokeAllSessionsForUser(userObjectId);
      auditWarn(
        {
          entity: 'user',
          entityId: payload.sub,
          action: 'refresh_replay_detected',
          details: { revokedSessions: revoked },
        },
        'auth_refresh_replay',
      );
    }
    throw ApiError.unauthorized('Refresh token replay detected. Sign in again.');
  }

  // Session must still be live (not revoked, not expired) per Mongo.
  if (!(await isSessionActive(payload.jti))) {
    throw ApiError.unauthorized('Session expired or revoked');
  }

  const user = await usersRepo.findById(payload.sub);
  if (!user || user.deletedAt !== null) {
    throw ApiError.unauthorized('User no longer exists');
  }
  if (!user.isActive) {
    throw new ApiError(403, ErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
  }

  // Commit the rotation: mark current session revoked AND push jti to blocklist
  // so even the just-used token can't be played back if leaked between steps.
  await revokeSession(payload.jti);
  await blocklistJti(payload.jti, new Date(payload.exp * 1000));

  const tokens = await issueTokenPair({
    userId: user._id,
    email: user.email,
    role: user.role,
    organisationId: user.organisationId,
    req,
  });

  auditLog({ entity: 'user', entityId: user._id.toString(), action: 'refresh' }, 'auth_refresh');

  return { user, tokens };
}

// ─── logout ──────────────────────────────────────────────────────────────

/**
 * Revoke the supplied refresh token (best-effort) and emit an audit log.
 *
 * Logout is idempotent: an invalid or already-expired cookie just clears the
 * session quietly. The caller (controller) also `res.clearCookie`s.
 */
export async function logoutUser(refreshToken: string | undefined, userId: string): Promise<void> {
  if (refreshToken) {
    try {
      const payload = verifyRefreshToken(refreshToken);
      await revokeSession(payload.jti);
      await blocklistJti(payload.jti, new Date(payload.exp * 1000));
    } catch {
      // Invalid / expired cookie — nothing to revoke. Logout still succeeds.
    }
  }

  auditLog({ entity: 'user', entityId: userId, action: 'logout' }, 'auth_logout');
}

// ─── /me ─────────────────────────────────────────────────────────────────

/**
 * Returns the current user record. The access token already carries `id`,
 * `email`, `role`, `organisationId` — but `/me` is the canonical endpoint
 * for the FE to fetch the full user profile (incl. fields not in the JWT).
 */
export async function getCurrentUser(userId: string): Promise<UserModel> {
  const user = await usersRepo.findById(userId);
  if (!user || user.deletedAt !== null) {
    throw ApiError.unauthorized('User no longer exists');
  }
  if (!user.isActive) {
    throw new ApiError(403, ErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
  }
  return user;
}

// ─── verify-email ────────────────────────────────────────────────────────

const RESET_TOKEN_TTL = '1h';

/**
 * Consume an email-verify JWT.
 *
 *   1. Verify signature + `purpose: 'verify'` + exp.
 *   2. Block replays: if the jti is already in the blocklist, the token was used.
 *   3. Update the user's isEmailVerified flag (idempotent — already-verified
 *      users still see a success response so the FE doesn't have to special-case).
 *   4. Push the jti to the blocklist (one-shot consumption).
 */
export async function verifyEmail(token: string): Promise<{ user: UserModel }> {
  let payload;
  try {
    payload = verifyPurposeToken(token, 'verify');
  } catch {
    throw new ApiError(401, ErrorCode.INVALID_TOKEN, 'Invalid or expired verification token');
  }

  if (await isJtiBlocklisted(payload.jti)) {
    throw new ApiError(
      401,
      ErrorCode.INVALID_TOKEN,
      'This verification link has already been used',
    );
  }

  const user = await usersRepo.findById(payload.sub);
  if (!user || user.deletedAt !== null) {
    throw ApiError.unauthorized('User no longer exists');
  }

  if (!user.isEmailVerified) {
    user.isEmailVerified = true;
    await user.save();
  }

  await blocklistJti(payload.jti, new Date(payload.exp * 1000));

  auditLog(
    { entity: 'user', entityId: user._id.toString(), action: 'email_verified' },
    'auth_email_verified',
  );

  return { user };
}

// ─── forgot-password ─────────────────────────────────────────────────────

/**
 * Send a password-reset link.
 *
 * **Security contract**: this endpoint MUST return the same response shape and
 * (approximately) the same timing whether the email exists or not. Otherwise
 * an attacker can probe valid accounts by submitting candidate emails.
 *
 * Real email send is stubbed; the dev URL is Pino-logged.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await usersRepo.findActiveByEmail(email);

  if (user && user.isActive) {
    const jti = randomUUID();
    const token = signPurposeToken(
      { sub: user._id.toString(), jti, purpose: 'reset' },
      RESET_TOKEN_TTL,
    );
    sendPasswordResetEmail(user.email, token);

    auditLog(
      {
        entity: 'user',
        entityId: user._id.toString(),
        action: 'password_reset_requested',
      },
      'auth_password_reset_requested',
    );
  } else {
    // Audit-log the miss too — useful for spotting credential-stuffing probes.
    // Don't log the queried email at info-level to avoid leaking PII at scale;
    // a hashed marker is plenty for forensic reconciliation if needed.
    auditLog(
      { entity: 'user', action: 'password_reset_requested_unknown_email' },
      'auth_password_reset_unknown',
    );
  }
}

// ─── reset-password ──────────────────────────────────────────────────────

/**
 * Consume a password-reset JWT and rotate the user's password.
 *
 *   1. Verify signature + `purpose: 'reset'` + exp.
 *   2. Reject replays via the blocklist.
 *   3. Hash + persist the new password.
 *   4. Push the jti to the blocklist (one-shot consumption).
 *   5. **Revoke every active session** for the user — per docs/10-security.md §10.2,
 *      password change invalidates all existing tokens.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  let payload;
  try {
    payload = verifyPurposeToken(token, 'reset');
  } catch {
    throw new ApiError(401, ErrorCode.INVALID_TOKEN, 'Invalid or expired reset token');
  }

  if (await isJtiBlocklisted(payload.jti)) {
    throw new ApiError(401, ErrorCode.INVALID_TOKEN, 'This reset link has already been used');
  }

  if (!Types.ObjectId.isValid(payload.sub)) {
    throw new ApiError(401, ErrorCode.INVALID_TOKEN, 'Invalid reset token');
  }
  const userObjectId = new Types.ObjectId(payload.sub);

  const user = await usersRepo.findById(userObjectId);
  if (!user || user.deletedAt !== null) {
    throw ApiError.unauthorized('User no longer exists');
  }
  if (!user.isActive) {
    throw new ApiError(403, ErrorCode.ACCOUNT_DISABLED, 'Account is disabled');
  }

  const passwordHash = await hashPassword(newPassword);
  await usersRepo.updateById(userObjectId, { passwordHash });

  // One-shot consumption of the reset token.
  await blocklistJti(payload.jti, new Date(payload.exp * 1000));

  // Sweep all active sessions — anyone holding a refresh token before the
  // password rotation must sign in again.
  const revokedCount = await revokeAllSessionsForUser(userObjectId);

  auditLog(
    {
      entity: 'user',
      entityId: user._id.toString(),
      action: 'password_reset_completed',
      details: { revokedSessions: revokedCount },
    },
    'auth_password_reset_completed',
  );
}
