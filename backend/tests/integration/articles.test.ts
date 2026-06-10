/**
 * Articles integration — draft / update / submit / delete with the full
 * RBAC + state-machine + concurrency surface.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

import { Article } from '@/modules/articles';
import { Media } from '@/modules/media';
import { User, type UserRole } from '@/modules/users';
import { hashPassword, signAccessToken } from '@/shared/crypto';

import { resetTestDb, startTestEnv, stopTestEnv } from './_setup';

let app: Express;

interface SeededUser {
  id: string;
  email: string;
  token: string;
  role: UserRole;
}

async function seedUser(
  role: UserRole,
  overrides: Partial<{ isEmailVerified: boolean; isActive: boolean }> = {},
): Promise<SeededUser> {
  const email = `${role}-${randomUUID().slice(0, 6)}@test.dev`;
  const user = await User.create({
    email,
    name: `${role} user`,
    passwordHash: await hashPassword('Pa55word!!'),
    role,
    isEmailVerified: overrides.isEmailVerified ?? true,
    isActive: overrides.isActive ?? true,
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

/** 320 chars of plain content (> the 300 submit minimum). */
const VALID_BODY_HTML =
  '<p>Education policy is shifting rapidly across the country, with new initiatives aimed at digital classrooms, inclusive curricula, and teacher training programs. Stakeholders ranging from federal regulators to neighbourhood schools are negotiating how to fund, measure, and roll these changes out before the next academic year begins in earnest.</p>';

async function seedCoverMedia(uploaderId: string): Promise<string> {
  const media = await Media.create({
    key: `uploads/article_cover/${randomUUID()}.jpg`,
    url: `https://mock-cdn.test/uploads/article_cover/cover.jpg`,
    mimeType: 'image/jpeg',
    size: 100_000,
    purpose: 'article_cover',
    uploadedBy: uploaderId,
  });
  return media._id.toString();
}

const VALID_CREATE_BODY = (coverImageMediaId: string) => ({
  title: 'AI in the Classroom',
  subtitle: 'How education is changing',
  body: VALID_BODY_HTML,
  category: 'research_innovation' as const,
  location: 'Mumbai',
  tags: ['ai', 'education'],
  coverImageMediaId,
});

beforeAll(async () => {
  app = await startTestEnv();
}, 120_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await resetTestDb();
});

// ─── POST /v1/articles ──────────────────────────────────────────────────

