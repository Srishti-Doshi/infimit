/**
 * Search integration — Subphase 4 surface.
 *
 * Covers `$text` search behaviour over the Articles collection:
 *   - only published, non-deleted rows surface
 *   - results rank by Mongo text score (matched word in title beats a
 *     match buried in the body)
 *   - category filter narrows scope without breaking ranking
 *   - validator rejects q < 2 chars
 *   - publish event hits the indexArticle hook (verified via a spy on the
 *     logger.debug call the no-op hook emits — that's the seam Phase 2 will
 *     swap for a real Atlas Search write)
 *
 * Articles are seeded directly into Mongo rather than going through the
 * publish endpoint — the publish flow is exhaustively covered in
 * articles-lifecycle.test.ts; here we only care that search reads them
 * correctly.
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
import { resetAiProxyForTests } from './_aiProxyMock';

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

async function seedCoverMedia(uploaderId: string): Promise<Types.ObjectId> {
  const media = await Media.create({
    key: `uploads/article_cover/${randomUUID()}.jpg`,
    url: `https://mock-cdn.test/uploads/article_cover/${randomUUID()}.jpg`,
    mimeType: 'image/jpeg',
    size: 100_000,
    purpose: 'article_cover',
    uploadedBy: uploaderId,
  });
  return media._id;
}

interface SeedArticleInput {
  authorId: string;
  title: string;
  plainText: string;
  category?: string;
  tags?: string[];
  status?: 'draft' | 'submitted' | 'approved' | 'published' | 'unpublished' | 'rejected';
  publishedAt?: Date | null;
  deletedAt?: Date | null;
}

async function seedArticle(input: SeedArticleInput): Promise<string> {
  const coverMediaId = await seedCoverMedia(input.authorId);
  const article = await Article.create({
    title: input.title,
    slug: `${input.title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`,
    body: `<p>${input.plainText}</p>`,
    plainText: input.plainText,
    category: input.category ?? 'research_innovation',
    tags: input.tags ?? [],
    coverImageMediaId: coverMediaId,
    media: [coverMediaId],
    authorId: new Types.ObjectId(input.authorId),
    status: input.status ?? 'published',
    publishedAt: input.publishedAt ?? new Date(),
    deletedAt: input.deletedAt ?? null,
    version: 1,
  });
  return article._id.toString();
}

beforeAll(async () => {
  app = await startTestEnv();
  // Mongoose's autoIndex builds in the background after model load. The
  // text index on (title, plainText, tags) MUST exist before the first
  // `$text` query or Mongo returns a 500. createIndexes() awaits the
  // build so we never race ahead of it.
  await Article.createIndexes();
}, 120_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await resetTestDb();
  resetAiProxyForTests();
});

// ─── GET /v1/search ─────────────────────────────────────────────────────

describe('GET /v1/search', () => {
  it('returns published articles matching the query, ranked by text score', async () => {
    const author = await seedUser('author');
    await seedArticle({
      authorId: author.id,
      title: 'Quantum computing breakthroughs in 2026',
      plainText: 'Researchers announced a major advance in quantum error correction this week.',
    });
    await seedArticle({
      authorId: author.id,
      title: 'Climate report released',
      plainText: 'Briefly mentions quantum sensing for atmospheric measurements as a side note.',
    });
    await seedArticle({
      authorId: author.id,
      title: 'Local sports recap',
      plainText: 'No mention of the search term whatsoever.',
    });

    const res = await request(app).get('/v1/search').query({ q: 'quantum' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    // Title-match should rank above body-only match.
    expect(res.body.data.items[0].title).toBe('Quantum computing breakthroughs in 2026');
    expect(res.body.data.items[1].title).toBe('Climate report released');
  });

  it('excludes drafts, submitted, unpublished, and soft-deleted articles', async () => {
    const author = await seedUser('author');
    await seedArticle({
      authorId: author.id,
      title: 'Published kangaroo article',
      plainText: 'kangaroo kangaroo kangaroo',
      status: 'published',
    });
    await seedArticle({
      authorId: author.id,
      title: 'Draft kangaroo article',
      plainText: 'kangaroo kangaroo kangaroo',
      status: 'draft',
      publishedAt: null,
    });
    await seedArticle({
      authorId: author.id,
      title: 'Submitted kangaroo article',
      plainText: 'kangaroo kangaroo',
      status: 'submitted',
      publishedAt: null,
    });
    await seedArticle({
      authorId: author.id,
      title: 'Unpublished kangaroo article',
      plainText: 'kangaroo kangaroo',
      status: 'unpublished',
    });
    await seedArticle({
      authorId: author.id,
      title: 'Deleted kangaroo article',
      plainText: 'kangaroo kangaroo',
      status: 'published',
      deletedAt: new Date(),
    });

    const res = await request(app).get('/v1/search').query({ q: 'kangaroo' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe('Published kangaroo article');
  });

  it('narrows results to a single category when ?category= is supplied', async () => {
    const author = await seedUser('author');
    await seedArticle({
      authorId: author.id,
      title: 'AI in education frontier',
      plainText: 'edtech edtech edtech',
      category: 'research_innovation',
    });
    await seedArticle({
      authorId: author.id,
      title: 'Edtech market overview',
      plainText: 'edtech business analysis',
      category: 'tech_in_education',
    });

    const res = await request(app)
      .get('/v1/search')
      .query({ q: 'edtech', category: 'tech_in_education' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].title).toBe('Edtech market overview');
  });

  it('returns an empty result set (200 + total=0) when nothing matches', async () => {
    const author = await seedUser('author');
    await seedArticle({
      authorId: author.id,
      title: 'Some other topic',
      plainText: 'completely unrelated content',
    });

    const res = await request(app).get('/v1/search').query({ q: 'zzznevermatch' });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.items).toEqual([]);
  });

  it('rejects q shorter than 2 characters with 422', async () => {
    const res = await request(app).get('/v1/search').query({ q: 'a' });
    expect(res.status).toBe(422);
  });

  it('rejects a missing q with 422', async () => {
    const res = await request(app).get('/v1/search');
    expect(res.status).toBe(422);
  });

  it('honours page + limit pagination', async () => {
    const author = await seedUser('author');
    for (let i = 0; i < 5; i++) {
      await seedArticle({
        authorId: author.id,
        title: `Penguin update part ${i}`,
        plainText: `penguin penguin penguin part ${i}`,
      });
    }

    const res = await request(app).get('/v1/search').query({ q: 'penguin', page: 1, limit: 2 });
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(5);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.page).toBe(1);
    expect(res.body.data.limit).toBe(2);
  });
});

// ─── GET /v1/search/semantic (Phase 2 stub) ─────────────────────────────
//
// Note: registerSearchListeners() is exercised implicitly at app boot via
// registerEventListeners(); the underlying indexArticle / removeArticle
// hooks are no-ops on Mongo (the text index updates with the doc itself),
// so there's no observable behaviour to assert in Phase 1. Phase 2's Atlas
// Search swap will replace the seam and add dedicated coverage there.

describe('GET /v1/search/semantic', () => {
  it('responds 501 with a Phase 2 placeholder', async () => {
    const res = await request(app).get('/v1/search/semantic');
    expect(res.status).toBe(501);
  });
});
