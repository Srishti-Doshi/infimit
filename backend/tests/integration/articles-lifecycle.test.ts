/**
 * Articles lifecycle integration — Subphase 4 surface.
 *
 * Covers approve / reject / publish / unpublish / placement / regenerate-AI
 * and the public slug-cache read. The AI proxy is mocked at the module
 * boundary (see ./_aiProxyMock); the cache uses the in-memory redis mock
 * already used by other integration suites.
 *
 * Tests assert on the state machine + RBAC + cache-invalidation behaviour.
 * The AI proxy's own resilience (opossum + retry + fallback) is unit-tested
 * separately under tests/modules/ai-proxy/.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));
jest.mock('@/modules/ai-proxy', () => require('./_aiProxyMock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { Types } from 'mongoose';

import { Article } from '@/modules/articles';
import { Media } from '@/modules/media';
import { User, type UserRole } from '@/modules/users';
import { hashPassword, signAccessToken } from '@/shared/crypto';

import { resetTestDb, startTestEnv, stopTestEnv } from './_setup';
import { __setNextAiResponse, resetAiProxyForTests } from './_aiProxyMock';

let app: Express;

interface SeededUser {
  id: string;
  email: string;
  token: string;
  role: UserRole;
}

async function seedUser(role: UserRole): Promise<SeededUser> {
  const email = `${role}-${randomUUID().slice(0, 6)}@test.dev`;
  const user = await User.create({
    email,
    name: `${role} user`,
    passwordHash: await hashPassword('Pa55word!!'),
    role,
    isEmailVerified: true,
    isActive: true,
  });
  const token = signAccessToken({
    sub: user._id.toString(),
    email,
    role,
    organisationId: null,
    jti: randomUUID(),
  });
  return { id: user._id.toString(), email, token, role };
}

async function seedCoverMedia(uploaderId: string): Promise<string> {
  const media = await Media.create({
    key: `uploads/article_cover/${randomUUID()}.jpg`,
    url: `https://mock-cdn.test/uploads/article_cover/${randomUUID()}.jpg`,
    mimeType: 'image/jpeg',
    size: 100_000,
    purpose: 'article_cover',
    uploadedBy: uploaderId,
  });
  return media._id.toString();
}

/**
 * Helper: walk an article from creation → submitted, so lifecycle tests
 * can start from "submitted". Returns the article ID + version.
 */
async function seedSubmittedArticle(authorId: string): Promise<{
  id: string;
  version: number;
  slug: string;
}> {
  const coverMediaId = new Types.ObjectId(await seedCoverMedia(authorId));
  const article = await Article.create({
    title: `Mock Article ${randomUUID().slice(0, 6)}`,
    slug: `mock-article-${randomUUID().slice(0, 8)}`,
    body: '<p>Mock body.</p>',
    plainText:
      'Mock body content that is intentionally long enough to satisfy any submit validation rule downstream — about a paragraph or so of text, padded out to be well over three hundred plain-text characters which the doc requires as the floor for the submit transition. This sentence keeps going to make sure we cross that threshold confidently and gives the AI proxy something realistic to chew on when the test exercises the approve flow.',
    category: 'research_innovation',
    tags: ['ai', 'education'],
    coverImageMediaId: coverMediaId,
    media: [coverMediaId],
    authorId: new Types.ObjectId(authorId),
    status: 'submitted',
    submittedAt: new Date(),
    version: 1,
  });
  return { id: article._id.toString(), version: article.version, slug: article.slug };
}

async function seedApprovedArticle(authorId: string): Promise<{
  id: string;
  version: number;
  slug: string;
}> {
  const seeded = await seedSubmittedArticle(authorId);
  await Article.updateOne(
    { _id: seeded.id },
    { $set: { status: 'approved', approvedAt: new Date() }, $inc: { version: 1 } },
  );
  return { ...seeded, version: seeded.version + 1 };
}

async function seedPublishedArticle(authorId: string): Promise<{
  id: string;
  version: number;
  slug: string;
}> {
  const seeded = await seedApprovedArticle(authorId);
  await Article.updateOne(
    { _id: seeded.id },
    { $set: { status: 'published', publishedAt: new Date() }, $inc: { version: 1 } },
  );
  return { ...seeded, version: seeded.version + 1 };
}

async function seedUnpublishedArticle(authorId: string): Promise<{
  id: string;
  version: number;
  slug: string;
}> {
  const seeded = await seedPublishedArticle(authorId);
  await Article.updateOne(
    { _id: seeded.id },
    { $set: { status: 'unpublished' }, $inc: { version: 1 } },
  );
  return { ...seeded, version: seeded.version + 1 };
}

/** Tiny helper to let setImmediate-scheduled AI pipelines complete. */
async function flushSetImmediate(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

beforeAll(async () => {
  app = await startTestEnv();
}, 120_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await resetTestDb();
  resetAiProxyForTests();
});

// ─── POST /v1/articles/:id/approve ──────────────────────────────────────

