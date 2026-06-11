/**
 * Bookmarks integration (Sub-PR 5-b) — covers:
 *   - POST /v1/bookmarks/:articleId idempotency (two POSTs = same row, single
 *     counter bump)
 *   - POST on draft / unpublished / non-existent article → 404
 *   - DELETE removes + decrements; second DELETE is a 204 no-op (no double-
 *     decrement)
 *   - GET returns my paginated bookmarks newest-first, with embedded
 *     FeedCardView; unpublished article renders `article: null` per A10
 *   - Auth required on all three (401 without Bearer)
 *   - Scope is `req.user.id` — one user can't see another's bookmarks
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { Types } from 'mongoose';

import { Article } from '@/modules/articles';
import { Bookmark } from '@/modules/bookmarks';
import { User, type UserRole } from '@/modules/users';
import { hashPassword, signAccessToken } from '@/shared/crypto';

import { resetTestDb, startTestEnv, stopTestEnv } from './_setup';

let app: Express;

interface SeededUser {
  id: string;
  token: string;
  role: UserRole;
}

async function seedUser(role: UserRole = 'reader'): Promise<SeededUser> {
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
  return { id: user._id.toString(), token, role };
}

async function seedArticle(
  authorId: string,
  status: 'draft' | 'published' = 'published',
  slug = `article-${randomUUID().slice(0, 6)}`,
): Promise<string> {
  const doc = await Article.create({
    title: slug,
    slug,
    subtitle: '',
    body: '<p>body</p>',
    plainText: 'body',
    category: 'research_innovation',
    tags: ['ai'],
    authorId: new Types.ObjectId(authorId),
    status,
    publishedAt: status === 'published' ? new Date() : null,
    version: 0,
  });
  return doc._id.toString();
}

async function getStatsBookmarks(articleId: string): Promise<number> {
  const fresh = await Article.findById(articleId).exec();
  return fresh?.stats.bookmarks ?? 0;
}

beforeAll(async () => {
  app = await startTestEnv();
}, 120_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await resetTestDb();
});

// ─── POST /v1/bookmarks/:articleId ──────────────────────────────────────

describe('POST /v1/bookmarks/:articleId', () => {
  it('adds a bookmark, returns 200 with embedded card, bumps stats.bookmarks', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedArticle(author.id, 'published', 'add-success');

    const res = await request(app)
      .post(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.data.bookmark.articleId).toBe(articleId);
    expect(res.body.data.bookmark.article).toMatchObject({
      id: articleId,
      slug: 'add-success',
    });
    expect(await getStatsBookmarks(articleId)).toBe(1);
  });

  it('is idempotent: two POSTs return the same id and increment the counter ONCE', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedArticle(author.id, 'published');

    const a = await request(app)
      .post(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});
    const b = await request(app)
      .post(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(b.body.data.bookmark.id).toBe(a.body.data.bookmark.id);
    // Counter was bumped exactly once, despite the duplicate POST.
    expect(await getStatsBookmarks(articleId)).toBe(1);
    expect(await Bookmark.countDocuments({})).toBe(1);
  });

  it('rejects bookmarking a draft article with 404', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedArticle(author.id, 'draft');

    const res = await request(app)
      .post(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});

    expect(res.status).toBe(404);
    expect(await Bookmark.countDocuments({})).toBe(0);
    expect(await getStatsBookmarks(articleId)).toBe(0);
  });

  it('rejects bookmarking a non-existent article with 404', async () => {
    const reader = await seedUser('reader');
    const ghost = new Types.ObjectId().toString();

    const res = await request(app)
      .post(`/v1/bookmarks/${ghost}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post(`/v1/bookmarks/${new Types.ObjectId()}`).send({});
    expect(res.status).toBe(401);
  });
});

// ─── DELETE /v1/bookmarks/:articleId ────────────────────────────────────

describe('DELETE /v1/bookmarks/:articleId', () => {
  it('removes an existing bookmark, returns 204, decrements stats.bookmarks', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedArticle(author.id, 'published');

    await request(app)
      .post(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});
    expect(await getStatsBookmarks(articleId)).toBe(1);

    const res = await request(app)
      .delete(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`);

    expect(res.status).toBe(204);
    expect(await Bookmark.countDocuments({})).toBe(0);
    expect(await getStatsBookmarks(articleId)).toBe(0);
  });

  it('is idempotent: deleting a non-existent bookmark is a 204 no-op (no counter change)', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedArticle(author.id, 'published');

    // No POST first — the bookmark doesn't exist.
    const res = await request(app)
      .delete(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`);

    expect(res.status).toBe(204);
    expect(await getStatsBookmarks(articleId)).toBe(0);
  });

  it('two DELETEs in a row only decrement the counter once', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedArticle(author.id, 'published');

    await request(app)
      .post(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});
    await request(app)
      .delete(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`);
    await request(app)
      .delete(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`);

    // Counter is 0 (started at 0, +1 from POST, -1 from first DELETE,
    // second DELETE is a no-op). Importantly NOT -1.
    expect(await getStatsBookmarks(articleId)).toBe(0);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).delete(`/v1/bookmarks/${new Types.ObjectId()}`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /v1/bookmarks ──────────────────────────────────────────────────

describe('GET /v1/bookmarks', () => {
  it('returns MY bookmarks newest-first with embedded FeedCardView', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const idA = await seedArticle(author.id, 'published', 'a-article');
    const idB = await seedArticle(author.id, 'published', 'b-article');

    await request(app)
      .post(`/v1/bookmarks/${idA}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});
    // Force B's createdAt to be later than A's so the sort order is stable.
    await new Promise((r) => setTimeout(r, 10));
    await request(app)
      .post(`/v1/bookmarks/${idB}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});

    const res = await request(app)
      .get('/v1/bookmarks')
      .set('Authorization', `Bearer ${reader.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items[0].articleId).toBe(idB);
    expect(res.body.data.items[1].articleId).toBe(idA);
    // Embedded card is the compact FeedCardView shape.
    expect(res.body.data.items[0].article).toMatchObject({
      id: idB,
      slug: 'b-article',
      author: { id: author.id, name: 'author user' },
    });
    expect(res.body.data.items[0].article.body).toBeUndefined();
  });

  it('renders `article: null` for a bookmarked-then-unpublished article (A10)', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedArticle(author.id, 'published');

    await request(app)
      .post(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});

    // Move the article off-published — simulates editor unpublishing
    // between when the reader saved and when they revisit.
    await Article.updateOne({ _id: articleId }, { $set: { status: 'unpublished' } });

    const res = await request(app)
      .get('/v1/bookmarks')
      .set('Authorization', `Bearer ${reader.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].articleId).toBe(articleId);
    expect(res.body.data.items[0].article).toBeNull();
  });

  it('scopes to the calling user — one reader cannot see another reader bookmarks', async () => {
    const alice = await seedUser('reader');
    const bob = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedArticle(author.id, 'published');

    await request(app)
      .post(`/v1/bookmarks/${articleId}`)
      .set('Authorization', `Bearer ${alice.token}`)
      .send({});

    const bobRes = await request(app)
      .get('/v1/bookmarks')
      .set('Authorization', `Bearer ${bob.token}`);

    expect(bobRes.status).toBe(200);
    expect(bobRes.body.data.total).toBe(0);
    expect(bobRes.body.data.items).toEqual([]);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/v1/bookmarks');
    expect(res.status).toBe(401);
  });
});
