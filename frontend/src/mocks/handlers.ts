import { http, HttpResponse } from 'msw';

import {
  mockArticleSummaries,
  mockCategories,
  mockComments,
  mockDrafts,
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

/** Mutable drafts list — Subphase 3 author CRUD modifies this in place per session. */
let mockDraftsState: Array<(typeof mockDrafts)[number]> = [...mockDrafts];
let nextDraftId = 100;

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
  mockDraftsState = [...mockDrafts];
  nextDraftId = 100;
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
  // Subphase 3 author surface — list returns the {items, total} envelope to
  // match the real backend. `authorId=me` filters to the seeded mock user;
  // `status` narrows further. Real-backend RBAC also requires bearer, but the
  // mock stays permissive in dev so MSW-only flows don't need a fake login.
  http.get(`${BASE}/articles`, ({ request }) => {
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const authorIdParam = url.searchParams.get('authorId');
    // `'me'` mirrors the real backend, which resolves it to the bearer's
    // user id. In MSW we map it to the seeded mockUser. When no authorId
    // is passed (e.g. the editor approval queue), the list is unscoped so
    // every author's submissions surface — that's what an editor expects.
    const authorId = authorIdParam === 'me' ? mockUserState.id : (authorIdParam ?? null);
    const items = mockDraftsState.filter((d) => {
      if (status && d.status !== status) return false;
      if (authorId && d.authorId !== authorId) return false;
      return true;
    });
    return ok({ items, total: items.length, page: 1, limit: 20 });
  }),
  // Single article by id — used by the edit-draft route (Day 5).
  http.get(`${BASE}/articles/:id`, ({ params }) => {
    const article = mockDraftsState.find((d) => d.id === params.id);
    if (!article) return err('NOT_FOUND', 'Article not found', 404);
    return ok({ article });
  }),
  // Subphase 5 reader-shape handlers — kept on the renamed summary fixture
  // until the reader UI lands.
  http.get(`${BASE}/articles/feed/home`, () =>
    ok({ hero: mockArticleSummaries[0], rail: mockArticleSummaries.slice(1) }),
  ),
  http.get(`${BASE}/articles/by-slug/:slug`, ({ params }) => {
    const article = mockArticleSummaries.find((a) => a.slug === params.slug);
    if (!article) return err('NOT_FOUND', 'Article not found', 404);
    return ok({ article });
  }),
  // POST creates a draft. Real backend defaults status=draft + version=0 +
  // authorId from the bearer; we mirror that here. Returns the new article
  // wrapped in `{ article }` per the envelope contract.
  http.post(`${BASE}/articles`, async ({ request }) => {
    const body = (await request.json()) as Partial<(typeof mockDrafts)[number]> & {
      mediaIds?: string[];
    };
    const now = new Date().toISOString();
    nextDraftId += 1;
    const newArticle: (typeof mockDrafts)[number] = {
      id: `art_draft_${nextDraftId.toString().padStart(3, '0')}`,
      title: body.title ?? '',
      subtitle: body.subtitle ?? '',
      body: body.body ?? '',
      plainText: body.plainText ?? '',
      coverImageUrl: null,
      coverImageMediaId: body.coverImageMediaId ?? null,
      media: body.mediaIds ?? [],
      category: body.category ?? 'campus_news',
      subcategory: null,
      tags: body.tags ?? [],
      location: body.location ?? null,
      authorId: mockUserState.id,
      organisationId: null,
      editorId: null,
      status: 'draft',
      rejectionReason: null,
      version: 0,
      submittedAt: null,
      publishedAt: null,
      approvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    mockDraftsState = [newArticle, ...mockDraftsState];
    return HttpResponse.json({ success: true, data: { article: newArticle } }, { status: 201 });
  }),

  // PATCH enforces optimistic concurrency: the caller must echo the article's
  // current `version`. Mismatch → 409 VERSION_CONFLICT with the live version
  // in `details.currentVersion` so the FE can offer a reload.
  http.patch(`${BASE}/articles/:id`, async ({ request, params }) => {
    const body = (await request.json()) as Partial<(typeof mockDrafts)[number]> & {
      version?: number;
    };
    const idx = mockDraftsState.findIndex((d) => d.id === params.id);
    if (idx === -1) return err('NOT_FOUND', 'Article not found', 404);

    const current = mockDraftsState[idx]!;
    if (typeof body.version !== 'number' || body.version !== current.version) {
      return err('VERSION_CONFLICT', 'Stale version', 409, {
        currentVersion: current.version,
      });
    }

    // `body.version` was a concurrency token, not a value to write — the spread
    // below intentionally overwrites it with the bumped version.
    const updated: (typeof mockDrafts)[number] = {
      ...current,
      ...body,
      version: current.version + 1,
      updatedAt: new Date().toISOString(),
    };
    mockDraftsState = mockDraftsState.map((d, i) => (i === idx ? updated : d));
    return ok({ article: updated });
  }),

  // POST /:id/submit — flips draft → submitted. Mirrors the backend's
  // submission checklist (docs/07-workflows.md §7.1): title set, plainText
  // ≥ 300 chars, cover attached, 1-10 tags. Each failure shapes the 422 with
  // a precise `details.field` the FE can map inline. Already-submitted ⇒ 409
  // INVALID_STATE so the FE can react idempotently.
  http.post(`${BASE}/articles/:id/submit`, ({ params }) => {
    const idx = mockDraftsState.findIndex((d) => d.id === params.id);
    if (idx === -1) return err('NOT_FOUND', 'Article not found', 404);
    const article = mockDraftsState[idx]!;

    if (article.status !== 'draft') {
      return err('INVALID_STATE', `Already ${article.status}`, 409);
    }
    if (!article.title || article.title.trim().length === 0) {
      return err('VALIDATION_ERROR', 'Title is required', 422, { field: 'title' });
    }
    const len = (article.plainText ?? '').length;
    if (len < 300) {
      return err('VALIDATION_ERROR', 'Body too short', 422, {
        field: 'body',
        currentLength: len,
        minLength: 300,
      });
    }
    if (!article.coverImageMediaId) {
      return err('VALIDATION_ERROR', 'Cover image is required', 422, {
        field: 'coverImageMediaId',
      });
    }
    const tagCount = article.tags?.length ?? 0;
    if (tagCount < 1 || tagCount > 10) {
      return err('VALIDATION_ERROR', 'Add 1–10 tags', 422, {
        field: 'tags',
        currentCount: tagCount,
      });
    }

    const updated: (typeof mockDrafts)[number] = {
      ...article,
      status: 'submitted',
      submittedAt: new Date().toISOString(),
      version: article.version + 1,
      updatedAt: new Date().toISOString(),
    };
    mockDraftsState = mockDraftsState.map((d, i) => (i === idx ? updated : d));
    return ok({ article: updated });
  }),

  // POST /:id/approve — submitted → approved. Real backend also kicks off the
  // AI pipeline + writes back `article.ai.*`; the mock omits that side-effect
  // for now (FE-4b will mock the AI summary block separately).
  http.post(`${BASE}/articles/:id/approve`, ({ params }) => {
    const idx = mockDraftsState.findIndex((d) => d.id === params.id);
    if (idx === -1) return err('NOT_FOUND', 'Article not found', 404);
    const article = mockDraftsState[idx]!;
    if (article.status !== 'submitted') {
      return err('INVALID_STATE', `Cannot approve from ${article.status}`, 422);
    }
    const updated: (typeof mockDrafts)[number] = {
      ...article,
      status: 'approved',
      approvedAt: new Date().toISOString(),
      version: article.version + 1,
      updatedAt: new Date().toISOString(),
    };
    mockDraftsState = mockDraftsState.map((d, i) => (i === idx ? updated : d));
    return ok({ article: updated });
  }),

  // POST /:id/reject — submitted → rejected. Persists `rejectionReason` so
  // the author surface (FE Subphase 3) can render it on their submissions
  // tracker. 10–500 char validation mirrors `backend/.../validator.ts`.
  http.post(`${BASE}/articles/:id/reject`, async ({ request, params }) => {
    const body = (await request.json()) as { rejectionReason?: string };
    const idx = mockDraftsState.findIndex((d) => d.id === params.id);
    if (idx === -1) return err('NOT_FOUND', 'Article not found', 404);
    const article = mockDraftsState[idx]!;
    if (article.status !== 'submitted') {
      return err('INVALID_STATE', `Cannot reject from ${article.status}`, 422);
    }
    const reason = body.rejectionReason?.trim() ?? '';
    if (reason.length < 10 || reason.length > 500) {
      return err('VALIDATION_ERROR', 'Rejection reason must be 10–500 characters', 422, {
        field: 'rejectionReason',
      });
    }
    const updated: (typeof mockDrafts)[number] = {
      ...article,
      status: 'rejected',
      rejectionReason: reason,
      version: article.version + 1,
      updatedAt: new Date().toISOString(),
    };
    mockDraftsState = mockDraftsState.map((d, i) => (i === idx ? updated : d));
    return ok({ article: updated });
  }),

  // POST /:id/publish — approved → published. Real backend invalidates Redis
  // cache + indexes for search; mock just flips the status. publishedAt is
  // set fresh so the resulting timestamp matches the action, not the prior
  // approvedAt.
  http.post(`${BASE}/articles/:id/publish`, ({ params }) => {
    const idx = mockDraftsState.findIndex((d) => d.id === params.id);
    if (idx === -1) return err('NOT_FOUND', 'Article not found', 404);
    const article = mockDraftsState[idx]!;
    if (article.status !== 'approved') {
      return err('INVALID_STATE', `Cannot publish from ${article.status}`, 422);
    }
    const updated: (typeof mockDrafts)[number] = {
      ...article,
      status: 'published',
      publishedAt: new Date().toISOString(),
      version: article.version + 1,
      updatedAt: new Date().toISOString(),
    };
    mockDraftsState = mockDraftsState.map((d, i) => (i === idx ? updated : d));
    return ok({ article: updated });
  }),

  // POST /:id/unpublish — published → unpublished. Admin-only on the real
  // backend (403 FORBIDDEN for editors); the mock is permissive in dev so
  // role-switching during demos doesn't require a fake bearer payload.
  http.post(`${BASE}/articles/:id/unpublish`, ({ params }) => {
    const idx = mockDraftsState.findIndex((d) => d.id === params.id);
    if (idx === -1) return err('NOT_FOUND', 'Article not found', 404);
    const article = mockDraftsState[idx]!;
    if (article.status !== 'published') {
      return err('INVALID_STATE', `Cannot unpublish from ${article.status}`, 422);
    }
    const updated: (typeof mockDrafts)[number] = {
      ...article,
      status: 'unpublished',
      version: article.version + 1,
      updatedAt: new Date().toISOString(),
    };
    mockDraftsState = mockDraftsState.map((d, i) => (i === idx ? updated : d));
    return ok({ article: updated });
  }),

  // PATCH /:id/placement — editorial-surface flags + priority for published
  // articles. Optimistic concurrency on `version` mirrors the draft PATCH
  // handler so VERSION_CONFLICT exercises in MSW match the real backend.
  http.patch(`${BASE}/articles/:id/placement`, async ({ request, params }) => {
    const body = (await request.json()) as {
      featured?: boolean;
      trending?: boolean;
      trail?: boolean;
      priority?: number;
      version?: number;
    };
    const idx = mockDraftsState.findIndex((d) => d.id === params.id);
    if (idx === -1) return err('NOT_FOUND', 'Article not found', 404);
    const article = mockDraftsState[idx]!;
    if (article.status !== 'published') {
      return err(
        'INVALID_STATE',
        `Placement requires a published article (was ${article.status})`,
        422,
      );
    }
    if (typeof body.version !== 'number' || body.version !== article.version) {
      return err('VERSION_CONFLICT', 'Stale version', 409, {
        currentVersion: article.version,
      });
    }
    const currentPlacement = article.placement ?? {
      featured: false,
      trending: false,
      trail: false,
      priority: 0,
    };
    const updated: (typeof mockDrafts)[number] = {
      ...article,
      placement: {
        featured: body.featured ?? currentPlacement.featured,
        trending: body.trending ?? currentPlacement.trending,
        trail: body.trail ?? currentPlacement.trail,
        priority: body.priority ?? currentPlacement.priority,
      },
      version: article.version + 1,
      updatedAt: new Date().toISOString(),
    };
    mockDraftsState = mockDraftsState.map((d, i) => (i === idx ? updated : d));
    return ok({ article: updated });
  }),

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
      ? mockArticleSummaries.filter((a) => a.title.toLowerCase().includes(q.toLowerCase()))
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

  // ── Media (Subphase 3) ────────────────────────────────────────────────
  // The three-step S3 flow: presign → PUT to S3 → register. In mock mode we
  // pretend the presign points at a localhost MinIO endpoint and intercept
  // the bare PUT below so the FE flow runs end-to-end without an S3.
  http.post(`${BASE}/media/upload-url`, async ({ request }) => {
    const { mimeType, size, purpose } = (await request.json()) as {
      mimeType: string;
      size: number;
      purpose: string;
    };
    void size;
    const ext = (mimeType.split('/').pop() ?? 'bin').replace('+xml', '');
    const key = `uploads/${purpose}/${Math.random().toString(36).slice(2, 10)}.${ext}`;
    return ok({
      uploadUrl: `http://localhost:9000/${key}`,
      key,
      expiresIn: 300,
    });
  }),
  http.post(`${BASE}/media/register`, async ({ request }) => {
    const body = (await request.json()) as {
      key: string;
      mimeType: string;
      size: number;
      purpose: string;
      dimensions?: { width: number; height: number };
    };
    const now = new Date().toISOString();
    const media = {
      id: `med_${Math.random().toString(36).slice(2, 10)}`,
      key: body.key,
      url: `http://localhost:9000/${body.key}`,
      mimeType: body.mimeType,
      size: body.size,
      purpose: body.purpose,
      dimensions: body.dimensions ?? null,
      uploadedBy: 'usr_demo_001',
      refCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    return HttpResponse.json({ success: true, data: { media } }, { status: 201 });
  }),
  // Mock S3 — accept any bytes at the presigned URL above and return 200.
  http.put('http://localhost:9000/uploads/*', () => new HttpResponse(null, { status: 200 })),
  // Legacy Subphase 1 stub kept for any old caller; superseded by the trio above.
  http.post(`${BASE}/media`, () => err('UNAUTHORIZED', 'Sign in to upload', 401)),

  // ── AI proxy ───────────────────────────────────────────────────────────
  http.post(`${BASE}/ai/summarize`, () =>
    ok({ summary: 'Mock AI summary (real AI service wires in Subphase 5).' }),
  ),
  http.post(`${BASE}/ai/tags`, () => ok({ tags: ['mock', 'placeholder'] })),
];
