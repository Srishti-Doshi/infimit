/**
 * MongoDB connector.
 *
 * Subphase 1 behaviour:
 *  - 3 retries with exponential backoff (1s, 2s, 4s)
 *  - emits connection-lifecycle logs
 *  - exposes a typed `pingMongo()` for /readyz probes
 *
 * Mongoose buffers operations until connected by default; we keep that on
 * for Subphase 1 (no live traffic) and revisit for production tuning.
 */
import mongoose, { type Connection } from 'mongoose';
import { loadEnv } from './env';
import { logger } from './logger';

const env = loadEnv();

const RETRIES = 3;
const BACKOFF_BASE_MS = 1_000;

let connection: Connection | null = null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Connect to MongoDB. Idempotent: subsequent calls return the live connection.
 */
export async function connectMongo(): Promise<Connection> {
  if (connection && connection.readyState === 1) {
    return connection;
  }

  mongoose.set('strictQuery', true);

  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      logger.info({ attempt }, 'mongo_connect_attempt');
      await mongoose.connect(env.MONGO_URI, {
        maxPoolSize: env.MONGO_MAX_POOL_SIZE,
        serverSelectionTimeoutMS: 5_000,
        autoIndex: env.NODE_ENV !== 'production',
      });

      connection = mongoose.connection;
      registerConnectionListeners(connection);
      logger.info({ db: connection.name }, 'mongo_connected');
      return connection;
    } catch (err) {
      const waitMs = BACKOFF_BASE_MS * 2 ** (attempt - 1);
      logger.warn({ err, attempt, nextWaitMs: waitMs }, 'mongo_connect_failed');
      if (attempt === RETRIES) throw err;
      await sleep(waitMs);
    }
  }

  throw new Error('mongo_connect_unreachable');
}

function registerConnectionListeners(conn: Connection): void {
  conn.on('disconnected', () => logger.warn('mongo_disconnected'));
  conn.on('reconnected', () => logger.info('mongo_reconnected'));
  conn.on('error', (err) => logger.error({ err }, 'mongo_error'));
}

/**
 * Cheap liveness probe — used by /readyz.
 * Returns false if disconnected or ping fails.
 */
export async function pingMongo(): Promise<boolean> {
  try {
    if (!connection || connection.readyState !== 1) return false;
    const admin = connection.db?.admin();
    if (!admin) return false;
    await admin.ping();
    return true;
  } catch {
    return false;
  }
}

/**
 * Close the Mongo connection. Used during graceful shutdown.
 */
export async function disconnectMongo(): Promise<void> {
  if (!connection) return;
  await mongoose.disconnect();
  connection = null;
  logger.info('mongo_disconnected_clean');
}
