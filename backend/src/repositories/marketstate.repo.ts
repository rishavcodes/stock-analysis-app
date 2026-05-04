import type { MarketState } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository for the Postgres `market_state` table. One row per trading day —
 * the regime smoother reads the last N rows before today and writes today's
 * resolved regime.
 */
export const marketStateRepo = {
  /**
   * Most recent rows strictly before `date`, newest first, capped at `limit`.
   * Drives the regime-smoothing window.
   */
  findRecentBefore(date: Date, limit: number): Promise<MarketState[]> {
    return prisma.marketState.findMany({
      where: { date: { lt: date } },
      orderBy: { date: 'desc' },
      take: limit,
    });
  },

  /** Upsert today's row keyed by `date`. */
  upsertOnDate(
    date: Date,
    data: { rawRegime: string; regime: string; smoothed: boolean; niftyClose: number }
  ): Promise<MarketState> {
    return prisma.marketState.upsert({
      where: { date },
      create: { date, ...data },
      update: data,
    });
  },
};

export type { MarketState };
