/**
 * Organisations integration — public reads + admin-gated CRUD + cascade safety.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

import { Organisation } from '@/modules/organisations';
import { User } from '@/modules/users';
import { hashPassword, signAccessToken } from '@/shared/crypto';

import { resetTestDb, startTestEnv, stopTestEnv } from './_setup';

let app: Express;

async function seedAdminToken(): Promise<string> {
  const admin = await User.create({
    email: `admin-${randomUUID().slice(0, 6)}@test.dev`,
    name: 'Admin',
    role: 'admin',
    passwordHash: await hashPassword('Pa55word!'),
    isEmailVerified: true,
    isActive: true,
  });
  return signAccessToken({
    sub: admin._id.toString(),
    email: admin.email,
    role: 'admin',
    organisationId: null,
    jti: randomUUID(),
  });
}

async function seedReaderToken(): Promise<string> {
  const reader = await User.create({
    email: `reader-${randomUUID().slice(0, 6)}@test.dev`,
    name: 'Reader',
    role: 'reader',
    passwordHash: await hashPassword('Pa55word!'),
    isEmailVerified: true,
    isActive: true,
  });
  return signAccessToken({
    sub: reader._id.toString(),
    email: reader.email,
    role: 'reader',
    organisationId: null,
    jti: randomUUID(),
  });
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

describe('GET /v1/organisations (public)', () => {
  it('returns paginated organisations without auth', async () => {
    await Organisation.create({ name: 'A College', slug: 'a-college', category: 'college' });
    await Organisation.create({ name: 'B Lab', slug: 'b-lab', category: 'research_lab' });

    const res = await request(app).get('/v1/organisations');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.items).toHaveLength(2);
  });

  it('filters by category', async () => {
    await Organisation.create({ name: 'A College', slug: 'a-college', category: 'college' });
    await Organisation.create({ name: 'B Lab', slug: 'b-lab', category: 'research_lab' });

    const res = await request(app).get('/v1/organisations?category=college');
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.items[0].slug).toBe('a-college');
  });
});

describe('GET /v1/organisations/by-slug/:slug', () => {
  it('returns the organisation', async () => {
    await Organisation.create({ name: 'Some College', slug: 'some-college', category: 'college' });
    const res = await request(app).get('/v1/organisations/by-slug/some-college');
    expect(res.status).toBe(200);
    expect(res.body.data.organisation.slug).toBe('some-college');
  });

  it('returns ORGANISATION_NOT_FOUND for an unknown slug', async () => {
    const res = await request(app).get('/v1/organisations/by-slug/missing');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORGANISATION_NOT_FOUND');
  });
});

describe('POST /v1/organisations (admin)', () => {
  it('admin can create an organisation', async () => {
    const token = await seedAdminToken();
    const res = await request(app)
      .post('/v1/organisations')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'New Org',
        slug: 'new-org',
        category: 'ngo',
        website: 'https://new-org.example',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.organisation.slug).toBe('new-org');
    expect(res.body.data.organisation.verified).toBe(true);
  });

  it('refuses duplicate slugs with CONFLICT', async () => {
    const token = await seedAdminToken();
    await Organisation.create({ name: 'Dup', slug: 'dup', category: 'other' });

    const res = await request(app)
      .post('/v1/organisations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Dup 2', slug: 'dup', category: 'other' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('rejects readers with 403', async () => {
    const token = await seedReaderToken();
    const res = await request(app)
      .post('/v1/organisations')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'X', slug: 'x', category: 'other' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /v1/organisations/:id (admin)', () => {
  it('refuses delete when active authors reference the org', async () => {
    const token = await seedAdminToken();
    const org = await Organisation.create({
      name: 'Linked',
      slug: 'linked',
      category: 'college',
    });
    await User.create({
      email: 'linked-author@test.dev',
      name: 'Linked Author',
      slug: 'linked-author',
      role: 'author',
      organisationId: org._id,
      passwordHash: await hashPassword('Pa55word!'),
      isEmailVerified: true,
      isActive: true,
    });

    const res = await request(app)
      .delete(`/v1/organisations/${org._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('deletes when no authors reference the org', async () => {
    const token = await seedAdminToken();
    const org = await Organisation.create({
      name: 'Orphan',
      slug: 'orphan',
      category: 'other',
    });

    const res = await request(app)
      .delete(`/v1/organisations/${org._id.toString()}`)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(204);

    const after = await Organisation.findById(org._id);
    expect(after).toBeNull();
  });
});