describe('POST /v1/articles', () => {
  it('author creates a draft with status=draft, version=0, generated slug', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);

    const res = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    expect(res.status).toBe(201);
    expect(res.body.data.article.status).toBe('draft');
    // Day-13 follow-up from PR #7: locks `version === 0` on the POST response.
    // Srishti observed `version > 0` during real-backend integration, but the
    // cause was an FE autosave loop firing PATCH before reading the create
    // response (fixed in PR #7). If a future FE bug reproduces the
    // "version starts > 0" symptom, this assertion proves the backend isn't
    // at fault — look at the FE call sequence around POST /articles.
    expect(res.body.data.article.version).toBe(0);
    expect(res.body.data.article.slug).toBe('ai-in-the-classroom');
    expect(res.body.data.article.authorId).toBe(author.id);
    // Body has been sanitized server-side (Tiptap output → safe HTML).
    expect(res.body.data.article.plainText.length).toBeGreaterThan(300);
  });

  it('rejects readers with 403 (RBAC ✍️📝 — no readers)', async () => {
    const reader = await seedUser('reader');
    const cover = await seedCoverMedia(reader.id);

    const res = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${reader.token}`)
      .send(VALID_CREATE_BODY(cover));
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app).post('/v1/articles').send({ title: 'x' });
    expect(res.status).toBe(401);
  });

  it('appends -2 suffix on slug collision', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);

    const first = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));
    expect(first.body.data.article.slug).toBe('ai-in-the-classroom');

    const second = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));
    expect(second.body.data.article.slug).toBe('ai-in-the-classroom-2');
  });

  it('bumps refCount on every referenced media on create', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);

    await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const after = await Media.findById(cover);
    expect(after?.refCount).toBe(1);
  });
});

// ─── PATCH /v1/articles/:id ─────────────────────────────────────────────

describe('PATCH /v1/articles/:id', () => {
  it('author updates their own draft and bumps version', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));
    const { id, version } = created.body.data.article;

    const res = await request(app)
      .patch(`/v1/articles/${id}`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ title: 'New Title', version });

    expect(res.status).toBe(200);
    expect(res.body.data.article.title).toBe('New Title');
    expect(res.body.data.article.version).toBe(version + 1);
  });

  it('returns 409 VERSION_CONFLICT when the version is stale', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));
    const { id, version } = created.body.data.article;

    // First update bumps to version+1.
    await request(app)
      .patch(`/v1/articles/${id}`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ title: 'a', version });

    // Second update with the OLD version should now conflict. The response's
    // `currentVersion` should report the LIVE row's version (so the FE can
    // refetch + retry), not the stale value the caller sent.
    const conflict = await request(app)
      .patch(`/v1/articles/${id}`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ title: 'b', version });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.code).toBe('VERSION_CONFLICT');
    expect(conflict.body.error.details).toMatchObject({ currentVersion: version + 1 });
  });

  it('forbids another author from editing the draft', async () => {
    const owner = await seedUser('author');
    const stranger = await seedUser('author');
    const cover = await seedCoverMedia(owner.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .patch(`/v1/articles/${created.body.data.article.id}`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .send({ title: 'hijack', version: 0 });
    expect(res.status).toBe(403);
  });

  it("editor can update another author's draft (copy-edit handoff)", async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .patch(`/v1/articles/${created.body.data.article.id}`)
      .set('Authorization', `Bearer ${editor.token}`)
      .send({ subtitle: 'editor tweak', version: 0 });
    expect(res.status).toBe(200);
    expect(res.body.data.article.subtitle).toBe('editor tweak');
  });

  it('sanitizes script tags on update (defence in depth)', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .patch(`/v1/articles/${created.body.data.article.id}`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        body: '<p>safe paragraph that is also long enough to count.</p><script>alert(1)</script>',
        version: 0,
      });

    expect(res.status).toBe(200);
    expect(res.body.data.article.body).not.toMatch(/script/);
    expect(res.body.data.article.body).not.toMatch(/alert/);
  });

  // ─── #35: media[] reconciliation when cover changes ──────────────────
  // Pre-fix, `??` falsely treated `set.coverImageMediaId = null` as "no
  // change" and re-added the previous cover into `media[]`. These two cases
  // cover Remove and Replace; both used to leak the old cover as an orphan.

  it('Remove (coverImageMediaId=null) drops the old cover from media[] and decrements its refCount', async () => {
    const author = await seedUser('author');
    const coverA = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(coverA));
    const articleId = created.body.data.article.id;

    const patch = await request(app)
      .patch(`/v1/articles/${articleId}`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ coverImageMediaId: null, version: 0 });
    expect(patch.status).toBe(200);

    const after = await Article.findById(articleId);
    expect(after?.coverImageMediaId).toBeNull();
    expect((after?.media ?? []).map((m) => m.toString())).toEqual([]);

    const mediaA = await Media.findById(coverA);
    expect(mediaA?.refCount).toBe(0);
  });

  it('Replace (coverImageMediaId A→B) drops A from media[] and leaves only B', async () => {
    const author = await seedUser('author');
    const coverA = await seedCoverMedia(author.id);
    const coverB = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(coverA));
    const articleId = created.body.data.article.id;

    const patch = await request(app)
      .patch(`/v1/articles/${articleId}`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ coverImageMediaId: coverB, version: 0 });
    expect(patch.status).toBe(200);

    const after = await Article.findById(articleId);
    expect(after?.coverImageMediaId?.toString()).toBe(coverB);
    expect((after?.media ?? []).map((m) => m.toString())).toEqual([coverB]);

    const mediaA = await Media.findById(coverA);
    const mediaB = await Media.findById(coverB);
    expect(mediaA?.refCount).toBe(0);
    expect(mediaB?.refCount).toBe(1);
  });
});

// ─── GET /v1/articles/:id ───────────────────────────────────────────────

describe('GET /v1/articles/:id', () => {
  it('owner can read their own draft', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .get(`/v1/articles/${created.body.data.article.id}`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.article.id).toBe(created.body.data.article.id);
  });

  it('editor + admin can read any draft; another author cannot', async () => {
    const author = await seedUser('author');
    const stranger = await seedUser('author');
    const editor = await seedUser('editor');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));
    const articleId = created.body.data.article.id;

    const editorRes = await request(app)
      .get(`/v1/articles/${articleId}`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(editorRes.status).toBe(200);

    const strangerRes = await request(app)
      .get(`/v1/articles/${articleId}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(strangerRes.status).toBe(403);
  });

  // PR #59 added author projection to `getArticleBySlug` + `listArticles` but
  // missed `getArticleById`. FE consumers (editor preview, author draft edit)
  // expect `article.author: { id, name } | null` and fall back to "Unknown
  // author" without it. Pins #76.
  it('response includes author projection (id + name)', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .get(`/v1/articles/${created.body.data.article.id}`)
      .set('Authorization', `Bearer ${author.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.article.author).toEqual({
      id: author.id,
      name: 'author user',
    });
  });
});

// ─── GET /v1/articles (list) ────────────────────────────────────────────

describe('GET /v1/articles', () => {
  it('author sees only their own articles', async () => {
    const a = await seedUser('author');
    const b = await seedUser('author');
    const coverA = await seedCoverMedia(a.id);
    const coverB = await seedCoverMedia(b.id);

    await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${a.token}`)
      .send(VALID_CREATE_BODY(coverA));
    await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${b.token}`)
      .send(VALID_CREATE_BODY(coverB));

    const res = await request(app).get('/v1/articles').set('Authorization', `Bearer ${a.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].authorId).toBe(a.id);
    expect(res.body.data.items[0].author).toEqual({ id: a.id, name: 'author user' });
  });

  it('editor sees all articles regardless of author', async () => {
    const a = await seedUser('author');
    const b = await seedUser('author');
    const editor = await seedUser('editor');
    const coverA = await seedCoverMedia(a.id);
    const coverB = await seedCoverMedia(b.id);

    await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${a.token}`)
      .send(VALID_CREATE_BODY(coverA));
    await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${b.token}`)
      .send(VALID_CREATE_BODY(coverB));

    const res = await request(app)
      .get('/v1/articles')
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.body.data.total).toBe(2);
  });
});

