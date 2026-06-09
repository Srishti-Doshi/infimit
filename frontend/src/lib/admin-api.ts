import { apiClient } from './api-client';
import type {
  CreateAuthorInput,
  CreateEditorInput,
  CreateOrganisationInput,
  UpdateOrganisationInput,
} from './admin-schema';
import type { ApiSuccess } from '@/types/api';
import type { AuthPayload, User } from '@/types/auth';
import type { Organisation } from '@/types/organisation';
import type { Role } from '@/types/auth';

/**
 * Admin resource clients. Lists wrap in `{ total, items }`, singles in
 * `{ user }` / `{ organisation }` — shapes verified against backend tests.
 *
 * Backend Subphase 3 added a `toJSON.transform` to every Mongoose schema that
 * rewrites `_id → id`, so the FE no longer needs a normalization shim.
 */

// ── Editors ───────────────────────────────────────────────────────────────

export interface ListedEditor extends User {
  sectionsOwned?: string[];
  isActive?: boolean;
}

interface EditorList {
  total: number;
  items: ListedEditor[];
}

export async function listEditors(): Promise<EditorList> {
  const res = await apiClient.get<ApiSuccess<EditorList>>('/users/editors');
  return res.data.data;
}

export async function createEditor(body: CreateEditorInput): Promise<ListedEditor> {
  const res = await apiClient.post<ApiSuccess<{ user: ListedEditor }>>('/users/editors', body);
  return res.data.data.user;
}

export async function deleteEditor(id: string): Promise<void> {
  await apiClient.delete(`/users/editors/${id}`);
}

// ── Authors ───────────────────────────────────────────────────────────────

export interface ListedAuthor extends User {
  isActive?: boolean;
}

interface AuthorList {
  total: number;
  items: ListedAuthor[];
}

export async function listAuthors(): Promise<AuthorList> {
  const res = await apiClient.get<ApiSuccess<AuthorList>>('/users/authors');
  return res.data.data;
}

/**
 * Admin creates an author by hitting the public `/auth/register` with
 * `role: 'author'` + an `organisationSlug`. The BE accepts this shape;
 * Subphase 2's public form is intentionally reader-only, so this is the
 * primary path for new author accounts (#33).
 */
export async function createAuthor(body: CreateAuthorInput): Promise<ListedAuthor> {
  const res = await apiClient.post<ApiSuccess<AuthPayload>>('/auth/register', {
    role: 'author',
    ...body,
  });
  return res.data.data.user as ListedAuthor;
}

// ── Role management ───────────────────────────────────────────────────────

/** `GET /v1/users/lookup?email=` — admin-only, returns the user or throws 404. */
export async function lookupUserByEmail(email: string): Promise<User> {
  const res = await apiClient.get<ApiSuccess<{ user: User }>>('/users/lookup', {
    params: { email },
  });
  return res.data.data.user;
}

/** `PATCH /v1/users/:id/role` — admin-only role change. */
export async function updateUserRole(id: string, role: Role): Promise<User> {
  const res = await apiClient.patch<ApiSuccess<{ user: User }>>(`/users/${id}/role`, { role });
  return res.data.data.user;
}

// ── Organisations ─────────────────────────────────────────────────────────

interface OrganisationList {
  total: number;
  items: Organisation[];
}

export async function listOrganisations(): Promise<OrganisationList> {
  const res = await apiClient.get<ApiSuccess<OrganisationList>>('/organisations');
  return res.data.data;
}

export async function createOrganisation(body: CreateOrganisationInput): Promise<Organisation> {
  const res = await apiClient.post<ApiSuccess<{ organisation: Organisation }>>(
    '/organisations',
    body,
  );
  return res.data.data.organisation;
}

export async function updateOrganisation(
  id: string,
  body: UpdateOrganisationInput,
): Promise<Organisation> {
  const res = await apiClient.patch<ApiSuccess<{ organisation: Organisation }>>(
    `/organisations/${id}`,
    body,
  );
  return res.data.data.organisation;
}

export async function deleteOrganisation(id: string): Promise<void> {
  await apiClient.delete(`/organisations/${id}`);
}
