/**
 * User repository — data access for the users collection.
 *
 * `findActiveByEmail` excludes soft-deleted accounts (matches the partial unique
 * index in model.ts). `findMostRecentlyDeletedByEmail` is the counterpart used
 * by the service layer to enforce the 30-day re-registration delay.
 *
 * `+passwordHash` is required on any path that needs to verify a password —
 * the field is `select: false` at the model level so accidental leaks are
 * prevented by default.
 */
import { type FilterQuery, type Types } from 'mongoose';

import { User, type UserDocument, type UserModel, type UserRole } from './model';

export async function findActiveByEmail(email: string): Promise<UserModel | null> {
  return User.findOne({ email, deletedAt: null }).exec();
}

/** For the login flow — explicitly pulls the password hash. */
export async function findActiveByEmailWithPassword(email: string): Promise<UserModel | null> {
  return User.findOne({ email, deletedAt: null }).select('+passwordHash').exec();
}

/** Used to enforce the 30-day re-registration delay on soft-deleted accounts. */
export async function findMostRecentlyDeletedByEmail(email: string): Promise<UserModel | null> {
  return User.findOne({ email, deletedAt: { $ne: null } })
    .sort({ deletedAt: -1 })
    .exec();
}

export async function findBySlug(slug: string): Promise<UserModel | null> {
  return User.findOne({ slug, deletedAt: null }).exec();
}

export async function findById(id: Types.ObjectId | string): Promise<UserModel | null> {
  return User.findById(id).exec();
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  name: string;
  slug?: string | null;
  role: UserRole;
  organisationId?: Types.ObjectId | null;
  sectionsOwned?: string[];
}

export async function createUser(input: CreateUserInput): Promise<UserModel> {
  return User.create({
    email: input.email,
    passwordHash: input.passwordHash,
    name: input.name,
    slug: input.slug ?? null,
    role: input.role,
    organisationId: input.organisationId ?? null,
    sectionsOwned: input.sectionsOwned ?? [],
  });
}

export async function updateById(
  id: Types.ObjectId | string,
  patch: Partial<
    Pick<
      UserDocument,
      | 'name'
      | 'slug'
      | 'sectionsOwned'
      | 'isEmailVerified'
      | 'isActive'
      | 'deletedAt'
      | 'passwordHash'
    >
  >,
): Promise<UserModel | null> {
  return User.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec();
}

export async function countActiveBy(filter: FilterQuery<UserDocument>): Promise<number> {
  return User.countDocuments({ ...filter, deletedAt: null }).exec();
}

/**
 * Paginated active list for a given role. Used by:
 *   - listAuthors (public)
 *   - listEditors (admin)
 */
export async function listActiveByRole(
  role: UserRole,
  options: { page?: number; limit?: number } = {},
): Promise<{ items: UserModel[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const skip = (page - 1) * limit;
  const filter: FilterQuery<UserDocument> = { role, deletedAt: null, isActive: true };

  const [items, total] = await Promise.all([
    User.find(filter).sort({ name: 1 }).skip(skip).limit(limit).exec(),
    User.countDocuments(filter).exec(),
  ]);

  return { items, total };
}
