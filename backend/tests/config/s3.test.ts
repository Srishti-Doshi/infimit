/**
 * S3 client config — fail-loud on missing env (Day-13 follow-up from PR #7).
 *
 * The integration tests mock `@/config/s3` at the module boundary so they
 * never exercise `getS3()`'s env validation. This unit test does, isolated
 * via `resetEnvForTests` so we can mutate `process.env` between cases.
 */
import { resetEnvForTests } from '../../src/config/env';
import { getS3, resetS3ForTests } from '../../src/config/s3';

const ORIGINAL_ENV = { ...process.env };

function restoreEnv(): void {
  process.env = { ...ORIGINAL_ENV };
  resetEnvForTests();
  resetS3ForTests();
}

describe('getS3 — env validation', () => {
  beforeEach(() => {
    restoreEnv();
  });

  afterAll(() => {
    restoreEnv();
  });

  it('throws a clear error when S3_BUCKET is empty', () => {
    process.env.S3_BUCKET = '';
    process.env.S3_ACCESS_KEY = 'minioadmin';
    process.env.S3_SECRET_KEY = 'minioadmin';
    resetEnvForTests();
    resetS3ForTests();

    expect(() => getS3()).toThrow(/S3 not configured.*S3_BUCKET/);
  });

  it('throws when access key is empty in non-production', () => {
    process.env.NODE_ENV = 'development';
    process.env.S3_BUCKET = 'infimit-dev';
    process.env.S3_ACCESS_KEY = '';
    process.env.S3_SECRET_KEY = 'something';
    resetEnvForTests();
    resetS3ForTests();

    expect(() => getS3()).toThrow(/S3 not configured.*S3_ACCESS_KEY/);
  });

  it('allows empty credentials in production (IAM role fallback)', () => {
    process.env.NODE_ENV = 'production';
    process.env.S3_BUCKET = 'infimit-prod-media';
    process.env.S3_ACCESS_KEY = '';
    process.env.S3_SECRET_KEY = '';
    // Production needs an AI_INTERNAL_KEY override to satisfy env validation
    // (config/env.ts rejects the dev default in prod).
    process.env.AI_INTERNAL_KEY = 'prod-internal-key-not-dev-default';
    resetEnvForTests();
    resetS3ForTests();

    expect(() => getS3()).not.toThrow();
  });

  it('error message points the operator at the fix', () => {
    process.env.S3_BUCKET = '';
    process.env.S3_ACCESS_KEY = '';
    process.env.S3_SECRET_KEY = '';
    resetEnvForTests();
    resetS3ForTests();

    // The error names what's missing AND tells the operator how to recover.
    // Helps future-Srishti / future-Prince when they pull a fresh branch and
    // their `.env` predates the S3 vars added in Subphase 3.
    expect(() => getS3()).toThrow(/MinIO|docker compose|\.env\.example/);
  });
});
