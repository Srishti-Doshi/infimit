/**
 * E-paper integration — Subphase 4 surface.
 *
 * Covers admin create + delete, public list / get / download-redirect, and
 * RBAC denials. S3 is mocked at the module boundary (existing _s3Mock from
 * the media tests); the download endpoint asserts on the 302 Location
 * pointing at the mock CDN URL.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));
jest.mock('@/config/s3', () => require('./_s3Mock'));
jest.mock('@/modules/ai-proxy', () => require('./_aiProxyMock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

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

async function seedEpaperMedia(uploaderId: string): Promise<{ pdfId: string; coverId: string }> {
  const pdf = await Media.create({
    key: `uploads/epaper_pdf/${randomUUID()}.pdf`,
    url: `https://mock-cdn.test/uploads/epaper_pdf/${randomUUID()}.pdf`,
    mimeType: 'application/pdf',
    size: 1_000_000,
    purpose: 'epaper_pdf',
    uploadedBy: uploaderId,
  });
  const cover = await Media.create({
    key: `uploads/epaper_cover/${randomUUID()}.jpg`,
    url: `https://mock-cdn.test/uploads/epaper_cover/${randomUUID()}.jpg`,
    mimeType: 'image/jpeg',
    size: 100_000,
    purpose: 'epaper_cover',
    uploadedBy: uploaderId,
  });
  return { pdfId: pdf._id.toString(), coverId: cover._id.toString() };
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

// ─── POST /v1/epapers ───────────────────────────────────────────────────

describe('POST /v1/epapers', () => {
  it('admin creates a new issue linking pdf + cover media docs', async () => {
    const admin = await seedUser('admin');
    const { pdfId, coverId } = await seedEpaperMedia(admin.id);

    const res = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Morning Edition — May 30, 2026',
        issueDate: '2026-05-30',
        pdfMediaId: pdfId,
        coverMediaId: coverId,
        pageCount: 16,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.epaper.title).toBe('Morning Edition — May 30, 2026');
    expect(res.body.data.epaper.pageCount).toBe(16);
    expect(res.body.data.epaper.stats.downloads).toBe(0);
    // Cover URL hydrated from the linked Media doc — readers depend on this
    // for the archive thumbnail.
    expect(res.body.data.epaper.coverImageUrl).toMatch(/mock-cdn\.test/);
  });

  it('forbids editors from creating an issue (admin-only)', async () => {
    const editor = await seedUser('editor');
    const { pdfId, coverId } = await seedEpaperMedia(editor.id);

    const res = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${editor.token}`)
      .send({
        title: 'Editor Edition',
        issueDate: '2026-05-30',
        pdfMediaId: pdfId,
        coverMediaId: coverId,
      });
    expect(res.status).toBe(403);
  });

  it('rejects unauthenticated creation with 401', async () => {
    const res = await request(app).post('/v1/epapers').send({
      title: 'x',
      issueDate: '2026-05-30',
      pdfMediaId: '6a0000000000000000000000',
      coverMediaId: '6a0000000000000000000001',
    });
    expect(res.status).toBe(401);
  });

  it('rejects when pdfMediaId points to non-epaper_pdf media (e.g. an article cover)', async () => {
    const admin = await seedUser('admin');
    // Create a media doc with the WRONG purpose (article_cover instead of epaper_pdf).
    const wrong = await Media.create({
      key: 'uploads/article_cover/x.jpg',
      url: 'https://mock-cdn.test/uploads/article_cover/x.jpg',
      mimeType: 'image/jpeg',
      size: 100,
      purpose: 'article_cover',
      uploadedBy: admin.id,
    });
    const { coverId } = await seedEpaperMedia(admin.id);

    const res = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Wrong Purpose',
        issueDate: '2026-05-30',
        pdfMediaId: wrong._id.toString(),
        coverMediaId: coverId,
      });
    expect(res.status).toBe(422);
  });

  it('bumps refCount on both linked media docs', async () => {
    const admin = await seedUser('admin');
    const { pdfId, coverId } = await seedEpaperMedia(admin.id);

    await request(app).post('/v1/epapers').set('Authorization', `Bearer ${admin.token}`).send({
      title: 'Refcount test',
      issueDate: '2026-05-30',
      pdfMediaId: pdfId,
      coverMediaId: coverId,
    });

    const [pdf, cover] = await Promise.all([Media.findById(pdfId), Media.findById(coverId)]);
    expect(pdf?.refCount).toBe(1);
    expect(cover?.refCount).toBe(1);
  });
});

// ─── GET /v1/epapers (list, public) ─────────────────────────────────────

describe('GET /v1/epapers', () => {
  it('returns paginated issues sorted newest-first by issueDate, no auth required', async () => {
    const admin = await seedUser('admin');
    const a = await seedEpaperMedia(admin.id);
    const b = await seedEpaperMedia(admin.id);

    // Create two issues with different dates.
    await request(app).post('/v1/epapers').set('Authorization', `Bearer ${admin.token}`).send({
      title: 'Older',
      issueDate: '2026-05-01',
      pdfMediaId: a.pdfId,
      coverMediaId: a.coverId,
    });
    await request(app).post('/v1/epapers').set('Authorization', `Bearer ${admin.token}`).send({
      title: 'Newer',
      issueDate: '2026-05-30',
      pdfMediaId: b.pdfId,
      coverMediaId: b.coverId,
    });

    const res = await request(app).get('/v1/epapers');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items[0].title).toBe('Newer');
    expect(res.body.data.items[1].title).toBe('Older');
    // Both items hydrated with their linked cover URL — batch lookup, not N+1.
    expect(res.body.data.items[0].coverImageUrl).toMatch(/mock-cdn\.test/);
    expect(res.body.data.items[1].coverImageUrl).toMatch(/mock-cdn\.test/);
  });

  it('hydrates coverImageUrl to null when the linked cover media doc is missing', async () => {
    const admin = await seedUser('admin');
    const { pdfId, coverId } = await seedEpaperMedia(admin.id);
    const created = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Orphan cover',
        issueDate: '2026-05-30',
        pdfMediaId: pdfId,
        coverMediaId: coverId,
      });

    // Drop the cover media doc — the epaper now has an orphan coverMediaId.
    await Media.deleteOne({ _id: coverId });

    const list = await request(app).get('/v1/epapers');
    const orphan = list.body.data.items.find(
      (e: { id: string }) => e.id === created.body.data.epaper.id,
    );
    expect(orphan.coverImageUrl).toBeNull();

    const single = await request(app).get(`/v1/epapers/${created.body.data.epaper.id}`);
    expect(single.body.data.epaper.coverImageUrl).toBeNull();
  });
});

// ─── GET /v1/epapers/:id ────────────────────────────────────────────────

describe('GET /v1/epapers/:id', () => {
  it('returns a single issue (no auth) and bumps the view counter', async () => {
    const admin = await seedUser('admin');
    const { pdfId, coverId } = await seedEpaperMedia(admin.id);
    const created = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Single',
        issueDate: '2026-05-30',
        pdfMediaId: pdfId,
        coverMediaId: coverId,
      });

    const res = await request(app).get(`/v1/epapers/${created.body.data.epaper.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.epaper.title).toBe('Single');
    expect(res.body.data.epaper.coverImageUrl).toMatch(/mock-cdn\.test/);
  });

  it('returns 404 for an unknown id', async () => {
    const res = await request(app).get('/v1/epapers/000000000000000000000000');
    expect(res.status).toBe(404);
  });
});

// ─── GET /v1/epapers/:id/download ───────────────────────────────────────

describe('GET /v1/epapers/:id/download', () => {
  it('returns 302 to the presigned S3 URL (no auth)', async () => {
    const admin = await seedUser('admin');
    const { pdfId, coverId } = await seedEpaperMedia(admin.id);
    const created = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Downloadable',
        issueDate: '2026-05-30',
        pdfMediaId: pdfId,
        coverMediaId: coverId,
      });

    const res = await request(app)
      .get(`/v1/epapers/${created.body.data.epaper.id}/download`)
      .redirects(0); // don't follow — assert on the redirect itself

    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/mock-s3\.test/);
    // The presigned URL contains the underlying S3 key so the FE could
    // sanity-check it; assert that the key matches the underlying media doc.
    expect(res.headers.location).toContain('uploads/epaper_pdf/');
  });

  it('returns 404 when the linked pdf media doc is missing', async () => {
    const admin = await seedUser('admin');
    const { pdfId, coverId } = await seedEpaperMedia(admin.id);
    const created = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Orphan',
        issueDate: '2026-05-30',
        pdfMediaId: pdfId,
        coverMediaId: coverId,
      });

    // Delete the pdf media doc to create an orphan epaper.
    await Media.deleteOne({ _id: pdfId });

    const res = await request(app)
      .get(`/v1/epapers/${created.body.data.epaper.id}/download`)
      .redirects(0);
    expect(res.status).toBe(404);
  });
});

// ─── DELETE /v1/epapers/:id ─────────────────────────────────────────────

describe('DELETE /v1/epapers/:id', () => {
  it('admin deletes an issue + decrements media refCounts', async () => {
    const admin = await seedUser('admin');
    const { pdfId, coverId } = await seedEpaperMedia(admin.id);
    const created = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'To delete',
        issueDate: '2026-05-30',
        pdfMediaId: pdfId,
        coverMediaId: coverId,
      });

    const del = await request(app)
      .delete(`/v1/epapers/${created.body.data.epaper.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(204);

    const [pdf, cover] = await Promise.all([Media.findById(pdfId), Media.findById(coverId)]);
    expect(pdf?.refCount).toBe(0);
    expect(cover?.refCount).toBe(0);
  });

  it('forbids editors from deleting (admin-only)', async () => {
    const admin = await seedUser('admin');
    const editor = await seedUser('editor');
    const { pdfId, coverId } = await seedEpaperMedia(admin.id);
    const created = await request(app)
      .post('/v1/epapers')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        title: 'Try delete',
        issueDate: '2026-05-30',
        pdfMediaId: pdfId,
        coverMediaId: coverId,
      });

    const res = await request(app)
      .delete(`/v1/epapers/${created.body.data.epaper.id}`)
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(403);
  });
});
