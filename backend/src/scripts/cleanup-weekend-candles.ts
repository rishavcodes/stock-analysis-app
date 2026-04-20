/**
 * One-shot cleanup: delete any ONE_DAY candle whose timestamp falls on a
 * Saturday or Sunday (IST). These are invariably garbage — NSE is closed on
 * weekends, so such rows come from a misstamped intraday fetch or a prior
 * bug. Removing them unblocks fetchAllDailyCandles' resume logic so the next
 * run backfills the real weekdays.
 *
 * Usage:
 *   RUN_WEEKEND_CLEANUP=1 npx ts-node src/scripts/cleanup-weekend-candles.ts
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { env } from '../config/env';
import { Candle } from '../models/Candle';
import { logger } from '../utils/logger';
import { isTradingDayIST } from '../utils/market-hours';

async function main() {
  if (process.env.RUN_WEEKEND_CLEANUP !== '1') {
    console.error('Refusing to run without RUN_WEEKEND_CLEANUP=1 env flag.');
    process.exit(2);
  }

  await mongoose.connect(env.MONGODB_URI);
  logger.info('Connected to MongoDB for weekend-candle cleanup');

  // Scan all ONE_DAY candles; we can't express "weekend in IST" as a Mongo
  // filter cleanly, so do it in-app.
  const cursor = Candle.find({ interval: 'ONE_DAY' }).select('_id timestamp stockToken').lean().cursor();

  const bogusIds: mongoose.Types.ObjectId[] = [];
  let scanned = 0;
  for await (const row of cursor) {
    scanned++;
    if (!isTradingDayIST(row.timestamp)) {
      bogusIds.push(row._id as mongoose.Types.ObjectId);
    }
  }

  logger.info(`Scanned ${scanned} ONE_DAY candles, found ${bogusIds.length} on non-trading days`);

  if (bogusIds.length > 0) {
    const result = await Candle.deleteMany({ _id: { $in: bogusIds } });
    logger.info(`Deleted ${result.deletedCount} weekend/holiday candle rows`);
  }

  await mongoose.disconnect();
  logger.info('Cleanup complete');
}

main().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
