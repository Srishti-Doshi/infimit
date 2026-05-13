/**
 * Database seed — STUB. Real seeding lands in Subphase 2 (admin user,
 * organisations, category enum) and Subphase 5 (demo published articles).
 *
 * Run with:  npx tsx scripts/seed.ts
 */
import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/config/db';
import { logger } from '../src/config/logger';

async function main(): Promise<void> {
  loadEnv();
  await connectMongo();
  logger.info('seed_started');
  // Subphase 2: insert admin user, organisations, categories enum.
  // Subphase 5: insert 3 demo published articles + AI summaries.
  logger.info('seed_noop_until_subphase_2');
  await disconnectMongo();
}

main().catch((err) => {
  logger.error({ err }, 'seed_failed');
  process.exit(1);
});
