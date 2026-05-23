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
// JWT_*_KEY_PATH defaults in env.ts already point at ./keys/*.pem; the tests
// that need real signing call loadJwtKeys() against those files (which CI
// generates via the prebuild step). Override here if a test needs different paths.
process.env.AI_SERVICE_URL = 'http://localhost:8000';
process.env.AI_INTERNAL_KEY = 'test-internal-key';
process.env.CORS_ORIGINS = 'http://localhost:5173';
