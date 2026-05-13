/**
 * Mongo connector integration test.
 *
 * Spins up an in-memory MongoDB instance, points config/db.ts at it,
 * verifies connect / ping / disconnect, and that the readyz probe
 * flips green when the connection is live.
 *
 * Run prerequisite: mongodb-memory-server downloads its Mongo binary on first
 * use (cached under ~/.cache/mongodb-binaries). CI must either pre-warm that
 * cache or allow network egress during the first run. This test does NOT
 * conditionally skip — it will fail loudly if the binary can't be fetched, so
 * we never silently lose integration coverage.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import request from 'supertest';

import { resetEnvForTests } from '../../src/config/env';
import { connectMongo, disconnectMongo, pingMongo } from '../../src/config/db';

let mongod: MongoMemoryServer | null = null;

describe('Mongo connector (integration)', () => {
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    process.env.MONGO_URI = mongod.getUri('infimit_test');
    resetEnvForTests();
  }, 60_000);

  afterAll(async () => {
    await disconnectMongo();
    if (mongod) await mongod.stop();
  });

  it('connects, pings, and disconnects cleanly', async () => {
    const conn = await connectMongo();
    expect(conn.readyState).toBe(1);
    const ok = await pingMongo();
    expect(ok).toBe(true);
  });

  it('/readyz reports mongo=ok once connected', async () => {
    // Lazy import so the app picks up the updated env.
    const { createApp } = await import('../../src/app');
    const app = createApp();
    const res = await request(app).get('/readyz');
    // redis is still down so overall not_ready; but mongo subcheck is "ok"
    expect(res.body.checks.mongo).toBe('ok');
  });
});
