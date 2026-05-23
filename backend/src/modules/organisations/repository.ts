/**
 * Organisation repository — data access for the organisations collection.
 *
 * Thin pass-throughs to Mongoose. Service-layer enforces auth/scope rules.
 */
import { type FilterQuery, type Types } from 'mongoose';

import {
  Organisation,
  type OrganisationCategory,
  type OrganisationDocument,
  type OrganisationModel,
} from './model';

export async function findBySlug(slug: string): Promise<OrganisationModel | null> {
  return Organisation.findOne({ slug }).exec();
}

export async function findById(id: Types.ObjectId | string): Promise<OrganisationModel | null> {
  return Organisation.findById(id).exec();
}

export interface CreateOrganisationInput {
  name: string;
  slug: string;
  category: OrganisationCategory;
  logoUrl?: string | null;
  description?: string | null;
  website?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  verified?: boolean;
}

export async function createOrganisation(
  input: CreateOrganisationInput,
): Promise<OrganisationModel> {
  return Organisation.create({
    name: input.name,
    slug: input.slug,
    category: input.category,
    logoUrl: input.logoUrl ?? null,
    description: input.description ?? null,
    website: input.website ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    verified: input.verified ?? false,
  });
}

export async function updateById(
  id: Types.ObjectId | string,
  patch: Partial<
    Pick<
      OrganisationDocument,
      | 'name'
      | 'logoUrl'
      | 'description'
      | 'website'
      | 'contactEmail'
      | 'contactPhone'
      | 'category'
      | 'verified'
    >
  >,
): Promise<OrganisationModel | null> {
  return Organisation.findByIdAndUpdate(id, { $set: patch }, { new: true }).exec();
}

export async function deleteById(id: Types.ObjectId | string): Promise<boolean> {
  const result = await Organisation.deleteOne({ _id: id }).exec();
  return result.deletedCount === 1;
}

export async function list(
  filter: FilterQuery<OrganisationDocument> = {},
  options: { page?: number; limit?: number } = {},
): Promise<{ items: OrganisationModel[]; total: number }> {
  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, Math.min(100, options.limit ?? 20));
  const skip = (page - 1) * limit;

  const [items, total] = await Promise.all([
    Organisation.find(filter).sort({ name: 1 }).skip(skip).limit(limit).exec(),
    Organisation.countDocuments(filter).exec(),
  ]);

  return { items, total };
}
