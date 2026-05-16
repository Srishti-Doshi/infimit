/**
 * Environment configuration — single source of truth.
 *
 * Loaded once at boot via `loadEnv()`. The result is a frozen object.
 * No other module should read `process.env` directly.
 *
 * Adding a new var: extend `EnvSchema`, document in `.env.example`,
 * then access via `config.env.<NAME>`.
 */
import 'dotenv/config';
import { z } from 'zod';

const NodeEnv = z.enum(['development', 'test', 'staging', 'production']);

const EnvSchema = z.object({
  // Runtime
  NODE_ENV: NodeEnv.default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  SERVICE_NAME: z.string().default('infimit-backend'),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  // MongoDB
  MONGO_URI: z.string().min(1, 'MONGO_URI is required'),
  MONGO_MAX_POOL_SIZE: z.coerce.number().int().positive().default(20),

  // Redis
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),
  REDIS_KEY_PREFIX: z.string().default('infimit:'),

  // JWT — required as strings; secrets validated for non-trivial length in non-dev
  JWT_ACCESS_SECRET: z.string().min(8),
  JWT_REFRESH_SECRET: z.string().min(8),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // AI service
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AI_INTERNAL_KEY: z.string().min(1).default('dev-internal-key'),
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),

  // S3 (optional in Subphase 1)
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY: z.string().optional().default(''),
  S3_SECRET_KEY: z.string().optional().default(''),
  S3_PUBLIC_BASE_URL: z.string().optional().default(''),

  // Rate limiting
  RATE_LIMIT_GLOBAL_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(300),

  // Observability
  SENTRY_DSN: z.string().optional().default(''),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/**
 * Parse and freeze process.env. Throws a readable error on failure
 * with every offending field listed.
 */
export function loadEnv(): Env {
  if (cached) return cached;

  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    // eslint-disable-next-line no-console
    console.error(`\n❌ Invalid environment configuration:\n${issues}\n`);
    throw new Error('Environment validation failed');
  }

  if (parsed.data.NODE_ENV === 'production') {
    if (parsed.data.JWT_ACCESS_SECRET.length < 32 || parsed.data.JWT_REFRESH_SECRET.length < 32) {
      throw new Error('JWT secrets must be ≥ 32 chars in production');
    }
    if (parsed.data.AI_INTERNAL_KEY === 'dev-internal-key') {
      throw new Error('AI_INTERNAL_KEY must not be the default in production');
    }
  }

  cached = Object.freeze(parsed.data) as Env;
  return cached;
}

/**
 * For tests: reset the cached env so a fresh `loadEnv()` re-reads `process.env`.
 */
export function resetEnvForTests(): void {
  cached = null;
}
