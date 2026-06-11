/**
 * Verify-indexes — Sub-PR 5-e.
 *
 * Audits the live MongoDB collections against every model's schema-declared
 * indexes. For each model:
 *   1. Read `schema.indexes()` → the indexes the codebase EXPECTS.
 *   2. Read `collection.indexes()` → what's ACTUALLY in Mongo.
 *   3. Report missing (in schema, not in DB) + extra (in DB, not in schema).
 *
 * Exits non-zero if any model has missing indexes — designed to fail a
 * deploy gate when migrations slip. Extras are reported but don't fail the
 * run (operators may have legitimately added one outside the schema; the
 * migrate script's `syncIndexes` would drop those, but verify is read-only
 * and shouldn't surprise anyone).
 *
 * Run with:  npx tsx scripts/verify-indexes.ts
 * Or:        npm run verify-indexes
 */
import type { Model } from 'mongoose';

import { loadEnv } from '../src/config/env';
import { connectMongo, disconnectMongo } from '../src/config/db';
import { logger } from '../src/config/logger';

import { MODELS, type RegisteredModel } from './_models';

interface IndexEntry {
  key: Record<string, number | string>;
  options?: Record<string, unknown>;
}

interface VerifyResult {
  model: string;
  expected: number;
  actual: number;
  missing: IndexEntry[];
  extra: IndexEntry[];
}

/** A canonical signature for index equality: sorted JSON of the key spec.
 * Index `name` differs between schema declaration and Mongo's `db.indexes()`
 * output, but the `key` shape is stable. */
function indexSignature(key: Record<string, number | string>): string {
  return JSON.stringify(Object.entries(key).sort());
}

async function verifyModel(entry: RegisteredModel): Promise<VerifyResult> {
  const schemaIndexes = entry.model.schema.indexes();
  const liveIndexes = (await (entry.model as Model<unknown>).collection.indexes()) as {
    key: Record<string, number | string>;
  }[];

  // `_id_` is always present and never declared in schema — ignore it.
  const liveByKey = new Map<string, IndexEntry>();
  for (const idx of liveIndexes) {
    if (idx.key && Object.keys(idx.key)[0] === '_id') continue;
    liveByKey.set(indexSignature(idx.key), idx);
  }

  const schemaByKey = new Map<string, IndexEntry>();
  for (const [key, opts] of schemaIndexes) {
    schemaByKey.set(indexSignature(key), { key, options: opts });
  }

  const missing: IndexEntry[] = [];
  for (const [sig, entry] of schemaByKey) {
    if (!liveByKey.has(sig)) missing.push(entry);
  }

  const extra: IndexEntry[] = [];
  for (const [sig, entry] of liveByKey) {
    if (!schemaByKey.has(sig)) extra.push(entry);
  }

  return {
    model: entry.name,
    expected: schemaByKey.size,
    actual: liveByKey.size,
    missing,
    extra,
  };
}

async function main(): Promise<void> {
  loadEnv();
  await connectMongo();
  logger.info('verify_indexes_started');

  let totalMissing = 0;
  const results: VerifyResult[] = [];

  for (const entry of MODELS) {
    // eslint-disable-next-line no-await-in-loop
    const result = await verifyModel(entry);
    results.push(result);
    totalMissing += result.missing.length;

    if (result.missing.length > 0) {
      logger.error({ model: result.model, missing: result.missing }, 'verify_indexes_missing');
    } else if (result.extra.length > 0) {
      logger.warn({ model: result.model, extra: result.extra }, 'verify_indexes_extra');
    } else {
      logger.info(
        { model: result.model, expected: result.expected, actual: result.actual },
        'verify_indexes_ok',
      );
    }
  }

  await disconnectMongo();

  if (totalMissing > 0) {
    logger.error(
      { totalMissing, models: results.filter((r) => r.missing.length > 0).map((r) => r.model) },
      'verify_indexes_failed',
    );
    process.exit(1);
  }

  logger.info({ models: results.length }, 'verify_indexes_passed');
}

main().catch((err) => {
  logger.error({ err }, 'verify_indexes_failed_unexpectedly');
  process.exit(1);
});
