import type { SectorData } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository for the Postgres `sector_data` table. The Mongoose model used
 * nested objects for top gainer / top loser / advance-decline; here those are
 * flat scalar columns. Callers that need the nested shape (the
 * `/api/market/sectors` response) reassemble it at the route layer.
 */
export const sectorDataRepo = {
  /** Latest sector snapshot for a given sector, or null. */
  findLatestBySector(sector: string): Promise<SectorData | null> {
    return prisma.sectorData.findFirst({
      where: { sector },
      orderBy: { date: 'desc' },
    });
  },

  /** Most recent row per sector, used by `getSectorRankings`. */
  findLatestPerSector(): Promise<SectorData[]> {
    return prisma.sectorData.findMany({
      distinct: ['sector'],
      orderBy: [{ sector: 'asc' }, { date: 'desc' }],
    });
  },

  /**
   * Upsert keyed by (sector, date). Caller passes the full row payload
   * including the flattened top-gainer / top-loser / advance-decline fields.
   */
  upsertOnSectorDate(
    sector: string,
    date: Date,
    data: {
      avgChange: number;
      topGainerSymbol: string;
      topGainerChange: number;
      topLoserSymbol: string;
      topLoserChange: number;
      sectorScore: number;
      stockCount: number;
      advances: number;
      declines: number;
    }
  ): Promise<SectorData> {
    return prisma.sectorData.upsert({
      where: { sector_date: { sector, date } },
      create: { sector, date, ...data },
      update: data,
    });
  },
};

export type { SectorData };
