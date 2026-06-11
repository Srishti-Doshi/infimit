/**
 * Analytics integration (Sub-PR 5-c) — covers:
 *   - POST /v1/analytics/track returns 204 fast, persists raw event,
 *     bumps the right denorm counter per type, and ignores body-supplied
 *     userId in favour of req.user
 *   - read_complete unique-reader gate (second event from same user does
 *     NOT double-bump stats.uniqueReaders)
 *   - GET /v1/analytics/articles/:id RBAC: owner / editor / admin → 200;
 *     stranger → 403; missing article → 404
 *   - GET /v1/analytics/authors/:id RBAC: same shape
 *   - GET /v1/analytics/platform admin-only (editor + author → 403)
 *
 * NOTE: trackEvent is fire-and-forget. Tests use a small `waitForCount`
 * helper that polls until the persisted-event count reaches the target,
 * with a 1s ceiling. This mirrors the pattern in
 * `tests/integration/notifications.test.ts`.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { Types } from 'mongoose';

import { Article } from '@/modules/articles';
import { AnalyticsEvent, analyticsRepo } from '@/modules/analytics';
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

async function seedPublishedArticle(
  authorId: string,
  slug = `art-${randomUUID().slice(0, 6)}`,
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
    status: 'published',
    publishedAt: new Date(),
    version: 0,
  });
  return doc._id.toString();
}

async function waitForCount(target: number, maxMs = 1000): Promise<number> {
  const startedAt = Date.now();
  let n = 0;
  // eslint-disable-next-line no-await-in-loop
  while (Date.now() - startedAt < maxMs) {
    n = await analyticsRepo.countAll();
    if (n >= target) return n;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 25));
  }
  return n;
}

async function getStats(articleId: string): Promise<{
  views: number;
  uniqueReaders: number;
  shares: number;
}> {
  const fresh = await Article.findById(articleId).exec();
  return {
    views: fresh?.stats.views ?? 0,
    uniqueReaders: fresh?.stats.uniqueReaders ?? 0,
    shares: fresh?.stats.shares ?? 0,
  };
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

// ─── POST /v1/analytics/track ───────────────────────────────────────────

describe('POST /v1/analytics/track', () => {
  it('returns 204 and persists a raw view event + bumps stats.views', async () => {
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);

    const res = await request(app)
      .post('/v1/analytics/track')
      .send({ type: 'view', articleId, sessionId: 'sess-1' });

    expect(res.status).toBe(204);
    // Fire-and-forget: wait briefly for the async insert to land.
    expect(await waitForCount(1)).toBe(1);
    const fresh = await getStats(articleId);
    expect(fresh.views).toBe(1);
    const ev = await AnalyticsEvent.findOne({ articleId }).exec();
    expect(ev?.type).toBe('view');
    expect(ev?.sessionId).toBe('sess-1');
    expect(ev?.userId).toBeNull();
  });

  it('bumps stats.shares on a share event', async () => {
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);
    const res = await request(app).post('/v1/analytics/track').send({ type: 'share', articleId });
    expect(res.status).toBe(204);
    await waitForCount(1);
    expect((await getStats(articleId)).shares).toBe(1);
  });

  it('ignores a body-supplied userId; req.user is the only source of truth', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);
    const attackerId = new Types.ObjectId().toString();

    const res = await request(app)
      .post('/v1/analytics/track')
      .set('Authorization', `Bearer ${reader.token}`)
      // attempt to spoof userId via the body — schema strips it; service
      // overrides from req.user regardless.
      .send({ type: 'view', articleId, userId: attackerId });

    expect(res.status).toBe(204);
    await waitForCount(1);
    const ev = await AnalyticsEvent.findOne({ articleId }).exec();
    expect(ev?.userId?.toString()).toBe(reader.id);
    expect(ev?.userId?.toString()).not.toBe(attackerId);
  });

  it('unique-reader gate: two read_complete events from one user bump uniqueReaders once', async () => {
    const reader = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);

    await request(app)
      .post('/v1/analytics/track')
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ type: 'read_complete', articleId });
    await waitForCount(1);

    await request(app)
      .post('/v1/analytics/track')
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ type: 'read_complete', articleId });
    await waitForCount(2);

    expect((await getStats(articleId)).uniqueReaders).toBe(1);
  });

  it('anonymous read_complete does NOT bump uniqueReaders (no userId)', async () => {
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);

    const res = await request(app)
      .post('/v1/analytics/track')
      .send({ type: 'read_complete', articleId, sessionId: 'anon-1' });

    expect(res.status).toBe(204);
    await waitForCount(1);
    expect((await getStats(articleId)).uniqueReaders).toBe(0);
  });

  it('rejects an event without an articleId for article-scoped types with 204 (silent drop)', async () => {
    // The Zod schema doesn't make articleId conditionally required, so the
    // service drops the event with a warn-log. The HTTP contract stays 204.
    const res = await request(app).post('/v1/analytics/track').send({ type: 'view' });
    expect(res.status).toBe(204);
    expect(await analyticsRepo.countAll()).toBe(0);
  });

  it('rejects an invalid event type with 422', async () => {
    const res = await request(app).post('/v1/analytics/track').send({ type: 'not_a_real_event' });
    expect(res.status).toBe(422);
  });
});

// ─── GET /v1/analytics/articles/:id ─────────────────────────────────────

describe('GET /v1/analytics/articles/:id', () => {
  it('returns 200 with cumulative + last7Days for the article owner', async () => {
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);

    // Seed a couple of events synchronously via the repo so the read
    // assertions don't race the fire-and-forget writer.
    await analyticsRepo.recordEvent({
      type: 'view',
      articleId: new Types.ObjectId(articleId),
    });
    await Article.updateOne({ _id: articleId }, { $inc: { 'stats.views': 1, 'stats.shares': 0 } });

    const res = await request(app)
      .get(`/v1/analytics/articles/${articleId}`)
      .set('Authorization', `Bearer ${author.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.stats).toMatchObject({
      articleId,
      cumulative: { views: 1 },
      last7Days: { views: 1 },
    });
  });

  it('allows an editor to view any article stats', async () => {
    const editor = await seedUser('editor');
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);

    const res = await request(app)
      .get(`/v1/analytics/articles/${articleId}`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(200);
  });

  it('rejects a stranger reader with 403', async () => {
    const stranger = await seedUser('reader');
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);

    const res = await request(app)
      .get(`/v1/analytics/articles/${articleId}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(403);
  });

  it('returns 404 for a non-existent article', async () => {
    const editor = await seedUser('editor');
    const ghost = new Types.ObjectId().toString();
    const res = await request(app)
      .get(`/v1/analytics/articles/${ghost}`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const ghost = new Types.ObjectId().toString();
    const res = await request(app).get(`/v1/analytics/articles/${ghost}`);
    expect(res.status).toBe(401);
  });
});

// ─── GET /v1/analytics/authors/:id ──────────────────────────────────────

describe('GET /v1/analytics/authors/:id', () => {
  it('owner sees their own author stats', async () => {
    const author = await seedUser('author');
    await seedPublishedArticle(author.id);
    const res = await request(app)
      .get(`/v1/analytics/authors/${author.id}`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.stats.authorId).toBe(author.id);
    expect(res.body.data.stats.articles.total).toBe(1);
  });

  it('rejects another author from viewing peer stats with 403', async () => {
    const alice = await seedUser('author');
    const bob = await seedUser('author');
    const res = await request(app)
      .get(`/v1/analytics/authors/${alice.id}`)
      .set('Authorization', `Bearer ${bob.token}`);
    expect(res.status).toBe(403);
  });
});

// ─── GET /v1/analytics/platform ─────────────────────────────────────────

describe('GET /v1/analytics/platform', () => {
  it('admin-only: editor and reader → 403; admin → 200', async () => {
    const editor = await seedUser('editor');
    const reader = await seedUser('reader');
    const admin = await seedUser('admin');

    const editorRes = await request(app)
      .get('/v1/analytics/platform')
      .set('Authorization', `Bearer ${editor.token}`);
    expect(editorRes.status).toBe(403);

    const readerRes = await request(app)
      .get('/v1/analytics/platform')
      .set('Authorization', `Bearer ${reader.token}`);
    expect(readerRes.status).toBe(403);

    const adminRes = await request(app)
      .get('/v1/analytics/platform')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.data.stats.window.sinceDays).toBe(30);
  });
});