describe('POST /v1/articles/:id/approve', () => {
  it('editor approves a submitted article → status=approved, AI pipeline fires', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedSubmittedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/approve`)
      .set('Authorization', `Bearer ${editor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.article.status).toBe('approved');
    expect(res.body.data.article.approvedAt).toBeTruthy();
    expect(res.body.data.article.editorId).toBe(editor.id);

    // Wait for the setImmediate-scheduled AI pipeline to complete, then verify
    // the AI fields landed via setAiFields (a separate Mongo write).
    await flushSetImmediate();
    const refetched = await Article.findById(id);
    expect(refetched?.ai.summary).toBe('A concise mock summary of the article body.');
    expect(refetched?.ai.degraded).toBe(false);
    expect(refetched?.ai.model).toBe('mock-llama-3');
    expect(refetched?.ai.readingTimeMin).toBeGreaterThan(0);
  });

  it('admin can also approve (RBAC ✍️📝👑 maps to editor+admin)', async () => {
    const author = await seedUser('author');
    const admin = await seedUser('admin');
    const { id } = await seedSubmittedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
  });

  it('forbids authors from approving (their own or anyone else)', async () => {
    const author = await seedUser('author');
    const { id } = await seedSubmittedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/approve`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(403);
  });

  it('forbids editor from approving their own submission (#32 fix-PR — COI guard)', async () => {
    // Now that editor can submit (issue #32), the COI safeguard lives here:
    // an editor (or admin) cannot approve an article they authored. Approval
    // by ANOTHER editor/admin still works (covered by the happy-path test).
    const editor = await seedUser('editor');
    const { id } = await seedSubmittedArticle(editor.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/approve`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids admin from approving their own submission (COI guard applies to admins too)', async () => {
    const admin = await seedUser('admin');
    const { id } = await seedSubmittedArticle(admin.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/approve`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('refuses to approve a non-submitted article (INVALID_STATE)', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedApprovedArticle(author.id); // already approved

    const res = await request(app)
      .post(`/v1/articles/${id}/approve`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('writes ai.degraded=true when the AI proxy returns a circuit-open fallback', async () => {
    __setNextAiResponse({ summary: '', degraded: true, model: 'circuit-open' });
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedSubmittedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/approve`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(200); // approval is NOT blocked by AI outage
    expect(res.body.data.article.status).toBe('approved');

    await flushSetImmediate();
    const refetched = await Article.findById(id);
    expect(refetched?.ai.degraded).toBe(true);
    expect(refetched?.ai.model).toBe('circuit-open');
    expect(refetched?.ai.summary).toBe(''); // empty when degraded
  });
});

// ─── POST /v1/articles/:id/reject ───────────────────────────────────────

describe('POST /v1/articles/:id/reject', () => {
  const VALID_REASON = 'Body needs more sourcing — please cite at least two primary references.';

  it('editor rejects a submitted article with a reason', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedSubmittedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/reject`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ rejectionReason: VALID_REASON });

    expect(res.status).toBe(200);
    expect(res.body.data.article.status).toBe('rejected');
    expect(res.body.data.article.rejectionReason).toBe(VALID_REASON);
    expect(res.body.data.article.editorId).toBe(editor.id);
  });

  it('rejects a too-short reason with 422', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedSubmittedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/reject`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ rejectionReason: 'no' });
    expect(res.status).toBe(422);
  });

  it('forbids authors from rejecting', async () => {
    const author = await seedUser('author');
    const { id } = await seedSubmittedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/reject`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ rejectionReason: VALID_REASON });
    expect(res.status).toBe(403);
  });
});

// ─── POST /v1/articles/:id/publish ──────────────────────────────────────

describe('POST /v1/articles/:id/publish', () => {
  it('editor publishes an approved article → status=published, publishedAt set', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedApprovedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/publish`)
      .set('Authorization', `Bearer ${editor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.article.status).toBe('published');
    expect(res.body.data.article.publishedAt).toBeTruthy();
  });

  it('refuses to publish a non-approved article (e.g. still submitted)', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedSubmittedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/publish`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });

  it('forbids authors from publishing', async () => {
    const author = await seedUser('author');
    const { id } = await seedApprovedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/publish`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(403);
  });

  it('editor re-publishes an unpublished article → status=published, publishedAt freshened', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedUnpublishedArticle(author.id);

    const before = Date.now();
    const res = await request(app)
      .post(`/v1/articles/${id}/publish`)
      .set('Authorization', `Bearer ${editor.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.article.status).toBe('published');
    expect(new Date(res.body.data.article.publishedAt).getTime()).toBeGreaterThanOrEqual(before);
  });
});

// ─── POST /v1/articles/:id/unpublish ────────────────────────────────────

