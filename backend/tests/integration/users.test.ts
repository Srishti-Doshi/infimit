/**
 * Users integration — covers RBAC, soft-delete + 30-day re-registration block,
 * and the admin-only editor lifecycle. Tokens for non-registerable roles
 * (admin / editor) are minted directly via signAccessToken; the auth router
 * itself is exercised in auth.test.ts.
 */
jest.mock('@/config/redis', () => require('./_redisMock'));

import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { Express } from 'express';

import { User, type UserRole } from '@/modules/users';
import { hashPassword, signAccessToken } from '@/shared/crypto';

import { nextTestIp, resetTestDb, startTestEnv, stopTestEnv } from './_setup';

let app: Express;

interface SeededUser {
  id: string;
  email: string;
  token: string;
  role: UserRole;
}

async function seedUser(
  role: UserRole,
  overrides: Partial<{ email: string }> = {},
): Promise<SeededUser> {
  const email = overrides.email ?? `${role}-${randomUUID().slice(0, 6)}@test.dev`;
  const user = await User.create({
    email,
    name: `${role} user`,
    passwordHash: await hashPassword('Pa55word!'),
    role,
    isEmailVerified: true,
    isActive: true,
  });
  const token = signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    role,
    organisationId: user.organisationId ? user.organisationId.toString() : null,
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

describe('GET /v1/users/me', () => {
  it('returns the authenticated user', async () => {
    const reader = await seedUser('reader');
    const res = await request(app)
      .get('/v1/users/me')
      .set('Authorization', `Bearer ${reader.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(reader.email);
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/v1/users/me');
    expect(res.status).toBe(401);
  });
});

describe('PATCH /v1/users/me', () => {
  it('updates the user name', async () => {
    const reader = await seedUser('reader');
    const res = await request(app)
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${reader.token}`)
      .send({ name: 'Renamed Reader' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.name).toBe('Renamed Reader');
  });

  it('rejects an empty body with VALIDATION_ERROR', async () => {
    const reader = await seedUser('reader');
    const res = await request(app)
      .patch('/v1/users/me')
      .set('Authorization', `Bearer ${reader.token}`)
      .send({});
    expect(res.status).toBe(422);
  });
});

describe('RBAC — admin-only routes', () => {
  it('forbids a reader from listing editors', async () => {
    const reader = await seedUser('reader');
    const res = await request(app)
      .get('/v1/users/editors')
      .set('Authorization', `Bearer ${reader.token}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('forbids an editor from listing editors (admin-only)', async () => {
    const editor = await seedUser('editor');
    const res = await request(app)
      .get('/v1/users/editors')
      .set('Authorization', `Bearer ${editor.token}`);
    expect(res.status).toBe(403);
  });

  it('admin can list editors', async () => {
    const admin = await seedUser('admin');
    await seedUser('editor');
    await seedUser('editor');

    const res = await request(app)
      .get('/v1/users/editors')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(2);
  });
});

describe('Admin editor lifecycle', () => {
  it('admin creates an editor with a starter password', async () => {
    const admin = await seedUser('admin');
    const res = await request(app)
      .post('/v1/users/editors')
      .set('Authorization', `Bearer ${admin.token}`)
      .send({
        name: 'New Editor',
        email: 'new-editor@test.dev',
        password: 'Editor12345!',
        sectionsOwned: ['campus_news'],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('editor');
    expect(res.body.data.user.passwordHash).toBeUndefined();
  });

  it('refuses if the admin tries to delete themselves', async () => {
    const admin = await seedUser('admin');
    const res = await request(app)
      .delete(`/v1/users/editors/${admin.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
  });

  it('refuses to delete a non-editor (admin) via the editor endpoint', async () => {
    const admin = await seedUser('admin');
    const otherAdmin = await seedUser('admin');
    const res = await request(app)
      .delete(`/v1/users/editors/${otherAdmin.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(403);
  });

  it('soft-deletes an editor and blocks re-registration for 30 days', async () => {
    const admin = await seedUser('admin');
    const editor = await seedUser('editor');

    const del = await request(app)
      .delete(`/v1/users/editors/${editor.id}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(del.status).toBe(204);

    // The user's deletedAt is now set; the email is technically free at the
    // DB level (partial unique index), but the service layer rejects with
    // EMAIL_RECENTLY_DELETED.
    const reReg = await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({
        role: 'reader',
        name: 'Reused',
        email: editor.email,
        password: 'Pa55word!!',
      });
    expect(reReg.status).toBe(409);
    expect(reReg.body.error.code).toBe('EMAIL_RECENTLY_DELETED');
  });
});

describe('GET /v1/users/authors/:slug', () => {
  it('returns 404 for a deleted author', async () => {
    const admin = await seedUser('admin');
    // Create an author the long way (registration requires an org), then
    // soft-delete by setting deletedAt directly — simpler than a full author
    // lifecycle for one assertion.
    const author = await User.create({
      email: 'author2@test.dev',
      name: 'Author Two',
      slug: 'author-two',
      role: 'author',
      passwordHash: await hashPassword('Pa55word!'),
      isActive: false,
      deletedAt: new Date(),
    });

    const res = await request(app)
      .get(`/v1/users/authors/${author.slug}`)
      .set('Authorization', `Bearer ${admin.token}`);
    expect(res.status).toBe(404);
  });
});
