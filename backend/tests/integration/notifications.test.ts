/**
 * Notifications integration — Subphase 4 surface + event-driven creation.
 *
 * Covers the FE-facing endpoints (list / mark-read / mark-all-read) plus the
 * 5 event listeners that auto-create notifications on lifecycle events from
 * the articles + comments modules.
 *
 * The audit-log stubs in each module's `events.ts` still fire alongside the
 * notifications module — verifying both means the dual-fan-out pattern is
 * intact for forensic recovery if notifications ever falls over.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));
jest.mock('@/modules/ai-proxy', () => require('./_aiProxyMock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';
import { Types } from 'mongoose';

import { articleEvents } from '@/modules/articles';
import { commentEvents } from '@/modules/comments';
import { Notification } from '@/modules/notifications';
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

/** Let event listeners' async writes complete. */
async function flushAsync(): Promise<void> {
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

// ─── event listeners create notifications ───────────────────────────────

describe('notification listeners (event-driven creation)', () => {
  it('article.approved → article_approved notification for the author', async () => {
    const author = await seedUser('author');
    articleEvents.emit('article.approved', {
      articleId: new Types.ObjectId().toString(),
      authorId: author.id,
      editorId: new Types.ObjectId().toString(),
      category: 'campus_news',
    });
    await flushAsync();

    const notifs = await Notification.find({ userId: author.id }).exec();
    expect(notifs).toHaveLength(1);
    expect(notifs[0]?.type).toBe('article_approved');
    expect(notifs[0]?.read).toBe(false);
  });

  it('article.rejected → notification carries the rejection reason', async () => {
    const author = await seedUser('author');
    const reason = 'Body needs more sourcing — please cite at least two primary references.';
    articleEvents.emit('article.rejected', {
      articleId: new Types.ObjectId().toString(),
      authorId: author.id,
      editorId: new Types.ObjectId().toString(),
      category: 'research_innovation',
      rejectionReason: reason,
    });
    await flushAsync();

    const notif = await Notification.findOne({
      userId: author.id,
      type: 'article_rejected',
    }).exec();
    expect(notif?.body).toBe(reason);
    expect((notif?.metadata as { rejectionReason: string }).rejectionReason).toBe(reason);
  });

  it('article.published → article_published notification (P1: author only)', async () => {
    const author = await seedUser('author');
    articleEvents.emit('article.published', {
      articleId: new Types.ObjectId().toString(),
      authorId: author.id,
      editorId: new Types.ObjectId().toString(),
      category: 'tech_in_education',
      slug: 'some-slug',
    });
    await flushAsync();

    const notif = await Notification.findOne({
      userId: author.id,
      type: 'article_published',
    }).exec();
    expect(notif).toBeTruthy();
    expect(notif?.link).toContain('/articles/slug/some-slug');
  });

  it('article.unpublished → notifies the author with the slug', async () => {
    const author = await seedUser('author');
    articleEvents.emit('article.unpublished', {
      articleId: new Types.ObjectId().toString(),
      authorId: author.id,
      adminId: new Types.ObjectId().toString(),
      category: 'campus_news',
      slug: 'taken-down',
    });
    await flushAsync();

    const notif = await Notification.findOne({
      userId: author.id,
      type: 'article_unpublished',
    }).exec();
    expect(notif).toBeTruthy();
  });

  it('comment.approved → new_comment notification for the article author', async () => {
    const author = await seedUser('author');
    const commenter = await seedUser('reader');
    const articleId = new Types.ObjectId().toString();
    const commentId = new Types.ObjectId().toString();

    commentEvents.emit('comment.approved', {
      commentId,
      articleId,
      articleAuthorId: author.id,
      commenterId: commenter.id,
      commenterName: 'Reader Renee',
    });
    await flushAsync();

    const notif = await Notification.findOne({ userId: author.id, type: 'new_comment' }).exec();
    expect(notif).toBeTruthy();
    expect(notif?.body).toContain('Reader Renee');
    expect((notif?.metadata as { commentId: string }).commentId).toBe(commentId);
  });

  it('comment.approved does NOT notify when the author commented on their own piece', async () => {
    const author = await seedUser('author');
    commentEvents.emit('comment.approved', {
      commentId: new Types.ObjectId().toString(),
      articleId: new Types.ObjectId().toString(),
      articleAuthorId: author.id,
      commenterId: author.id, // same person
      commenterName: 'Author Anna',
    });
    await flushAsync();

    const count = await Notification.countDocuments({ userId: author.id }).exec();
    expect(count).toBe(0);
  });
});

// ─── GET /v1/notifications ──────────────────────────────────────────────

describe('GET /v1/notifications', () => {
  it("returns the authenticated user's notifications, newest first, with unread count", async () => {
    const user = await seedUser('author');
    // Seed two notifications: one unread, one read.
    await Notification.create({
      userId: user.id,
      type: 'article_approved',
      title: 'unread',
      body: '',
      link: '',
      read: false,
    });
    await Notification.create({
      userId: user.id,
      type: 'article_published',
      title: 'read',
      body: '',
      link: '',
      read: true,
      readAt: new Date(),
    });

    const res = await request(app)
      .get('/v1/notifications')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.unread).toBe(1);
  });

  it('unreadOnly=true filters to unread notifications', async () => {
    const user = await seedUser('author');
    await Notification.create({
      userId: user.id,
      type: 'article_approved',
      title: 'u',
      body: '',
      link: '',
      read: false,
    });
    await Notification.create({
      userId: user.id,
      type: 'article_published',
      title: 'r',
      body: '',
      link: '',
      read: true,
    });

    const res = await request(app)
      .get('/v1/notifications?unreadOnly=true')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.unread).toBe(1);
    expect(res.body.data.items[0].read).toBe(false);
  });

  it("scopes to the authenticated user — never returns others' notifications", async () => {
    const a = await seedUser('author');
    const b = await seedUser('reader');
    await Notification.create({
      userId: a.id,
      type: 'system',
      title: 'a-secret',
      body: '',
      link: '',
    });
    await Notification.create({
      userId: b.id,
      type: 'system',
      title: 'b-secret',
      body: '',
      link: '',
    });

    const res = await request(app)
      .get('/v1/notifications')
      .set('Authorization', `Bearer ${a.token}`);
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].title).toBe('a-secret');
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).get('/v1/notifications');
    expect(res.status).toBe(401);
  });
});