// ─── POST /v1/articles/:id/submit ───────────────────────────────────────

describe('POST /v1/articles/:id/submit', () => {
  it('happy path: valid draft → 200, status=submitted, submittedAt set', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${author.token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.article.status).toBe('submitted');
    expect(res.body.data.article.submittedAt).toBeTruthy();
  });

  it('blocks submission with 403 EMAIL_NOT_VERIFIED on unverified accounts', async () => {
    const author = await seedUser('author', { isEmailVerified: false });
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });

  it('rejects submission with 422 when body is shorter than 300 chars', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        ...VALID_CREATE_BODY(cover),
        body: '<p>too short</p>',
      });

    const res = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ field: 'body', minLength: 300 });
  });

  it('rejects submission with 422 when cover image is missing', async () => {
    const author = await seedUser('author');
    // Build a draft via direct DB so we can omit the cover and avoid the
    // creating-without-cover path (which the create handler tolerates today).
    const article = await Article.create({
      title: 'No cover',
      slug: 'no-cover',
      body: '<p>safe</p>',
      plainText: 'a'.repeat(400),
      category: 'campus_news',
      tags: ['a'],
      authorId: author.id,
      status: 'draft',
      version: 0,
    });

    const res = await request(app)
      .post(`/v1/articles/${article._id.toString()}/submit`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ field: 'coverImageMediaId' });
  });

  it("forbids submitting another author's draft", async () => {
    const owner = await seedUser('author');
    const stranger = await seedUser('author');
    const cover = await seedCoverMedia(owner.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(403);
  });

  it('editor can submit their own draft (#32 fix-PR — COI now enforced at approve step)', async () => {
    // Editors used to be excluded from submit to prevent self-approve COI.
    // Per issue #32, editor is now allowed to submit (so they can author),
    // and the COI guard moved to `approveArticle` (covered in articles-
    // lifecycle.test.ts). Ownership check still prevents editor from
    // submitting someone else's draft (covered in the next test).
    const editor = await seedUser('editor');
    const cover = await seedCoverMedia(editor.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${editor.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.article.status).toBe('submitted');
    expect(res.body.data.article.submittedAt).toBeTruthy();
  });

  it("forbids editor from submitting someone else's draft (ownership check holds)", async () => {
    const author = await seedUser('author');
    const editor = await seedUser('editor');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(403);
  });

  it('admin can submit their own draft (dogfooding — Day-13 follow-up from PR #7)', async () => {
    // Admins can dogfood the full author flow on their own articles. The
    // route guard accepts (author, admin); the service-layer ownership check
    // (`article.authorId === userId`) still prevents admin from submitting
    // someone else's draft (covered by the next test).
    const admin = await seedUser('admin');
    const cover = await seedCoverMedia(admin.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${admin.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.article.status).toBe('submitted');
    expect(res.body.data.article.submittedAt).toBeTruthy();
  });

  it("forbids admin from submitting someone else's draft (ownership check holds)", async () => {
    const author = await seedUser('author');
    const admin = await seedUser('admin');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
  });

  it('refuses a second submission with INVALID_STATE', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const first = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(first.status).toBe(200);

    const second = await request(app)
      .post(`/v1/articles/${created.body.data.article.id}/submit`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('INVALID_STATE');
  });
});

// ─── DELETE /v1/articles/:id ────────────────────────────────────────────

describe('DELETE /v1/articles/:id', () => {
  it('author can soft-delete their own article; subsequent GET → 404', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));
    const articleId = created.body.data.article.id;

    const del = await request(app)
      .delete(`/v1/articles/${articleId}`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(del.status).toBe(204);

    const after = await request(app)
      .get(`/v1/articles/${articleId}`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(after.status).toBe(404);
  });

  it('decrements media refCount on soft-delete', async () => {
    const author = await seedUser('author');
    const cover = await seedCoverMedia(author.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${author.token}`)
      .send(VALID_CREATE_BODY(cover));

    const beforeDelete = await Media.findById(cover);
    expect(beforeDelete?.refCount).toBe(1);

    await request(app)
      .delete(`/v1/articles/${created.body.data.article.id}`)
      .set('Authorization', `Bearer ${author.token}`);

    const afterDelete = await Media.findById(cover);
    expect(afterDelete?.refCount).toBe(0);
  });

  it('forbids another author from deleting (service-level RBAC)', async () => {
    const owner = await seedUser('author');
    const stranger = await seedUser('author');
    const cover = await seedCoverMedia(owner.id);
    const created = await request(app)
      .post('/v1/articles')
      .set('Authorization', `Bearer ${owner.token}`)
      .send(VALID_CREATE_BODY(cover));

    const res = await request(app)
      .delete(`/v1/articles/${created.body.data.article.id}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(403);
  });
});
