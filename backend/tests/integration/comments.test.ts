/**
 * Comments integration — Subphase 4 surface.
 *
 * Covers the full comment lifecycle (post → pending → approved/rejected/
 * hidden), the moderation queue, owner/editor delete, and the 10/min/user
 * rate limit with editor-bypass.
 *
 * Article-scoped surface lives under `/v1/articles/:articleId/comments`.
 * Standalone moderation routes live under `/v1/comments/*`.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));
jest.mock('@/modules/ai-proxy', () => require('./_aiProxyMock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { Types } from 'mongoose';

import { Article } from '@/modules/articles';
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

/** Helper: create a PUBLISHED article so comments can be posted on it. */
async function seedPublishedArticle(authorId: string): Promise<string> {
  const article = await Article.create({
    title: `Article ${randomUUID().slice(0, 6)}`,
    slug: `article-${randomUUID().slice(0, 8)}`,
    body: '<p>body</p>',
    plainText:
      'plain text body padded out to meet any future submit validation thresholds. '.repeat(5),
    category: 'campus_news',
    tags: ['news'],
    authorId: new Types.ObjectId(authorId),
    status: 'published',
    publishedAt: new Date(),
    version: 3,
  });
  return article._id.toString();
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

// ─── POST /v1/articles/:articleId/comments ──────────────────────────────

describe('POST /v1/articles/:articleId/comments', () => {
  it('authenticated user posts a comment; status defaults to pending', async () => {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const articleId = await seedPublishedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'Great article!' });

    expect(res.status).toBe(201);
    expect(res.body.data.comment.body).toBe('Great article!');
    expect(res.body.data.comment.status).toBe('pending');
    expect(res.body.data.comment.userId).toBe(reader.id);
  });

  it('rejects an unauthenticated post with 401', async () => {
    const author = await seedUser('author');
    const articleId = await seedPublishedArticle(author.id);

    const res = await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .send({ body: 'Anonymous comment' });
    expect(res.status).toBe(401);
  });

  it('refuses to post on a non-published article (404)', async () => {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const draft = await Article.create({
      title: 'Draft',
      slug: `draft-${randomUUID().slice(0, 8)}`,
      body: '<p>x</p>',
      plainText: 'x'.repeat(400),
      category: 'campus_news',
      tags: ['a'],
      authorId: new Types.ObjectId(author.id),
      status: 'draft',
      version: 0,
    });

    const res = await request(app)
      .post(`/v1/articles/${draft._id.toString()}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'comment on draft' });
    expect(res.status).toBe(404);
  });

  it('rate-limits a reader to 10/min; 11th call returns 429', async () => {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const articleId = await seedPublishedArticle(author.id);

    let lastStatus = 0;
    for (let i = 0; i < 11; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post(`/v1/articles/${articleId}/comments`)
        .set('Authorization', `Bearer ${reader.token}`)
        .send({ body: `comment ${i}` });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  }, 20_000);

  it('editor bypasses the rate limit (more than 10 posts succeed)', async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const articleId = await seedPublishedArticle(author.id);

    let lastStatus = 0;
    for (let i = 0; i < 12; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post(`/v1/articles/${articleId}/comments`)
        .set('Authorization', `Bearer ${editor.token}`)
        .send({ body: `editor comment ${i}` });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(201);
  }, 20_000);
});

// ─── GET /v1/articles/:articleId/comments (public) ──────────────────────

describe('GET /v1/articles/:articleId/comments', () => {
  it('public read returns only approved comments', async () => {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const editor = await seedUser('editor');
    const articleId = await seedPublishedArticle(author.id);

    // Post + approve one comment, leave another pending.
    const a = await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'will be approved' });
    await request(app)
      .post(`/v1/comments/${a.body.data.comment.id}/approve`)
      .set('Authorization', `Bearer ${editor.token}`);

    await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'still pending' });

    // Anonymous read — no auth header.
    const res = await request(app).get(`/v1/articles/${articleId}/comments`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].body).toBe('will be approved');
    expect(res.body.data.items[0].status).toBe('approved');
  });
});

// ─── GET /v1/comments/pending (moderation queue) ────────────────────────

describe('GET /v1/comments/pending', () => {
  it('editor sees the pending queue', async () => {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const editor = await seedUser('editor');
    const articleId = await seedPublishedArticle(author.id);

    await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'pending comment' });

    const res = await request(app)
      .get('/v1/comments/pending')
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].status).toBe('pending');
  });

  it('forbids readers from the moderation queue', async () => {
    const reader = await seedUser('reader');
    const res = await request(app)
      .get('/v1/comments/pending')
      .set('Authorization', `Bearer ${reader.token}`);
    expect(res.status).toBe(403);
  });
});

// ─── moderation actions ─────────────────────────────────────────────────

describe('POST /v1/comments/:id/approve | reject | hide', () => {
  async function postComment(): Promise<{ commentId: string; editorToken: string }> {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const editor = await seedUser('editor');
    const articleId = await seedPublishedArticle(author.id);
    const posted = await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'pending body' });
    return { commentId: posted.body.data.comment.id, editorToken: editor.token };
  }

  it('approve flips status + records moderator', async () => {
    const { commentId, editorToken } = await postComment();
    const res = await request(app)
      .post(`/v1/comments/${commentId}/approve`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.comment.status).toBe('approved');
    expect(res.body.data.comment.moderatedBy).toBeTruthy();
    expect(res.body.data.comment.moderatedAt).toBeTruthy();
  });

  it('reject flips status to rejected', async () => {
    const { commentId, editorToken } = await postComment();
    const res = await request(app)
      .post(`/v1/comments/${commentId}/reject`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.body.data.comment.status).toBe('rejected');
  });

  it('hide flips status to hidden', async () => {
    const { commentId, editorToken } = await postComment();
    const res = await request(app)
      .post(`/v1/comments/${commentId}/hide`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(res.body.data.comment.status).toBe('hidden');
  });

  it('forbids readers from moderating', async () => {
    const { commentId } = await postComment();
    const reader = await seedUser('reader');
    const res = await request(app)
      .post(`/v1/comments/${commentId}/approve`)
      .set('Authorization', `Bearer ${reader.token}`);
    expect(res.status).toBe(403);
  });
});

// ─── DELETE /v1/comments/:id ────────────────────────────────────────────

describe('DELETE /v1/comments/:id', () => {
  it('comment owner can delete their own', async () => {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const articleId = await seedPublishedArticle(author.id);
    const posted = await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'mine to delete' });

    const res = await request(app)
      .delete(`/v1/comments/${posted.body.data.comment.id}`)
      .set('Authorization', `Bearer ${reader.token}`);
    expect(res.status).toBe(204);
  });

  it("forbids another reader from deleting someone else's comment", async () => {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const stranger = await seedUser('reader');
    const articleId = await seedPublishedArticle(author.id);
    const posted = await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'not yours' });

    const res = await request(app)
      .delete(`/v1/comments/${posted.body.data.comment.id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(403);
  });

  it("editor can delete anyone's comment", async () => {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const editor = await seedUser('editor');
    const articleId = await seedPublishedArticle(author.id);
    const posted = await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'moderate-deleted' });

    const res = await request(app)
      .delete(`/v1/comments/${posted.body.data.comment.id}`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(204);
  });
});

