/**
 * Shared lifecycle helpers for integration tests.
 *
 * Every integration suite should:
 *   1. `jest.mock('@/config/redis', () => require('./_redisMock'));`  (top of file)
 *   2. `await startTestEnv()`                                         in beforeAll
 *   3. `await stopTestEnv()`                                          in afterAll
 *   4. `await resetTestDb()`                                          in beforeEach
 *
 * This gives each suite a clean in-memory Mongo + in-memory Redis with the JWT
 * keypair loaded so signing actually works.
 *
 * Unique-IP rotation: the auth router caps requests at 10/min/IP. We hand out
 * a fresh dotted-quad on every `nextTestIp()` call so RBAC / brute-force tests
 * don't accidentally collide.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import type { Express } from 'express';

import { resetEnvForTests } from '@/config/env';
import { disconnectMongo } from '@/config/db';
import { loadJwtKeys, resetJwtKeysForTests } from '@/shared/crypto';

import { __resetRedisMock } from './_redisMock';

let mongod: MongoMemoryServer | null = null;

export async function startTestEnv(): Promise<Express> {
  mongod = await MongoMemoryServer.create();
  process.env.MONGO_URI = mongod.getUri('infimit_test');
  process.env.REDIS_URL = 'redis://localhost:6379';
  resetEnvForTests();

  loadJwtKeys();

  const { createApp } = await import('../../src/app');
  // Lazy connect: the app's request flow buffers ops until mongoose connects.
  // We connect explicitly so the first test request doesn't pay the latency.
  await mongoose.connect(process.env.MONGO_URI);

  return createApp();
}

export async function stopTestEnv(): Promise<void> {
  await disconnectMongo();
  if (mongod) {
    await mongod.stop();
    mongod = null;
  }
  resetJwtKeysForTests();
  resetEnvForTests();
}

/** Drop every collection between tests so suites stay independent. */
export async function resetTestDb(): Promise<void> {
  const collections = mongoose.connection.collections;
  for (const key of Object.keys(collections)) {
    const collection = collections[key];
    if (collection) await collection.deleteMany({});
  }
  __resetRedisMock();
}

let ipCounter = 0;

/**
 * Return a fresh IPv4 address. Used as `X-Forwarded-For` so each test gets its
 * own rate-limit bucket on the /v1/auth router. trust proxy: 1 in app.ts makes
 * express-rate-limit honour the header.
 */
export function nextTestIp(): string {
  ipCounter += 1;
  const a = 10;
  const b = (ipCounter >> 16) & 0xff;
  const c = (ipCounter >> 8) & 0xff;
  const d = ipCounter & 0xff;
  return `${a}.${b}.${c}.${d}`;
}
