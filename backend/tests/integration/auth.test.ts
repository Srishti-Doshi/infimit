/**
 * Auth integration — covers the happy path + the security-critical edges that
 * unit tests can't reach (cookie rotation, blocklist replay, brute-force).
 */
jest.mock('@/config/redis', () => require('./_redisMock'));

import request from 'supertest';
import type { Express } from 'express';

import { Organisation } from '@/modules/organisations';

import { nextTestIp, resetTestDb, startTestEnv, stopTestEnv } from './_setup';

let app: Express;

const READER = {
  name: 'Reader Renee',
  email: 'reader@test.dev',
  password: 'Pa55word!!',
};

const AUTHOR = {
  name: 'Author Anna',
  email: 'author@test.dev',
  password: 'Pa55word!!',
  organisationSlug: 'test-college',
};

beforeAll(async () => {
  app = await startTestEnv();
}, 120_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await resetTestDb();
});

describe('POST /v1/auth/register', () => {
  it('registers a reader and returns an access token + refresh cookie', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({ role: 'reader', ...READER });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.email).toBe(READER.email);
    expect(res.body.data.user.role).toBe('reader');
    expect(res.body.data.user.passwordHash).toBeUndefined();
    expect(typeof res.body.data.accessToken).toBe('string');

    const setCookie = res.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookies = Array.isArray(setCookie) ? setCookie : [setCookie];
    const refresh = cookies.find((c) => c.startsWith('refresh_token='));
    expect(refresh).toBeDefined();
    expect(refresh).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/SameSite=Strict/i);
    expect(refresh).toMatch(/Path=\/v1\/auth/i);
  });

  it('rejects an author registration without a known organisation', async () => {
    const res = await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({ role: 'author', ...AUTHOR });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('ORGANISATION_NOT_FOUND');
  });

  it('registers an author when the organisation slug exists', async () => {
    await Organisation.create({
      name: 'Test College',
      slug: 'test-college',
      category: 'college',
      verified: true,
    });

    const res = await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({ role: 'author', ...AUTHOR });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('author');
    expect(res.body.data.user.slug).toMatch(/^author-anna/);
  });

  it('rejects a duplicate email with EMAIL_EXISTS', async () => {
    await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({ role: 'reader', ...READER });

    const res = await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({ role: 'reader', ...READER });

    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('EMAIL_EXISTS');
  });
});

describe('POST /v1/auth/login', () => {
  beforeEach(async () => {
    await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({ role: 'reader', ...READER });
  });

  it('issues a fresh token pair on correct credentials', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', nextTestIp())
      .send({ email: READER.email, password: READER.password });

    expect(res.status).toBe(200);
    expect(typeof res.body.data.accessToken).toBe('string');
  });

  it('returns 401 INVALID_CREDENTIALS on wrong password', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', nextTestIp())
      .send({ email: READER.email, password: 'WrongPa55!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('returns identical 401 for unknown email (no enumeration)', async () => {
    const res = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', nextTestIp())
      .send({ email: 'noone@test.dev', password: 'whatever1!' });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  it('locks the account after 10 consecutive failures', async () => {
    const ip = nextTestIp();
    // 10 failures from a single IP — under the 10/min IP cap so all reach the
    // brute-force counter. The auth limiter applies first; we deliberately pad
    // with the per-test IP rotation only for OTHER cases.
    let lastStatus = 0;
    for (let i = 0; i < 10; i += 1) {
      // Use a fresh IP each iteration so the IP limiter doesn't trip — we're
      // testing the per-account brute-force counter, not the IP limiter.
      // eslint-disable-next-line no-await-in-loop
      const res = await request(app)
        .post('/v1/auth/login')
        .set('X-Forwarded-For', nextTestIp())
        .send({ email: READER.email, password: 'WrongPa55!' });
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);

    // 11th attempt should also be 429 even with the correct password — the
    // account is locked.
    const res = await request(app)
      .post('/v1/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: READER.email, password: READER.password });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  }, 30_000);
});

describe('GET /v1/auth/me', () => {
  let accessToken: string;

  beforeEach(async () => {
    const reg = await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({ role: 'reader', ...READER });
    accessToken = reg.body.data.accessToken;
  });

  it('returns the authenticated user', async () => {
    const res = await request(app).get('/v1/auth/me').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(READER.email);
  });

  it('rejects requests without a bearer token', async () => {
    const res = await request(app).get('/v1/auth/me');
    expect(res.status).toBe(401);
  });
});

describe('POST /v1/auth/refresh + /logout', () => {
  it('rotates the refresh cookie and revokes the previous jti on next use', async () => {
    const ip = nextTestIp();
    const reg = await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ role: 'reader', ...READER });

    const firstCookies = (reg.headers['set-cookie'] as unknown as string[]) ?? [];
    const firstRefresh = firstCookies.find((c) => c.startsWith('refresh_token='))!;

    const refreshed = await request(app)
      .post('/v1/auth/refresh')
      .set('X-Forwarded-For', ip)
      .set('Cookie', firstRefresh);
    expect(refreshed.status).toBe(200);

    // Replaying the old cookie must trigger replay detection and 401.
    const replay = await request(app)
      .post('/v1/auth/refresh')
      .set('X-Forwarded-For', ip)
      .set('Cookie', firstRefresh);
    expect(replay.status).toBe(401);
  });

  it('logout clears the cookie and the same cookie can no longer refresh', async () => {
    const ip = nextTestIp();
    const reg = await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', ip)
      .send({ role: 'reader', ...READER });

    const accessToken = reg.body.data.accessToken;
    const cookies = (reg.headers['set-cookie'] as unknown as string[]) ?? [];
    const refresh = cookies.find((c) => c.startsWith('refresh_token='))!;

    const out = await request(app)
      .post('/v1/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .set('Cookie', refresh)
      .set('X-Forwarded-For', ip);
    expect(out.status).toBe(204);

    const refreshAfter = await request(app)
      .post('/v1/auth/refresh')
      .set('X-Forwarded-For', ip)
      .set('Cookie', refresh);
    expect(refreshAfter.status).toBe(401);
  });
});

describe('POST /v1/auth/forgot-password + /reset-password', () => {
  it('forgot-password returns 200 for both known and unknown emails (anti-enumeration)', async () => {
    await request(app)
      .post('/v1/auth/register')
      .set('X-Forwarded-For', nextTestIp())
      .send({ role: 'reader', ...READER });

    const known = await request(app)
      .post('/v1/auth/forgot-password')
      .set('X-Forwarded-For', nextTestIp())
      .send({ email: READER.email });
    expect(known.status).toBe(200);
    expect(known.body.data.sent).toBe(true);

    const unknown = await request(app)
      .post('/v1/auth/forgot-password')
      .set('X-Forwarded-For', nextTestIp())
      .send({ email: 'noone@test.dev' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.sent).toBe(true);
  });
});