describe('POST /v1/articles/:id/unpublish', () => {
  it('admin unpublishes a published article', async () => {
    const author = await seedUser('author');
    const admin = await seedUser('admin');
    const { id } = await seedPublishedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/unpublish`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.article.status).toBe('unpublished');
  });

  it('forbids editors from unpublishing (admin-only blast radius)', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedPublishedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/unpublish`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(403);
  });

  it('refuses to unpublish a non-published article', async () => {
    const author = await seedUser('author');
    const admin = await seedUser('admin');
    const { id } = await seedApprovedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/unpublish`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(409);
  });
});

// ─── PATCH /v1/articles/:id/placement ───────────────────────────────────

describe('PATCH /v1/articles/:id/placement', () => {
  it('editor sets placement on a published article', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id, version } = await seedPublishedArticle(author.id);

    const res = await request(app)
      .patch(`/v1/articles/${id}/placement`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ featured: true, trending: true, priority: 80, version });

    expect(res.status).toBe(200);
    expect(res.body.data.article.placement.featured).toBe(true);
    expect(res.body.data.article.placement.trending).toBe(true);
    expect(res.body.data.article.placement.priority).toBe(80);
    expect(res.body.data.article.version).toBe(version + 1);
  });

  it('returns 409 VERSION_CONFLICT on a stale version', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id, version } = await seedPublishedArticle(author.id);

    await request(app)
      .patch(`/v1/articles/${id}/placement`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ featured: true, version });

    const stale = await request(app)
      .patch(`/v1/articles/${id}/placement`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ trending: true, version }); // same stale version
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
  });

  it('refuses placement on a non-published article (INVALID_STATE)', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id, version } = await seedApprovedArticle(author.id); // approved, not published

    const res = await request(app)
      .patch(`/v1/articles/${id}/placement`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ featured: true, version });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});

// ─── POST /v1/articles/:id/ai/summary ───────────────────────────────────

describe('POST /v1/articles/:id/ai/summary (regenerate)', () => {
  it('author can regenerate their own published article', async () => {
    const author = await seedUser('author');
    const { id } = await seedPublishedArticle(author.id);

    __setNextAiResponse({ summary: 'Regenerated summary text.' });
    const res = await request(app)
      .post(`/v1/articles/${id}/ai/summary`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ force: true });

    expect(res.status).toBe(200);
    expect(res.body.data.article.ai.summary).toBe('Regenerated summary text.');
  });

  it("editor can regenerate another author's article", async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const { id } = await seedPublishedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/ai/summary`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ force: true });
    expect(res.status).toBe(200);
  });

  it('forbids another author from regenerating', async () => {
    const author = await seedUser('author');
    const stranger = await seedUser('author');
    const { id } = await seedPublishedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${id}/ai/summary`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ force: true });
    expect(res.status).toBe(403);
  });

  it('refuses on a draft article (INVALID_STATE — needs approved/published)', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const draft = await Article.create({
      title: 'Draft',
      slug: `draft-${randomUUID().slice(0, 8)}`,
      body: '<p>x</p>',
      plainText: 'x'.repeat(400),
      category: 'campus_news',
      tags: ['a'],
      coverImageMediaId: new Types.ObjectId(cover),
      authorId: new Types.ObjectId(author.id),
      status: 'draft',
      version: 0,
    });

    const res = await request(app)
      .post(`/v1/articles/${draft._id.toString()}/ai/summary`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ force: true });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('INVALID_STATE');
  });
});

// ─── GET /v1/articles/slug/:slug (public, cached) ───────────────────────

describe('GET /v1/articles/slug/:slug', () => {
  it('returns a published article without auth, with author populated', async () => {
    const author = await seedUser('author');
    const { slug } = await seedPublishedArticle(author.id);

    const res = await request(app).get(`/v1/articles/slug/${slug}`);
    expect(res.status).toBe(200);
    expect(res.body.data.article.slug).toBe(slug);
    expect(res.body.data.article.status).toBe('published');
    expect(res.body.data.article.author).toEqual({ id: author.id, name: 'author user' });
  });

  it('returns 404 for an unpublished article (even if it exists)', async () => {
    const author = await seedUser('author');
    const { slug } = await seedApprovedArticle(author.id); // approved, not published

    const res = await request(app).get(`/v1/articles/slug/${slug}`);
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await request(app).get('/v1/articles/slug/never-existed');
    expect(res.status).toBe(404);
  });

  it('serves the same article from cache on the second call', async () => {
    const author = await seedUser('author');
    const { slug, id } = await seedPublishedArticle(author.id);

    const first = await request(app).get(`/v1/articles/slug/${slug}`);
    expect(first.status).toBe(200);

    // Soft-delete the article via direct DB write. If the cache wasn't
    // active, the next GET would 404. With the cache, the previously-loaded
    // article should still be served until the TTL expires or someone
    // invalidates.
    await Article.updateOne({ _id: id }, { $set: { deletedAt: new Date() } });

    const second = await request(app).get(`/v1/articles/slug/${slug}`);
    expect(second.status).toBe(200);
    expect(second.body.data.article.slug).toBe(slug);
  });
});
