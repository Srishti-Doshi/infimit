/**
 * env.ts unit tests.
 *
 * Validates that the Zod schema:
 *  - rejects missing required vars
 *  - coerces numeric strings (PORT)
 *  - parses comma-separated CORS_ORIGINS into an array
 *  - rejects short JWT secrets in production
 */
import { loadEnv, resetEnvForTests } from '../../src/config/env';

describe('config/env', () => {
  const original = { ...process.env };

  beforeEach(() => {
    resetEnvForTests();
  });

  afterEach(() => {
    process.env = { ...original };
    resetEnvForTests();
  });

  it('loads when all required vars are present', () => {
    const env = loadEnv();
    expect(env.NODE_ENV).toBe('test');
    expect(env.PORT).toBe(4001);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:5173']);
  });

  it('throws when MONGO_URI is missing', () => {
    delete process.env.MONGO_URI;
    expect(() => loadEnv()).toThrow(/Environment validation failed/);
  });

  it('coerces PORT to number', () => {
    process.env.PORT = '5555';
    const env = loadEnv();
    expect(env.PORT).toBe(5555);
    expect(typeof env.PORT).toBe('number');
  });

  it('rejects short JWT secrets in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_ACCESS_SECRET = 'short';
    process.env.JWT_REFRESH_SECRET = 'short';
    expect(() => loadEnv()).toThrow();
  });
});
