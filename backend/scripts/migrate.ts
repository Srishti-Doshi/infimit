/**
 * Index migration — idempotent index ensure for every Mongoose model.
 *
 * Walks every model declared in the modules and calls `Model.syncIndexes()`,
 * which:
 *   - Creates indexes that exist in the schema but not in the collection.
 *   - Drops indexes that exist in the collection but not in the schema.
 *   - Returns the list of operations performed for visibility.
 *
 * Mongoose's `autoIndex: true` (set in `config/db.ts` for non-production)
 * builds indexes implicitly at model-load time. This script is the explicit
 * production path: run it once before traffic starts on a fresh cluster.
 * Idempotent — safe to re-run.
 *
 * Run with:  npx tsx scripts/migrate.ts
 * Or:        npm run migrate
 */
import type { Model } from 'mongoose';

import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/config/db';
import { logger } from '../src/config/logger';

import { Article } from '../src/modules/articles/model';
import { Comment } from '../src/modules/comments/model';
import { Media } from '../src/modules/media/model';
import { Organisation } from '../src/modules/organisations/model';
import { Session } from '../src/modules/auth/model';
import { User } from '../src/modules/users/model';

interface RegisteredModel {
  readonly name: string;
  readonly model: Model<unknown>;
}

const MODELS: RegisteredModel[] = [
  { name: 'User', model: User as Model<unknown> },
  { name: 'Organisation', model: Organisation as Model<unknown> },
  { name: 'Session', model: Session as Model<unknown> },
  { name: 'Article', model: Article as Model<unknown> },
  { name: 'Media', model: Media as Model<unknown> },
  { name: 'Comment', model: Comment as Model<unknown> },
];

async function syncModel(entry: RegisteredModel): Promise<void> {
  const ops = await entry.model.syncIndexes({ background: true });
  logger.info({ model: entry.name, ops }, 'migrate_sync_indexes');
}

async function main(): Promise<void> {
  loadEnv();
  await connectMongo();
  logger.info('migrate_started');

  // Sequential so the audit log lists models in a predictable order; the
  // operations themselves are fast (index DDL only).
  for (const entry of MODELS) {
    // eslint-disable-next-line no-await-in-loop
    await syncModel(entry);
  }

  logger.info({ models: MODELS.map((m) => m.name) }, 'migrate_completed');
  await disconnectMongo();
}

main().catch((err) => {
  logger.error({ err }, 'migrate_failed');
  process.exit(1);
});
