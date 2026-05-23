/**
 * Users service — business logic for the users module.
 *
 * Implements:
 *   - getMe / updateMe         — authenticated self-service
 *   - getAuthorBySlug / listAuthors — public author surfaces
 *   - listEditors / createEditor / removeEditor — admin-only editor management
 *
 * Editor removal is SOFT: `deletedAt = now`, `isActive = false`. The email is
 * not re-registerable until `deletedAt + 30 days` — that delay is enforced by
 * the auth module's `registerUser`. Admins can't soft-delete themselves; that
 * guard is here so the API rejects it cleanly (vs. a downstream consistency
 * error).
 */
import { randomUUID } from 'node:crypto';
import { Types } from 'mongoose';

import { auditLog } from '@/shared/audit';
import { ApiError } from '@/shared/errors';
import { ErrorCode } from '@/shared/errors/errorCodes';
import { hashPassword, signPurposeToken } from '@/shared/crypto';

import { revokeAllSessionsForUser, sendEditorWelcomeEmail } from '@/modules/auth';

import * as usersRepo from './repository';
import type { UserModel } from './model';

const PASSWORD_RESET_TTL = '24h';

// ─── self-service ────────────────────────────────────────────────────────

export async function getMe(userId: string): Promise<UserModel> {
  const user = await usersRepo.findById(userId);
  if (!user || user.deletedAt !== null) {
    throw ApiError.unauthorized('User no longer exists');
  }
  return user;
}

export interface UpdateMeInput {
  name?: string;
  slug?: string;
}

export async function updateMe(userId: string, patch: UpdateMeInput): Promise<UserModel> {
  const user = await usersRepo.findById(userId);
  if (!user || user.deletedAt !== null) {
    throw ApiError.unauthorized('User no longer exists');
  }

  // If the slug is changing, make sure it doesn't collide with another active user.
  if (patch.slug !== undefined && patch.slug !== user.slug) {
    const taken = await usersRepo.findBySlug(patch.slug);
    if (taken && taken._id.toString() !== userId) {
      throw ApiError.conflict('Slug is already in use');
    }
  }

  const updated = await usersRepo.updateById(userId, {
    ...(patch.name !== undefined ? { name: patch.name } : {}),
    ...(patch.slug !== undefined ? { slug: patch.slug } : {}),
  });
  if (!updated) {
    throw ApiError.notFound('User not found');
  }

  auditLog(
    {
      entity: 'user',
      entityId: userId,
      action: 'profile_updated',
      actor: userId,
      details: { fields: Object.keys(patch) },
    },
    'user_profile_updated',
  );

  return updated;
}

// ─── public authors ──────────────────────────────────────────────────────

export async function getAuthorBySlug(slug: string): Promise<UserModel> {
  const user = await usersRepo.findBySlug(slug);
  if (!user || user.role !== 'author' || !user.isActive || user.deletedAt !== null) {
    throw ApiError.notFound('Author not found');
  }
  return user;
}

export async function listAuthors(query: {
  page?: number;
  limit?: number;
}): Promise<{ items: UserModel[]; total: number; page: number; limit: number }> {
  const { items, total } = await usersRepo.listActiveByRole('author', query);
  return {
    items,
    total,
    page: query.page ?? 1,
    limit: query.limit ?? 20,
  };
}

// ─── admin: editors ──────────────────────────────────────────────────────

export async function listEditors(query: {
  page?: number;
  limit?: number;
}): Promise<{ items: UserModel[]; total: number; page: number; limit: number }> {
  const { items, total } = await usersRepo.listActiveByRole('editor', query);
  return {
    items,
    total,
    page: query.page ?? 1,
    limit: query.limit ?? 20,
  };
}

export interface CreateEditorInput {
  name: string;
  email: string;
  password: string;
  sectionsOwned: string[];
}

/**
 * Admin creates an editor. The editor's password is the one the admin supplied;
 * we ALSO mint a password-reset token and email it so the editor can rotate it
 * on first login if they prefer. Mirrors how real ops onboarding tends to work.
 */
export async function createEditor(adminId: string, input: CreateEditorInput): Promise<UserModel> {
  const existing = await usersRepo.findActiveByEmail(input.email);
  if (existing) {
    throw new ApiError(409, ErrorCode.EMAIL_EXISTS, 'Email is already registered');
  }

  const passwordHash = await hashPassword(input.password);

  const user = await usersRepo.createUser({
    email: input.email,
    passwordHash,
    name: input.name,
    role: 'editor',
    sectionsOwned: input.sectionsOwned,
    // Editors don't get a public slug; only authors do.
    slug: null,
  });

  // Welcome email — includes a reset-purpose JWT so the editor can set their
  // own password on first login if they want.
  const resetJti = randomUUID();
  const resetToken = signPurposeToken(
    { sub: user._id.toString(), jti: resetJti, purpose: 'reset' },
    PASSWORD_RESET_TTL,
  );
  sendEditorWelcomeEmail(user.email, resetToken);

  auditLog(
    {
      entity: 'user',
      entityId: user._id.toString(),
      action: 'editor_created',
      actor: adminId,
      details: { sectionsOwned: input.sectionsOwned },
    },
    'user_editor_created',
  );

  return user;
}

/**
 * Soft-delete an editor. Sets `deletedAt = now`, `isActive = false`, and
 * revokes every active session for the user so they're logged out instantly.
 *
 * Guards:
 *   - Target must exist and currently be role=editor.
 *   - Admin can't delete themselves through this endpoint.
 */
export async function removeEditor(adminId: string, targetId: string): Promise<void> {
  if (adminId === targetId) {
    throw ApiError.forbidden('Cannot remove your own account');
  }

  if (!Types.ObjectId.isValid(targetId)) {
    throw ApiError.validation('Invalid editor id');
  }

  const target = await usersRepo.findById(targetId);
  if (!target || target.deletedAt !== null) {
    throw ApiError.notFound('Editor not found');
  }
  if (target.role !== 'editor') {
    throw ApiError.forbidden('Only editor accounts can be removed via this endpoint');
  }

  await usersRepo.updateById(targetId, {
    deletedAt: new Date(),
    isActive: false,
  });

  const targetObjectId = new Types.ObjectId(targetId);
  const revoked = await revokeAllSessionsForUser(targetObjectId);

  auditLog(
    {
      entity: 'user',
      entityId: targetId,
      action: 'editor_removed',
      actor: adminId,
      details: { revokedSessions: revoked },
    },
    'user_editor_removed',
  );
}
