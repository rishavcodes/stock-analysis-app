import type { Stock } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository for the Postgres `stocks` table. Wraps Prisma so the rest of the
 * code stays free of ORM details. Method names describe the use case, not the
 * underlying SQL — the call sites read the same way they did with Mongoose.
 */
export const stockRepo = {
  /** Single stock by exact symbol. Returns null if not found. */
  findBySymbol(symbol: string): Promise<Stock | null> {
    return prisma.stock.findUnique({ where: { symbol } });
  },

  /** Full Stock rows for a list of symbols. Order is not guaranteed. */
  findManyBySymbols(symbols: string[]): Promise<Stock[]> {
    if (symbols.length === 0) return Promise.resolve([]);
    return prisma.stock.findMany({ where: { symbol: { in: symbols } } });
  },

  /** Subset projection — only `symbol` + `sector` for analytics joins. */
  findManyBySymbolsWithSector(symbols: string[]): Promise<Array<{ symbol: string; sector: string }>> {
    if (symbols.length === 0) return Promise.resolve([]);
    return prisma.stock.findMany({
      where: { symbol: { in: symbols } },
      select: { symbol: true, sector: true },
    });
  },

  /** All active non-index instruments — the screener / metrics universe. */
  findActiveTradable(): Promise<Stock[]> {
    return prisma.stock.findMany({ where: { isActive: true, isIndex: false } });
  },

  /** Every non-index stock regardless of `isActive` — used by backtest universe. */
  findAllNonIndex(): Promise<Stock[]> {
    return prisma.stock.findMany({ where: { isIndex: false } });
  },

  /** Symbol-only projection for sector filtering in analytics. */
  findSymbolsBySector(sector: string): Promise<Array<{ symbol: string }>> {
    return prisma.stock.findMany({ where: { sector }, select: { symbol: true } });
  },

  /**
   * Upsert by Angel One `token` — used by the daily instrument-master sync.
   * `token` is the natural key Angel uses, so we pivot on it (a single Angel
   * token always maps to one symbol, but symbols can theoretically be re-used
   * across exchanges, so token-uniqueness is the safer pivot).
   */
  upsertByToken(
    token: string,
    data: {
      symbol: string;
      name: string;
      exchange: string;
      segment: string;
      sector: string;
      isin: string;
      lotSize: number;
      isIndex: boolean;
      isActive: boolean;
    }
  ): Promise<Stock> {
    return prisma.stock.upsert({
      where: { token },
      create: { token, lastUpdated: new Date(), ...data },
      update: { lastUpdated: new Date(), ...data },
    });
  },

  /**
   * Update the `sector` for a single symbol. Returns the number of rows
   * actually modified — `updateMany` is used so a missing symbol is a no-op
   * (zero rows) instead of throwing, matching the old Mongoose semantics.
   */
  async updateSectorBySymbol(symbol: string, sector: string): Promise<{ modifiedCount: number }> {
    const result = await prisma.stock.updateMany({ where: { symbol }, data: { sector } });
    return { modifiedCount: result.count };
  },
};

export type { Stock };
