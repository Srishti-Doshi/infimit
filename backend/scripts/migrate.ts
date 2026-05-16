/**
 * Index migration — STUB. Real migration runs in Subphase 5 to ensure
 * every index declared in docs/04-database-design.md §4.2 is present.
 *
 * Run with:  npx tsx scripts/migrate.ts
 */
import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/config/db';
import { logger } from '../src/config/logger';

async function main(): Promise<void> {
  loadEnv();
  await connectMongo();
  logger.info('migrate_started');
  // Subphase 5: iterate registered Mongoose models and call .ensureIndexes().
  logger.info('migrate_noop_until_subphase_5');
  await disconnectMongo();
}

main().catch((err) => {
  logger.error({ err }, 'migrate_failed');
  process.exit(1);
});
