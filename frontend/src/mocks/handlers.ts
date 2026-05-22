import { http, HttpResponse } from 'msw';

import {
  mockArticles,
  mockCategories,
  mockComments,
  mockEpaperIssues,
  mockOrganisation,
  mockTags,
  mockUser,
} from './fixtures';

/**
 * Base URL used to match incoming requests. Matches the same env var the
 * axios client consumes, so handlers are guaranteed to align with the
 * client config no matter what value the dev sets.
 */
const BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/v1';

/**
 * Envelope helpers — every handler returns through these so the response
 * shape mirrors the backend's documented contract (per docs/05-api §5).
 */
function ok<T>(data: T, meta?: { page?: number; limit?: number; total?: number }) {
  return HttpResponse.json({ success: true, data, ...(meta ? { meta } : {}) });
}

function err(code: string, message: string, status: number, details?: unknown) {
  return HttpResponse.json(
    { success: false, error: { code, message, ...(details ? { details } : {}) } },
    { status },
  );
}

/**
 * Mock request handlers — one per documented endpoint group.
 *
 * Subphase 1 — happy-path stubs return fixtures. Auth-guarded endpoints
 * return 401 by default so the auth flow we wire in Subphase 2 has a
 * realistic baseline. Extend or override per-test in Vitest by passing
 * additional handlers to `worker.use(...)`.
 */
export const handlers = [
  // ── Health ─────────────────────────────────────────────────────────────
  http.get(`${BASE.replace(/\/v1$/, '')}/healthz`, () => ok({ status: 'ok' })),
  http.get(`${BASE.replace(/\/v1$/, '')}/readyz`, () =>
    ok({ status: 'ready', checks: { mongo: 'ok', redis: 'ok' } }),
  ),
  http.get(`${BASE.replace(/\/v1$/, '')}/version`, () =>
    ok({ name: 'infimit-backend', version: '0.1.0', env: 'mock' }),
  ),

  // ── Auth ────────────────────────────────────────────────────────────────
  http.get(`${BASE}/auth/me`, () => err('UNAUTHORIZED', 'Not signed in', 401)),
  http.post(`${BASE}/auth/login`, () => ok({ user: mockUser, accessToken: 'mock-access-token' })),
  http.post(`${BASE}/auth/register`, () =>
    ok({ user: mockUser, accessToken: 'mock-access-token' }),
  ),
  http.post(`${BASE}/auth/logout`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${BASE}/auth/refresh`, () => ok({ accessToken: 'mock-rotated-token' })),
  http.post(`${BASE}/auth/forgot-password`, () => ok({ sent: true })),
  http.post(`${BASE}/auth/reset-password`, () => ok({ reset: true })),

  // ── Users ───────────────────────────────────────────────────────────────
  http.get(`${BASE}/users/me`, () => err('UNAUTHORIZED', 'Not signed in', 401)),
  http.get(`${BASE}/users/:id`, ({ params }) => ok({ ...mockUser, id: String(params.id) })),

  // ── Organisations ──────────────────────────────────────────────────────
  http.get(`${BASE}/organisations`, () => ok([mockOrganisation], { page: 1, limit: 20, total: 1 })),
  http.get(`${BASE}/organisations/:slug`, ({ params }) =>
    ok({ ...mockOrganisation, slug: String(params.slug) }),
  ),

  // ── Categories ─────────────────────────────────────────────────────────
  http.get(`${BASE}/categories`, () => ok(mockCategories)),

  // ── Articles ───────────────────────────────────────────────────────────
  http.get(`${BASE}/articles`, () =>
    ok(mockArticles, { page: 1, limit: 20, total: mockArticles.length }),
  ),
  http.get(`${BASE}/articles/feed/home`, () =>
    ok({ hero: mockArticles[0], rail: mockArticles.slice(1) }),
  ),
  http.get(`${BASE}/articles/:slug`, ({ params }) => {
    const article = mockArticles.find((a) => a.slug === params.slug);
    if (!article) return err('NOT_FOUND', 'Article not found', 404);
    return ok({ ...article, body: '<p>Mock article body (Subphase 1 placeholder).</p>' });
  }),
  http.post(`${BASE}/articles`, () => err('UNAUTHORIZED', 'Sign in to submit articles', 401)),

  // ── Comments ───────────────────────────────────────────────────────────
  http.get(`${BASE}/articles/:articleId/comments`, ({ params }) =>
    ok(mockComments.filter((c) => c.articleId === params.articleId)),
  ),
  http.post(`${BASE}/articles/:articleId/comments`, () =>
    err('UNAUTHORIZED', 'Sign in to comment', 401),
  ),

  // ── Tags ────────────────────────────────────────────────────────────────
  http.get(`${BASE}/tags`, () => ok(mockTags)),

  // ── Search ──────────────────────────────────────────────────────────────
  http.get(`${BASE}/search`, ({ request }) => {
    const url = new URL(request.url);
    const q = url.searchParams.get('q') ?? '';
    const results = q
      ? mockArticles.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()))
      : [];
    return ok(results, { page: 1, limit: 20, total: results.length });
  }),

  // ── E-paper ────────────────────────────────────────────────────────────
  http.get(`${BASE}/epaper`, () => ok(mockEpaperIssues)),

  // ── Bookmarks ──────────────────────────────────────────────────────────
  http.get(`${BASE}/bookmarks`, () => err('UNAUTHORIZED', 'Sign in to view bookmarks', 401)),

  // ── Notifications ──────────────────────────────────────────────────────
  http.get(`${BASE}/notifications`, () => ok([])),

  // ── Ads ─────────────────────────────────────────────────────────────────
  http.get(`${BASE}/ads`, () => ok([])),

  // ── Analytics ──────────────────────────────────────────────────────────
  http.post(`${BASE}/analytics/track`, () => new HttpResponse(null, { status: 204 })),

  // ── Media ───────────────────────────────────────────────────────────────
  http.post(`${BASE}/media`, () => err('UNAUTHORIZED', 'Sign in to upload', 401)),

  // ── AI proxy ───────────────────────────────────────────────────────────
  http.post(`${BASE}/ai/summarize`, () =>
    ok({ summary: 'Mock AI summary (real AI service wires in Subphase 5).' }),
  ),
  http.post(`${BASE}/ai/tags`, () => ok({ tags: ['mock', 'placeholder'] })),
];
