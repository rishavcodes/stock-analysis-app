/**
 * One-shot migration: drop the old unconditional TTL index on AnalysisLog.expiresAt
 * and replace it with a partial index that only expires rows where predictionOutcome.evaluated !== true.
 *
 * Run with: RUN_TTL_MIGRATION=1 npx ts-node src/scripts/migrate-ttl-partial.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { AnalysisLog } from '../models/AnalysisLog';
import { logger } from '../utils/logger';

async function main() {
  if (process.env.RUN_TTL_MIGRATION !== '1') {
    console.error('Refusing to run without RUN_TTL_MIGRATION=1 env flag.');
    process.exit(2);
  }

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to MongoDB for TTL migration');

  const coll = AnalysisLog.collection;
  const indexes = await coll.indexes();
  const oldIndex = indexes.find(
    (idx) => idx.expireAfterSeconds === 0 && !idx.partialFilterExpression
  );

  if (oldIndex) {
    logger.info(`Dropping old TTL index: ${oldIndex.name}`);
    await coll.dropIndex(oldIndex.name!);
  } else {
    logger.info('No unconditional TTL index found (already migrated or never existed)');
  }

  // Ensure mongoose creates the new partial TTL index from the schema definition.
  await AnalysisLog.syncIndexes();
  logger.info('Partial TTL index synced');

  const afterIndexes = await coll.indexes();
  logger.info('Current indexes:', afterIndexes);

  await mongoose.disconnect();
  logger.info('Migration complete');
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
