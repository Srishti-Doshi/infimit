import { http, HttpResponse } from 'msw';

import {
  mockArticles,
  mockCategories,
  mockComments,
  mockEpaperIssues,
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
 * Mock session state. Login/register flip `mockSessionActive` on; logout flips
 * it off. `/auth/refresh` requires it so cold boot doesn't mint a token from
 * thin air. `mockUserState` is a shallow clone of the fixture user so PATCH
 * /users/me persists name changes within the session.
 */
let mockSessionActive = false;
let mockUserState: typeof mockUser = { ...mockUser };

/** Mutable admin lists — Day 7 CRUD modifies these in place per session. */
interface MockEditor {
  id: string;
  name: string;
  email: string;
  role: 'editor';
  sectionsOwned: string[];
  isActive: boolean;
}
interface MockOrganisation {
  id: string;
  name: string;
  slug: string;
  category: 'college' | 'ngo' | 'research_lab' | 'other';
  description?: string;
  website?: string;
  contactEmail?: string;
  verified: boolean;
}
const seedEditors = (): MockEditor[] => [
  {
    id: 'usr_editor_001',
    name: 'Rohan Desai',
    email: 'rohan@infimit.com',
    role: 'editor',
    sectionsOwned: ['research_innovation'],
    isActive: true,
  },
];
const seedOrgs = (): MockOrganisation[] => [
  {
    id: 'org_oakwood_001',
    name: 'Oakwood Institute',
    slug: 'oakwood-institute',
    category: 'college',
    verified: true,
  },
];
let mockEditorsList: MockEditor[] = seedEditors();
let mockOrgsList: MockOrganisation[] = seedOrgs();
let nextEditorId = 100;
let nextOrgId = 100;

function hasBearer(request: Request): boolean {
  return Boolean(request.headers.get('authorization'));
}

/** Test-only: reset mock session state between tests. */
export function __resetMocks(): void {
  mockSessionActive = false;
  mockUserState = { ...mockUser };
  mockEditorsList = seedEditors();
  mockOrgsList = seedOrgs();
  nextEditorId = 100;
  nextOrgId = 100;
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
  http.get(`${BASE}/auth/me`, ({ request }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    return ok({ user: mockUserState });
  }),
  http.post(`${BASE}/auth/login`, () => {
    mockSessionActive = true;
    mockUserState = { ...mockUser };
    return ok({ user: mockUserState, accessToken: 'mock-access-token', expiresIn: 900 });
  }),
  http.post(`${BASE}/auth/register`, () => {
    mockSessionActive = true;
    mockUserState = { ...mockUser };
    return ok({ user: mockUserState, accessToken: 'mock-access-token', expiresIn: 900 });
  }),
  http.post(`${BASE}/auth/logout`, () => {
    mockSessionActive = false;
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${BASE}/auth/refresh`, () => {
    if (!mockSessionActive) return err('UNAUTHORIZED', 'No active session', 401);
    return ok({ accessToken: 'mock-rotated-token', expiresIn: 900 });
  }),
  http.post(`${BASE}/auth/forgot-password`, () => ok({ sent: true })),
  http.post(`${BASE}/auth/reset-password`, () => ok({ reset: true })),
  http.post(`${BASE}/auth/verify-email`, () => ok({ verified: true })),

  // ── Users ───────────────────────────────────────────────────────────────
  http.get(`${BASE}/users/me`, ({ request }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    return ok({ user: mockUserState });
  }),
  http.patch(`${BASE}/users/me`, async ({ request }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    const body = (await request.json()) as Partial<typeof mockUserState>;
    mockUserState = { ...mockUserState, ...body };
    return ok({ user: mockUserState });
  }),
  http.get(`${BASE}/users/editors`, ({ request }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    return ok({ total: mockEditorsList.length, items: mockEditorsList });
  }),
  http.post(`${BASE}/users/editors`, async ({ request }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    const body = (await request.json()) as {
      name: string;
      email: string;
      password: string;
      sectionsOwned?: string[];
    };
    if (mockEditorsList.some((e) => e.email === body.email)) {
      return err('EMAIL_EXISTS', 'An account already exists for this email', 409);
    }
    const editor: MockEditor = {
      id: `usr_editor_${nextEditorId++}`,
      name: body.name,
      email: body.email,
      role: 'editor',
      sectionsOwned: body.sectionsOwned ?? [],
      isActive: true,
    };
    mockEditorsList.push(editor);
    return new HttpResponse(JSON.stringify({ success: true, data: { user: editor } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
  http.delete(`${BASE}/users/editors/:id`, ({ request, params }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    mockEditorsList = mockEditorsList.filter((e) => e.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${BASE}/users/:id`, ({ params }) => ok({ ...mockUser, id: String(params.id) })),

  // ── Organisations ──────────────────────────────────────────────────────
  http.get(`${BASE}/organisations`, ({ request }) => {
    // Public list — bearer not required.
    const url = new URL(request.url);
    const category = url.searchParams.get('category');
    const filtered = category ? mockOrgsList.filter((o) => o.category === category) : mockOrgsList;
    return ok({ total: filtered.length, items: filtered });
  }),
  http.get(`${BASE}/organisations/by-slug/:slug`, ({ params }) => {
    const org = mockOrgsList.find((o) => o.slug === params.slug);
    if (!org) return err('ORGANISATION_NOT_FOUND', 'Organisation not found', 404);
    return ok({ organisation: org });
  }),
  http.post(`${BASE}/organisations`, async ({ request }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    const body = (await request.json()) as Omit<MockOrganisation, 'id' | 'verified'> & {
      verified?: boolean;
    };
    if (mockOrgsList.some((o) => o.slug === body.slug)) {
      return err('CONFLICT', 'That slug is already taken', 409);
    }
    const org: MockOrganisation = {
      id: `org_new_${nextOrgId++}`,
      verified: true,
      ...body,
    };
    mockOrgsList.push(org);
    return new HttpResponse(JSON.stringify({ success: true, data: { organisation: org } }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  }),
  http.patch(`${BASE}/organisations/:id`, async ({ request, params }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    const idx = mockOrgsList.findIndex((o) => o.id === params.id);
    if (idx === -1) return err('NOT_FOUND', 'Organisation not found', 404);
    const body = (await request.json()) as Partial<MockOrganisation>;
    mockOrgsList[idx] = { ...mockOrgsList[idx]!, ...body };
    return ok({ organisation: mockOrgsList[idx] });
  }),
  http.delete(`${BASE}/organisations/:id`, ({ request, params }) => {
    if (!hasBearer(request)) return err('UNAUTHORIZED', 'Not signed in', 401);
    mockOrgsList = mockOrgsList.filter((o) => o.id !== params.id);
    return new HttpResponse(null, { status: 204 });
  }),

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
