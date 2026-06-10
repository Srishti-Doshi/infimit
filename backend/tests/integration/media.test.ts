/**
 * Media integration — presign / register / get / delete with RBAC + caps.
 * S3 SDK is mocked at the module boundary (see ./_s3Mock); the tests assert
 * on the flow, not on AWS internals.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

import { Media } from '@/modules/media';
import { User, type UserRole } from '@/modules/users';
import { hashPassword, signAccessToken } from '@/shared/crypto';

import { resetTestDb, startTestEnv, stopTestEnv } from './_setup';
import { __setUploadedBytes } from './_s3Mock';

let app: Express;

// Magic-byte signatures used to simulate "real" uploads in the mock S3.
// The register flow Range-GETs the first bytes and verifies against these.
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MAGIC = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);

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

beforeAll(async () => {
  app = await startTestEnv();
}, 120_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await resetTestDb();
});

// ─── POST /v1/media/upload-url ───────────────────────────────────────────

describe('POST /v1/media/upload-url', () => {
  it('returns a presigned URL + key for a valid image cover', async () => {
    const user = await seedUser('author');
    const res = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ mimeType: 'image/jpeg', size: 500_000, purpose: 'article_cover' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.uploadUrl).toBe('string');
    expect(res.body.data.key).toMatch(/^uploads\/article_cover\/[0-9a-f-]+\.jpg$/);
    expect(res.body.data.expiresIn).toBeGreaterThan(0);
  });

  it('rejects unauthenticated requests with 401', async () => {
    const res = await request(app)
      .post('/v1/media/upload-url')
      .send({ mimeType: 'image/jpeg', size: 1, purpose: 'article_cover' });
    expect(res.status).toBe(401);
  });

  it('rejects a disallowed MIME for the purpose (svg on article_cover)', async () => {
    const user = await seedUser('author');
    const res = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ mimeType: 'image/svg+xml', size: 1000, purpose: 'article_cover' });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toMatchObject({ reason: 'mime', purpose: 'article_cover' });
  });

  it('allows svg specifically on org_logo (the documented exception)', async () => {
    const user = await seedUser('admin');
    const res = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ mimeType: 'image/svg+xml', size: 50_000, purpose: 'org_logo' });
    expect(res.status).toBe(200);
  });

  it('rejects oversized uploads with details.limit set', async () => {
    const user = await seedUser('author');
    const res = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        mimeType: 'image/jpeg',
        size: 11 * 1024 * 1024, // 11 MB > article_cover 10 MB cap
        purpose: 'article_cover',
      });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ reason: 'size', purpose: 'article_cover' });
  });
});

// ─── POST /v1/media/register ─────────────────────────────────────────────

describe('POST /v1/media/register', () => {
  it('persists a media doc after a presign + upload', async () => {
    const user = await seedUser('author');

    // Step 1: issue presign
    const presign = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ mimeType: 'image/jpeg', size: 100_000, purpose: 'article_cover' });
    const { key } = presign.body.data;

    // Step 1.5: simulate the FE's PUT to S3 by stashing JPEG magic bytes for
    // the register flow's Range-GET to find.
    __setUploadedBytes(key, JPEG_MAGIC);

    // Step 2: register
    const reg = await request(app)
      .post('/v1/media/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        key,
        mimeType: 'image/jpeg',
        size: 100_000,
        dimensions: { width: 800, height: 600 },
      });

    expect(reg.status).toBe(201);
    expect(reg.body.data.media.purpose).toBe('article_cover');
    expect(reg.body.data.media.url).toMatch(/mock-cdn\.test/);
    expect(reg.body.data.media.refCount).toBe(0);
    expect(reg.body.data.media.passwordHash).toBeUndefined(); // sanity
  });

  it('is idempotent on duplicate key (returns the existing doc, not a 409)', async () => {
    const user = await seedUser('author');
    const presign = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ mimeType: 'image/png', size: 50_000, purpose: 'author_avatar' });
    const { key } = presign.body.data;
    __setUploadedBytes(key, PNG_MAGIC);

    const first = await request(app)
      .post('/v1/media/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ key, mimeType: 'image/png', size: 50_000 });
    expect(first.status).toBe(201);

    const second = await request(app)
      .post('/v1/media/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ key, mimeType: 'image/png', size: 50_000 });
    expect(second.status).toBe(201);
    expect(second.body.data.media.id).toBe(first.body.data.media.id);
  });

  it('rejects a key with the wrong prefix (validator)', async () => {
    const user = await seedUser('author');
    const res = await request(app)
      .post('/v1/media/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({
        key: 'attacker-controlled-path/something.jpg',
        mimeType: 'image/jpeg',
        size: 100_000,
      });
    expect(res.status).toBe(422);
  });

  it('rejects register when size widens past the cap (re-validation)', async () => {
    const user = await seedUser('author');
    const presign = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ mimeType: 'image/jpeg', size: 1_000_000, purpose: 'author_avatar' });
    const { key } = presign.body.data;

    // Now lie at register-time: claim a 5 MB file when the avatar cap is 2 MB.
    const res = await request(app)
      .post('/v1/media/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ key, mimeType: 'image/jpeg', size: 5 * 1024 * 1024 });
    expect(res.status).toBe(422);
    expect(res.body.error.details).toMatchObject({ reason: 'size', purpose: 'author_avatar' });
  });

  // Pins #80 — magic-byte (defence-in-depth) verification. A tampered FE
  // can claim `application/pdf` at presign to satisfy the cap, then PUT
  // non-PDF bytes (e.g. a renamed JPEG) to the presigned URL. The register
  // flow Range-GETs the first bytes and must reject the mismatch.
  it('rejects register when uploaded bytes do not match the claimed MIME (PDF claim + JPEG bytes)', async () => {
    const user = await seedUser('admin');
    const presign = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ mimeType: 'application/pdf', size: 500_000, purpose: 'epaper_pdf' });
    const { key } = presign.body.data;

    // The FE claimed PDF — but it actually PUT JPEG bytes to S3.
    __setUploadedBytes(key, JPEG_MAGIC);

    const res = await request(app)
      .post('/v1/media/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ key, mimeType: 'application/pdf', size: 500_000 });

    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.error.details).toMatchObject({
      reason: 'mime-mismatch',
      purpose: 'epaper_pdf',
      claimed: 'application/pdf',
    });
    expect(res.body.error.details.expected).toMatch(/PDF/);

    // No Media doc should have been created — the spoofed upload must not
    // persist even though everything else (cap, size, key shape) was valid.
    const persisted = await Media.findOne({ key });
    expect(persisted).toBeNull();
  });

  it('accepts register when uploaded bytes match the claimed MIME (real PDF)', async () => {
    const user = await seedUser('admin');
    const presign = await request(app)
      .post('/v1/media/upload-url')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ mimeType: 'application/pdf', size: 500_000, purpose: 'epaper_pdf' });
    const { key } = presign.body.data;

    // Real PDF: %PDF-1.7 magic bytes at offset 0.
    __setUploadedBytes(key, PDF_MAGIC);

    const res = await request(app)
      .post('/v1/media/register')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ key, mimeType: 'application/pdf', size: 500_000 });

    expect(res.status).toBe(201);
    expect(res.body.data.media.mimeType).toBe('application/pdf');
    expect(res.body.data.media.purpose).toBe('epaper_pdf');
  });
});

// ─── GET /v1/media/:id ───────────────────────────────────────────────────

describe('GET /v1/media/:id', () => {
  it('returns media metadata without auth (public)', async () => {
    const author = await seedUser('author');
    const media = await Media.create({
      key: 'uploads/article_cover/some.jpg',
      url: 'https://mock-cdn.test/uploads/article_cover/some.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      purpose: 'article_cover',
      uploadedBy: author.id,
    });

    const res = await request(app).get(`/v1/media/${media._id.toString()}`);
    expect(res.status).toBe(200);
    expect(res.body.data.media.id).toBe(media._id.toString());
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/v1/media/000000000000000000000000');
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /v1/media/:id ────────────────────────────────────────────────

describe('DELETE /v1/media/:id', () => {
  it('uploader can delete their own media', async () => {
    const author = await seedUser('author');
    const media = await Media.create({
      key: 'uploads/article_cover/own.jpg',
      url: 'https://mock-cdn.test/uploads/article_cover/own.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      purpose: 'article_cover',
      uploadedBy: author.id,
    });

    const res = await request(app)
      .delete(`/v1/media/${media._id.toString()}`)
      .set('Authorization', `Bearer ${author.token}`);
    expect(res.status).toBe(204);

    const after = await Media.findById(media._id);
    expect(after).toBeNull();
  });

  it("forbids deleting another author's media", async () => {
    const owner = await seedUser('author');
    const stranger = await seedUser('author');
    const media = await Media.create({
      key: 'uploads/article_cover/owned.jpg',
      url: 'https://mock-cdn.test/uploads/article_cover/owned.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      purpose: 'article_cover',
      uploadedBy: owner.id,
    });

    const res = await request(app)
      .delete(`/v1/media/${media._id.toString()}`)
      .set('Authorization', `Bearer ${stranger.token}`);
    expect(res.status).toBe(403);
  });

  it("editor + admin can delete anyone's media", async () => {
    const owner = await seedUser('author');
    const editor = await seedUser('editor');
    const media = await Media.create({
      key: 'uploads/article_cover/owned2.jpg',
      url: 'https://mock-cdn.test/uploads/article_cover/owned2.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      purpose: 'article_cover',
      uploadedBy: owner.id,
    });

    const res = await request(app)
      .delete(`/v1/media/${media._id.toString()}`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(204);
  });

  it('refuses delete with 409 when refCount > 0', async () => {
    const owner = await seedUser('author');
    const media = await Media.create({
      key: 'uploads/article_cover/linked.jpg',
      url: 'https://mock-cdn.test/uploads/article_cover/linked.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      purpose: 'article_cover',
      uploadedBy: owner.id,
      refCount: 1, // referenced by an article somewhere
    });

    const res = await request(app)
      .delete(`/v1/media/${media._id.toString()}`)
      .set('Authorization', `Bearer ${owner.token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
    expect(res.body.error.details).toMatchObject({ refCount: 1 });
  });
});
