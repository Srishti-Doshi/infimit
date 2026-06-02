/**
 * Smoke tests — Subphase 1 exit-criteria checks.
 *
 * Verifies:
 *  - app boots without external services (no Mongo / Redis needed)
 *  - /healthz returns 200
 *  - /readyz returns 503 when Mongo/Redis are not connected
 *  - /version returns the expected shape
 *  - unknown route returns the standard 404 envelope with requestId
 *  - X-Request-Id is propagated when supplied
 *  - skeleton endpoints return 501 with the contract envelope
 *
 * These tests are deliberately offline — they never touch real Mongo / Redis.
 * The dedicated DB integration tests (see tests/integration/) will use
 * mongodb-memory-server and a real ioredis pointed at a local container.
 */
import request from 'supertest';
import { createApp } from '../src/app';

const app = createApp();

describe('Subphase 1 smoke tests', () => {
  describe('GET /healthz', () => {
    it('returns 200 {status: "ok"}', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    it('always sets an X-Request-Id header', async () => {
      const res = await request(app).get('/healthz');
      expect(res.headers['x-request-id']).toBeDefined();
      expect(res.headers['x-request-id']).toMatch(/^[0-9a-f-]{8,}$/);
    });

    it('echoes the supplied X-Request-Id when present', async () => {
      const provided = 'test-correlation-12345';
      const res = await request(app).get('/healthz').set('X-Request-Id', provided);
      expect(res.headers['x-request-id']).toBe(provided);
    });
  });

  describe('GET /readyz', () => {
    it('returns 503 when Mongo + Redis are not connected', async () => {
      const res = await request(app).get('/readyz');
      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not_ready');
      expect(res.body.checks).toMatchObject({ mongo: 'fail', redis: 'fail' });
    });
  });

  describe('GET /version', () => {
    it('returns service metadata', async () => {
      const res = await request(app).get('/version');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        name: expect.any(String),
        version: expect.any(String),
        env: 'test',
        uptimeSeconds: expect.any(Number),
      });
    });
  });

  describe('404 fallback', () => {
    it('returns standard error envelope', async () => {
      const res = await request(app).get('/no-such-route');
      expect(res.status).toBe(404);
      expect(res.body).toMatchObject({
        error: {
          code: 'NOT_FOUND',
          message: expect.stringContaining('/no-such-route'),
        },
        requestId: expect.any(String),
      });
    });
  });

  describe('Skeleton modules', () => {
    // Real as of Subphase 2: /v1/auth/*, /v1/users/*, /v1/organisations/*
    // Real as of Subphase 3: /v1/articles/* (write surface), /v1/media/*
    // Real as of Subphase 4: /v1/articles/* (full lifecycle), /v1/comments/*,
    //   /v1/notifications/*, /v1/articles/:articleId/comments/*,
    //   /v1/epapers/*, /v1/search
    // The list below is endpoints that remain notImplemented skeletons.
    it.each([
      ['GET', '/v1/articles/feed/home'],
      ['POST', '/v1/analytics/track'],
    ])('%s %s returns 501 with envelope', async (method, path) => {
      const req = request(app);
      const res = method === 'POST' ? await req.post(path).send({}) : await req.get(path);
      expect(res.status).toBe(501);
      expect(res.body.error.code).toBe('INTERNAL_ERROR');
      expect(res.body.error.message).toMatch(/Subphase|Phase/);
    });
  });
});
