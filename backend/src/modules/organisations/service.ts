/**
 * Organisations service — admin-managed institutional affiliations for authors.
 *
 * Implements:
 *   - listOrganisations / getOrganisationById / getOrganisationBySlug — public reads
 *   - createOrganisation / updateOrganisation                        — admin only
 *   - deleteOrganisation                                             — admin only
 *
 * Delete safety: organisations don't soft-delete (admin-curated, low volume).
 * Before hard-delete, refuse if any active author still references the org —
 * orphaned affiliations would leave the public author profile inconsistent.
 *
 * Slug is immutable post-create (validated at the schema layer): authors register
 * by slug, and rotating it would silently break pending registrations + links.
 */
import { Types, type FilterQuery } from 'mongoose';

import { auditLog } from '@/shared/audit';
import { ApiError } from '@/shared/errors';
import { ErrorCode } from '@/shared/errors/errorCodes';
import { usersRepo } from '@/modules/users';

import * as orgsRepo from './repository';
import type { OrganisationDocument, OrganisationModel } from './model';

export interface ListOrganisationsInput {
  page?: number;
  limit?: number;
  category?: OrganisationDocument['category'];
  q?: string;
}

export async function listOrganisations(input: ListOrganisationsInput): Promise<{
  items: OrganisationModel[];
  total: number;
  page: number;
  limit: number;
}> {
  const filter: FilterQuery<OrganisationDocument> = {};
  if (input.category) filter.category = input.category;
  // Free-text search — leverages the `name: text` index from model.ts.
  if (input.q) filter.$text = { $search: input.q };

  const { items, total } = await orgsRepo.list(filter, {
    page: input.page,
    limit: input.limit,
  });

  return {
    items,
    total,
    page: input.page ?? 1,
    limit: input.limit ?? 20,
  };
}

export async function getOrganisationById(id: string): Promise<OrganisationModel> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
  }
  const org = await orgsRepo.findById(id);
  if (!org) {
    throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
  }
  return org;
}

export async function getOrganisationBySlug(slug: string): Promise<OrganisationModel> {
  const org = await orgsRepo.findBySlug(slug);
  if (!org) {
    throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
  }
  return org;
}

export interface CreateOrganisationInput {
  name: string;
  slug: string;
  category: OrganisationDocument['category'];
  description?: string;
  website?: string;
  logoUrl?: string;
  contactEmail?: string;
  contactPhone?: string;
  verified?: boolean;
}

export async function createOrganisation(
  adminId: string,
  input: CreateOrganisationInput,
): Promise<OrganisationModel> {
  const existing = await orgsRepo.findBySlug(input.slug);
  if (existing) {
    throw ApiError.conflict('Slug is already in use');
  }

  const org = await orgsRepo.createOrganisation({
    name: input.name,
    slug: input.slug,
    category: input.category,
    description: input.description ?? null,
    website: input.website ?? null,
    logoUrl: input.logoUrl ?? null,
    contactEmail: input.contactEmail ?? null,
    contactPhone: input.contactPhone ?? null,
    // Admin-curated, so default to verified=true unless explicitly staging.
    verified: input.verified ?? true,
  });

  auditLog(
    {
      entity: 'organisation',
      entityId: org._id.toString(),
      action: 'organisation_created',
      actor: adminId,
      details: { slug: org.slug, category: org.category },
    },
    'organisation_created',
  );

  return org;
}

export interface UpdateOrganisationInput {
  name?: string;
  category?: OrganisationDocument['category'];
  description?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  verified?: boolean;
}

export async function updateOrganisation(
  adminId: string,
  id: string,
  patch: UpdateOrganisationInput,
): Promise<OrganisationModel> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
  }

  const updated = await orgsRepo.updateById(id, patch);
  if (!updated) {
    throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
  }

  auditLog(
    {
      entity: 'organisation',
      entityId: id,
      action: 'organisation_updated',
      actor: adminId,
      details: { fields: Object.keys(patch) },
    },
    'organisation_updated',
  );

  return updated;
}

export async function deleteOrganisation(adminId: string, id: string): Promise<void> {
  if (!Types.ObjectId.isValid(id)) {
    throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
  }

  const org = await orgsRepo.findById(id);
  if (!org) {
    throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
  }

  // Cascade safety: if any active author still references this org, refuse.
  // We could cascade-null the field but losing an author's affiliation silently
  // is worse than forcing the admin to reassign first.
  const orgObjectId = new Types.ObjectId(id);
  const activeAuthorsLinked = await usersRepo.countActiveBy({
    role: 'author',
    organisationId: orgObjectId,
  });
  if (activeAuthorsLinked > 0) {
    throw ApiError.conflict(
      `Cannot delete organisation: ${activeAuthorsLinked} active author(s) are affiliated`,
    );
  }

  const deleted = await orgsRepo.deleteById(id);
  if (!deleted) {
    throw new ApiError(404, ErrorCode.ORGANISATION_NOT_FOUND, 'Organisation not found');
  }

  auditLog(
    {
      entity: 'organisation',
      entityId: id,
      action: 'organisation_deleted',
      actor: adminId,
      details: { slug: org.slug },
    },
    'organisation_deleted',
  );
}
