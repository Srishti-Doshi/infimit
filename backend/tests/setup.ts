/**
 * Jest setup — runs ONCE before any test file is imported.
 *
 * Hardcodes a minimal valid env so config/env.ts passes Zod validation
 * without needing a real .env in CI. Per-test overrides can be done via
 * resetEnvForTests() + process.env mutation in the test file.
 */
process.env.NODE_ENV = 'test';
process.env.PORT = '4001';
process.env.LOG_LEVEL = 'warn';
process.env.MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/infimit_test';
process.env.REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-32chars-minimum-aaaaa';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-32chars-minimum-aaaa';
process.env.AI_SERVICE_URL = 'http://localhost:8000';
process.env.AI_INTERNAL_KEY = 'test-internal-key';
process.env.CORS_ORIGINS = 'http://localhost:5173';
