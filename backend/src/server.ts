/**
 * HTTP server bootstrap.
 *
 * Lifecycle:
 *   1. Load + validate env (throws on failure)
 *   2. Connect Mongo (3 retries, exponential backoff)
 *   3. Connect Redis
 *   4. Build the Express app
 *   5. Listen on PORT
 *   6. Register graceful shutdown handlers (SIGTERM, SIGINT)
 *
 * Crashes the process on unrecoverable errors (per docs/11-devops.md §11.7).
 * Orchestrator restarts; do not retry inside.
 */
import http from 'node:http';
import { loadEnv } from '@/config/env';
import { logger } from '@/config/logger';
import { connectMongo, disconnectMongo } from '@/config/db';
import { connectRedis, disconnectRedis } from '@/config/redis';
import { createApp } from './app';

const SHUTDOWN_GRACE_MS = 10_000;

async function bootstrap(): Promise<void> {
  const env = loadEnv();

  logger.info({ env: env.NODE_ENV, port: env.PORT }, 'boot_start');

  await connectMongo();
  await connectRedis();

  const app = createApp();
  const server = http.createServer(app);

  await new Promise<void>((resolve) => {
    server.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, 'http_listening');
      resolve();
    });
  });

  registerShutdownHandlers(server);
}

function registerShutdownHandlers(server: http.Server): void {
  let shuttingDown = false;

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.warn({ signal }, 'shutdown_initiated');

    const force = setTimeout(() => {
      logger.error('shutdown_grace_exceeded_force_exit');
      process.exit(1);
    }, SHUTDOWN_GRACE_MS);
    force.unref();

    try {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
      logger.info('http_closed');

      await Promise.allSettled([disconnectMongo(), disconnectRedis()]);
      logger.info('shutdown_complete');
      clearTimeout(force);
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'shutdown_error');
      clearTimeout(force);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  process.on('uncaughtException', (err) => {
    logger.fatal({ err }, 'uncaught_exception');
    process.exit(1);
  });
  process.on('unhandledRejection', (reason) => {
    logger.fatal({ reason }, 'unhandled_rejection');
    process.exit(1);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'boot_failed');
  process.exit(1);
});
