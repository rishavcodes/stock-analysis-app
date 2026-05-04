import type { Candle } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository for the Postgres `candles` hypertable. The hypertable partitions
 * rows by `timestamp`, so range filters on timestamp benefit from chunk
 * exclusion automatically — callers don't need to think about it.
 *
 * Method names describe the access pattern, not the SQL. Every read is keyed
 * by (stockToken, interval) at minimum to hit the composite primary key.
 */
export const candleRepo = {
  /**
   * Most recent N candles for a (stockToken, interval), newest first.
   * Used for charting (last 365), indicator computation (200), correlation
   * lookback, and AI-prompt context (60).
   */
  findRecent(stockToken: string, interval: string, limit: number): Promise<Candle[]> {
    return prisma.candle.findMany({
      where: { stockToken, interval },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });
  },

  /** All candles for a (stockToken, interval), oldest first — backtest replay. */
  findAllAsc(stockToken: string, interval: string): Promise<Candle[]> {
    return prisma.candle.findMany({
      where: { stockToken, interval },
      orderBy: { timestamp: 'asc' },
    });
  },

  /**
   * Candles in the half-open window (fromExclusive, toInclusive], oldest
   * first. Matches the prediction-evaluator's `$gt … $lte` filter exactly.
   */
  findInRange(
    stockToken: string,
    interval: string,
    fromExclusive: Date,
    toInclusive: Date
  ): Promise<Candle[]> {
    return prisma.candle.findMany({
      where: {
        stockToken,
        interval,
        timestamp: { gt: fromExclusive, lte: toInclusive },
      },
      orderBy: { timestamp: 'asc' },
    });
  },

  /**
   * True iff at least one candle exists at or after `timestamp` for the
   * (stockToken, interval). Drives the daily-candle resume check — used
   * to skip stocks already up-to-date instead of refetching.
   */
  async existsOnOrAfter(stockToken: string, interval: string, timestamp: Date): Promise<boolean> {
    const row = await prisma.candle.findFirst({
      where: { stockToken, interval, timestamp: { gte: timestamp } },
      select: { timestamp: true },
    });
    return row !== null;
  },

  /**
   * Bulk-insert candles. Duplicates on (stockToken, interval, timestamp) are
   * silently skipped — safe for our use case because daily OHLCV is final
   * once the trading day closes (we cap fetches at the most recent CLOSED
   * trading day, so no partial bars ever land here).
   *
   * Returns the number of rows actually inserted.
   */
  async bulkUpsert(rows: Array<Omit<Candle, 'createdAt' | 'updatedAt'>>): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await prisma.candle.createMany({ data: rows, skipDuplicates: true });
    return result.count;
  },
};

export type { Candle };
