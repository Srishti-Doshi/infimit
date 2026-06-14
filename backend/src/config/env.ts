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

  // JWT — Subphase 2+ uses RS256 (asymmetric) per docs/10-security.md §10.2.
  // The env vars are PATHS to the PEM files; the JWT helper (shared/crypto/jwt.ts)
  // reads them at boot via loadJwtKeys(). Run `npx tsx scripts/generate-keys.ts`
  // once to materialise the dev keypair files.
  JWT_ACCESS_PRIVATE_KEY_PATH: z.string().default('./keys/access-private.pem'),
  JWT_ACCESS_PUBLIC_KEY_PATH: z.string().default('./keys/access-public.pem'),
  JWT_REFRESH_PRIVATE_KEY_PATH: z.string().default('./keys/refresh-private.pem'),
  JWT_REFRESH_PUBLIC_KEY_PATH: z.string().default('./keys/refresh-public.pem'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),

  // AI service
  AI_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  AI_INTERNAL_KEY: z.string().min(1).default('dev-internal-key'),
  // 10s default suits the merged AI service (remote Groq LLM, ~1-2s/call).
  // The original 2s assumed a local BART model; a cold call measured ~1.6s,
  // too thin against a 2s ceiling. Wired into the ai-proxy axios client AND
  // the opossum breaker (modules/ai-proxy/service.ts).
  AI_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // S3 / object store — Subphase 3 wires presigned uploads.
  // Dev/test point at MinIO via docker-compose.dev.yml (S3_FORCE_PATH_STYLE=true,
  // root credentials minioadmin/minioadmin). Production points at real AWS S3.
  // The client lives in config/s3.ts and is created lazily so missing creds in
  // dev (when media features aren't being exercised) don't break boot.
  S3_ENDPOINT: z.string().optional().default(''),
  S3_REGION: z.string().default('us-east-1'),
  S3_BUCKET: z.string().default(''),
  S3_ACCESS_KEY: z.string().optional().default(''),
  S3_SECRET_KEY: z.string().optional().default(''),
  S3_PUBLIC_BASE_URL: z.string().optional().default(''),
  // MinIO + LocalStack require path-style URLs; real AWS S3 uses virtual-host.
  S3_FORCE_PATH_STYLE: z
    .string()
    .optional()
    .default('false')
    .transform((s) => s === 'true' || s === '1'),
  // TTL for presigned PUT URLs. 300s matches the Subphase 3 doc default; tune
  // if larger uploads outgrow this window.
  S3_PRESIGN_TTL_SEC: z.coerce.number().int().positive().max(3600).default(300),

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
    // Defensive checks for prod-only invariants. JWT key files are validated
    // by loadJwtKeys() at boot (it'll throw if any path is unreadable) — env
    // only verifies the paths are configured.
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
