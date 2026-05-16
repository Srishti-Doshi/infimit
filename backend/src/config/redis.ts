/**
 * Redis client (ioredis) with lazy connect + retry strategy.
 *
 * - lazyConnect=true so importing this module is side-effect-free at boot.
 *   `connectRedis()` performs the explicit `connect()` call.
 * - retryStrategy returns ms backoff; null aborts.
 * - keyPrefix from env keeps cache namespaces isolated across services.
 */
import IORedis, { type Redis } from 'ioredis';
import { loadEnv } from './env';
import { logger } from './logger';

const MAX_RETRY_DELAY_MS = 10_000;

let client: Redis | null = null;

function createClient(): Redis {
  // Read env at client-creation time so tests can override REDIS_URL.
  const env = loadEnv();
  const r = new IORedis(env.REDIS_URL, {
    keyPrefix: env.REDIS_KEY_PREFIX,
    lazyConnect: true,
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    retryStrategy: (times) => Math.min(times * 200, MAX_RETRY_DELAY_MS),
    reconnectOnError: (err) => {
      logger.warn({ err: err.message }, 'redis_reconnect_on_error');
      return true;
    },
  });

  r.on('connect', () => logger.info('redis_connect'));
  r.on('ready', () => logger.info('redis_ready'));
  r.on('error', (err) => logger.error({ err }, 'redis_error'));
  r.on('close', () => logger.warn('redis_close'));
  r.on('end', () => logger.warn('redis_end'));

  return r;
}

/**
 * Get the live Redis client. Auto-creates on first call.
 * Idempotent: subsequent calls return the same instance.
 */
export function getRedis(): Redis {
  if (!client) client = createClient();
  return client;
}

/**
 * Open the Redis connection. Safe to call multiple times.
 * Returns the connected client.
 */
export async function connectRedis(): Promise<Redis> {
  const r = getRedis();
  if (r.status === 'ready' || r.status === 'connect') return r;
  await r.connect();
  return r;
}

/**
 * Liveness probe — used by /readyz.
 */
export async function pingRedis(): Promise<boolean> {
  try {
    const r = getRedis();
    if (r.status !== 'ready') return false;
    const reply = await r.ping();
    return reply === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Close the Redis connection. Used during graceful shutdown.
 */
export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  await client.quit();
  client = null;
  logger.info('redis_disconnected_clean');
}