// ─── POST /v1/notifications/:id/read ────────────────────────────────────

describe('POST /v1/notifications/:id/read', () => {
  it('marks the notification as read + sets readAt', async () => {
    const user = await seedUser('author');
    const notif = await Notification.create({
      userId: user.id,
      type: 'article_approved',
      title: 'x',
      body: '',
      link: '',
      read: false,
    });

    const res = await request(app)
      .post(`/v1/notifications/${notif._id.toString()}/read`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notification.read).toBe(true);
    expect(res.body.data.notification.readAt).toBeTruthy();
  });

  it("forbids reading another user's notification (404 to avoid existence leak)", async () => {
    const a = await seedUser('author');
    const b = await seedUser('reader');
    const notif = await Notification.create({
      userId: a.id,
      type: 'article_approved',
      title: 'theirs',
      body: '',
      link: '',
      read: false,
    });

    const res = await request(app)
      .post(`/v1/notifications/${notif._id.toString()}/read`)
      .set('Authorization', `Bearer ${b.token}`);
    expect(res.status).toBe(404);
  });

  it('is idempotent on already-read notifications (200, not 4xx)', async () => {
    const user = await seedUser('author');
    const notif = await Notification.create({
      userId: user.id,
      type: 'article_approved',
      title: 'x',
      body: '',
      link: '',
      read: true,
      readAt: new Date(),
    });

    const res = await request(app)
      .post(`/v1/notifications/${notif._id.toString()}/read`)
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.notification.read).toBe(true);
  });
});

// ─── POST /v1/notifications/read-all ────────────────────────────────────

describe('POST /v1/notifications/read-all', () => {
  it('marks every unread notification as read and reports the count', async () => {
    const user = await seedUser('author');
    await Notification.create({
      userId: user.id,
      type: 'article_approved',
      title: '1',
      body: '',
      link: '',
      read: false,
    });
    await Notification.create({
      userId: user.id,
      type: 'article_published',
      title: '2',
      body: '',
      link: '',
      read: false,
    });
    await Notification.create({
      userId: user.id,
      type: 'system',
      title: 'already-read',
      body: '',
      link: '',
      read: true,
      readAt: new Date(),
    });

    const res = await request(app)
      .post('/v1/notifications/read-all')
      .set('Authorization', `Bearer ${user.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.updated).toBe(2); // the two unread, not the already-read one

    const remainingUnread = await Notification.countDocuments({
      userId: user.id,
      read: false,
    }).exec();
    expect(remainingUnread).toBe(0);
  });

  it('only affects the authenticated user, not anyone else', async () => {
    const a = await seedUser('author');
    const b = await seedUser('reader');
    await Notification.create({
      userId: a.id,
      type: 'system',
      title: 'a',
      body: '',
      link: '',
      read: false,
    });
    await Notification.create({
      userId: b.id,
      type: 'system',
      title: 'b',
      body: '',
      link: '',
      read: false,
    });

    await request(app).post('/v1/notifications/read-all').set('Authorization', `Bearer ${a.token}`);

    const bUnread = await Notification.countDocuments({ userId: b.id, read: false }).exec();
    expect(bUnread).toBe(1); // b's notification untouched
  });
});
