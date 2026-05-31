import { apiClient } from './api-client';
import type {
  CreateEditorInput,
  CreateOrganisationInput,
  UpdateOrganisationInput,
} from './admin-schema';
import type { ApiSuccess } from '@/types/api';
import type { Organisation } from '@/types/organisation';
import type { User } from '@/types/auth';

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