// ─── stats.commentsCount denormalisation ────────────────────────────────

describe('stats.commentsCount denormalisation (approved-comment count)', () => {
  async function setup(): Promise<{
    articleId: string;
    commentId: string;
    editorToken: string;
    readerToken: string;
  }> {
    const author = await seedUser('author');
    const reader = await seedUser('reader');
    const editor = await seedUser('editor');
    const articleId = await seedPublishedArticle(author.id);
    const posted = await request(app)
      .post(`/v1/articles/${articleId}/comments`)
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ body: 'count me' });
    return {
      articleId,
      commentId: posted.body.data.comment.id,
      editorToken: editor.token,
      readerToken: reader.token,
    };
  }

  async function commentsCount(articleId: string): Promise<number> {
    const article = await Article.findById(articleId);
    return article?.stats?.commentsCount ?? -1;
  }

  it('stays 0 while the comment is pending', async () => {
    const { articleId } = await setup();
    expect(await commentsCount(articleId)).toBe(0);
  });

  it('increments to 1 when a comment is approved', async () => {
    const { articleId, commentId, editorToken } = await setup();
    await request(app)
      .post(`/v1/comments/${commentId}/approve`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(await commentsCount(articleId)).toBe(1);
  });

  it('does not double-count when an already-approved comment is re-approved', async () => {
    const { articleId, commentId, editorToken } = await setup();
    await request(app)
      .post(`/v1/comments/${commentId}/approve`)
      .set('Authorization', `Bearer ${editorToken}`);
    await request(app)
      .post(`/v1/comments/${commentId}/approve`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(await commentsCount(articleId)).toBe(1);
  });

  it('decrements back to 0 when an approved comment is hidden', async () => {
    const { articleId, commentId, editorToken } = await setup();
    await request(app)
      .post(`/v1/comments/${commentId}/approve`)
      .set('Authorization', `Bearer ${editorToken}`);
    await request(app)
      .post(`/v1/comments/${commentId}/hide`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(await commentsCount(articleId)).toBe(0);
  });

  it('decrements when an approved comment is deleted', async () => {
    const { articleId, commentId, editorToken } = await setup();
    await request(app)
      .post(`/v1/comments/${commentId}/approve`)
      .set('Authorization', `Bearer ${editorToken}`);
    await request(app)
      .delete(`/v1/comments/${commentId}`)
      .set('Authorization', `Bearer ${editorToken}`);
    expect(await commentsCount(articleId)).toBe(0);
  });

  it('does not change when a pending comment is deleted (never counted)', async () => {
    const { articleId, commentId, readerToken } = await setup();
    await request(app)
      .delete(`/v1/comments/${commentId}`)
      .set('Authorization', `Bearer ${readerToken}`);
    expect(await commentsCount(articleId)).toBe(0);
  });
});
