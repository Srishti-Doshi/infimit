/**
 * Media sweeper integration — orphan GC behaviour.
 *
 * Exercises `sweepOrphansOnce` against a real (in-memory) Mongo with the S3
 * delete mocked at the module boundary. Covers the three states:
 *   - Orphan + past grace cutoff → swept.
 *   - Orphan + within grace window → NOT swept (could still be a
 *     fresh-upload-mid-article-create).
 *   - Referenced (refCount > 0) → NOT swept regardless of age.
 *
 * Plus the S3-failure path: a delete-object that throws still drops the
 * Mongo doc and audits the failure, so a transient S3 hiccup can't strand
 * an orphan in the candidate set forever.
 */
jest.mock('@/config/s3', () => require('./_s3Mock'));

import request from 'supertest'; // unused but keeps the test-env signature aligned with other integration files
import type { Express } from 'express';

import { Media } from '@/modules/media';
import { sweepOrphansOnce } from '@/modules/media/sweeper';

import { resetTestDb, startTestEnv, stopTestEnv } from './_setup';
import * as s3Mock from './_s3Mock';

void request;

let app: Express;

beforeAll(async () => {
  app = await startTestEnv();
}, 120_000);

afterAll(async () => {
  await stopTestEnv();
});

beforeEach(async () => {
  await resetTestDb();
});

// Force a specific `createdAt` past the grace cutoff by writing the field
// directly — `new Date()` defaults to "now" which is always within grace.
async function seedOrphan(args: {
  key: string;
  purpose?: 'article_cover' | 'epaper_pdf';
  createdAt?: Date;
  refCount?: number;
  uploadedBy?: string;
}): Promise<string> {
  const doc = await Media.create({
    key: args.key,
    url: `https://mock-cdn.test/${args.key}`,
    mimeType: 'image/jpeg',
    size: 100,
    purpose: args.purpose ?? 'article_cover',
    uploadedBy: '6a00000000000000000000ff',
    refCount: args.refCount ?? 0,
  });
  if (args.createdAt) {
    // Bypass Mongoose's `timestamps` middleware via the raw collection so
    // the backdate sticks; `Media.updateOne` would re-stamp `updatedAt`
    // and on some driver versions also re-touch `createdAt`.
    await Media.collection.updateOne({ _id: doc._id }, { $set: { createdAt: args.createdAt } });
  }
  return doc._id.toString();
}

describe('media sweeper', () => {
  it('sweeps orphans past the grace cutoff and audits each deletion', async () => {
    // Old orphan: 2 hours old, refCount 0 → eligible.
    const oldOrphanId = await seedOrphan({
      key: 'uploads/article_cover/old.jpg',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    const result = await sweepOrphansOnce({ graceMs: 60 * 60 * 1000, batchSize: 10 });

    expect(result.scanned).toBe(1);
    expect(result.swept).toBe(1);
    expect(result.s3Failures).toBe(0);

    const stillThere = await Media.findById(oldOrphanId);
    expect(stillThere).toBeNull();

    // S3 delete was invoked for the swept key.
    expect(s3Mock.__deletedKeys()).toContain('uploads/article_cover/old.jpg');
  });

  it('skips fresh orphans within the grace window (avoids racing the upload happy path)', async () => {
    // Fresh orphan: just created, refCount 0 → should NOT be swept.
    const freshOrphanId = await seedOrphan({
      key: 'uploads/article_cover/fresh.jpg',
      createdAt: new Date(),
    });

    const result = await sweepOrphansOnce({ graceMs: 60 * 60 * 1000, batchSize: 10 });

    expect(result.scanned).toBe(0);
    expect(result.swept).toBe(0);

    const stillThere = await Media.findById(freshOrphanId);
    expect(stillThere).not.toBeNull();
  });

  it('skips referenced media (refCount > 0) regardless of age', async () => {
    // Old AND referenced: refCount = 1 → should NOT be swept.
    const referencedId = await seedOrphan({
      key: 'uploads/article_cover/linked.jpg',
      createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000),
      refCount: 1,
    });

    const result = await sweepOrphansOnce({ graceMs: 60 * 60 * 1000, batchSize: 10 });

    expect(result.scanned).toBe(0);
    expect(result.swept).toBe(0);

    const stillThere = await Media.findById(referencedId);
    expect(stillThere).not.toBeNull();
  });

  it('still drops the Mongo doc when the S3 delete throws (records the failure in audit)', async () => {
    const orphanId = await seedOrphan({
      key: 'uploads/article_cover/s3-flaky.jpg',
      createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });

    // Pin the next delete to throw.
    s3Mock.__setNextDeleteError(new Error('S3 transient error'));

    const result = await sweepOrphansOnce({ graceMs: 60 * 60 * 1000, batchSize: 10 });

    expect(result.scanned).toBe(1);
    expect(result.swept).toBe(1); // Mongo doc was dropped despite S3 failure.
    expect(result.s3Failures).toBe(1);

    const stillThere = await Media.findById(orphanId);
    expect(stillThere).toBeNull();
  });

  it('respects the batch size on a backlog larger than one tick', async () => {
    // Seed 5 old orphans; sweep with batchSize 2 → only 2 swept.
    for (let i = 0; i < 5; i += 1) {
      await seedOrphan({
        key: `uploads/article_cover/batch-${i}.jpg`,
        createdAt: new Date(Date.now() - (3 + i) * 60 * 60 * 1000),
      });
    }

    const result = await sweepOrphansOnce({ graceMs: 60 * 60 * 1000, batchSize: 2 });

    expect(result.scanned).toBe(2);
    expect(result.swept).toBe(2);

    const remaining = await Media.find({ refCount: 0 }).countDocuments();
    expect(remaining).toBe(3);
  });
});
