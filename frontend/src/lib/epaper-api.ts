import { apiClient } from './api-client';
import type { CreateEpaperInput } from './epaper-schema';
import type { ApiSuccess } from '@/types/api';
import type { Epaper } from '@/types/epaper';

/**
 * E-paper resource client (Subphase 4 surface).
 *
 * Backend split:
 *   - `GET /v1/epapers`           — public list, newest issueDate first
 *   - `GET /v1/epapers/:id`       — public single read (bumps views server-side)
 *   - `GET /v1/epapers/:id/download` — public; **302-redirects** to a presigned
 *                                      S3 GET URL. We don't call this through
 *                                      `apiClient` (axios would follow the
 *                                      redirect and try to JSON-parse the
 *                                      binary). Instead, expose the URL
 *                                      directly and let the browser fetch it.
 *   - `POST /v1/epapers`          — admin create (JSON; PDF + cover uploaded
 *                                    separately via `/v1/media/upload-url`)
 *   - `DELETE /v1/epapers/:id`    — admin delete
 */

export interface EpapersListResult {
  items: Epaper[];
  total: number;
  page?: number;
  limit?: number;
}

export interface ListEpapersQuery {
  page?: number;
  limit?: number;
  /** ISO date or `YYYY-MM-DD` — lower bound on issueDate. */
  from?: string;
  /** ISO date or `YYYY-MM-DD` — upper bound on issueDate. */
  to?: string;
}

export async function listEpapers(query: ListEpapersQuery = {}): Promise<EpapersListResult> {
  const res = await apiClient.get<ApiSuccess<EpapersListResult>>('/epapers', {
    params: query,
  });
  return res.data.data;
}

export async function getEpaper(id: string): Promise<Epaper> {
  const res = await apiClient.get<ApiSuccess<{ epaper: Epaper }>>(`/epapers/${id}`);
  return res.data.data.epaper;
}

/**
 * Build the direct browser download URL for an issue. The backend 302s to a
 * short-TTL presigned S3 GET — we let the browser follow it natively so the
 * binary streams to the user's downloads folder, not through the SPA.
 */
export function epaperDownloadUrl(id: string): string {
  const base = apiClient.defaults.baseURL ?? '';
  return `${base.replace(/\/+$/, '')}/epapers/${id}/download`;
}

export async function createEpaper(body: CreateEpaperInput): Promise<Epaper> {
  const res = await apiClient.post<ApiSuccess<{ epaper: Epaper }>>('/epapers', body);
  return res.data.data.epaper;
}

export async function deleteEpaper(id: string): Promise<void> {
  await apiClient.delete(`/epapers/${id}`);
}
