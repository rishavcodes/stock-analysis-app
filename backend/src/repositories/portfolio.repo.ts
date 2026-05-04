import { Prisma, type Portfolio } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository for the Postgres `portfolio` table.
 *
 * Mongoose used ObjectId strings; Prisma uses Int autoincrement. Routes pass
 * the path param as a string, so the service layer should call `parseId()`
 * before anything that needs the numeric id.
 */

/**
 * Parse a route `:id` into a positive integer. Throws nothing — returns null
 * on bad input so callers can return 404 with a clean message.
 */
export function parseIntId(idStr: string): number | null {
  const n = Number(idStr);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export const portfolioRepo = {
  /** All ACTIVE positions. */
  findActive(): Promise<Portfolio[]> {
    return prisma.portfolio.findMany({ where: { status: 'ACTIVE' } });
  },

  /** ACTIVE positions that have a stopLoss set — drives auto-stop alerts. */
  findActiveWithStopLoss(): Promise<Portfolio[]> {
    return prisma.portfolio.findMany({
      where: { status: 'ACTIVE', stopLoss: { not: null } },
    });
  },

  /** Single row by id, or null. */
  findById(id: number): Promise<Portfolio | null> {
    return prisma.portfolio.findUnique({ where: { id } });
  },

  /** Insert a new holding. */
  create(data: Prisma.PortfolioCreateInput): Promise<Portfolio> {
    return prisma.portfolio.create({ data });
  },

  /**
   * Update fields on an existing holding. Returns null if the id doesn't
   * exist (callers translate that into a 404). Avoids `update`'s P2025 throw
   * by going through `updateMany` + `findUnique`.
   */
  async update(id: number, data: Prisma.PortfolioUpdateInput): Promise<Portfolio | null> {
    const result = await prisma.portfolio.updateMany({ where: { id }, data });
    if (result.count === 0) return null;
    return prisma.portfolio.findUnique({ where: { id } });
  },

  /** Delete by id. Returns true iff a row was actually deleted. */
  async delete(id: number): Promise<boolean> {
    const result = await prisma.portfolio.deleteMany({ where: { id } });
    return result.count > 0;
  },
};

export type { Portfolio };
