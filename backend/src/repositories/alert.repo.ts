import { Prisma, type Alert } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository for the Postgres `alerts` table.
 *
 * Mongoose used ObjectId strings; Prisma uses Int autoincrement. Routes pass
 * the path param as a string — handlers parse it before calling delete().
 */
export const alertRepo = {
  /**
   * List alerts, optionally filtered by `isActive`. Sorted newest-first to
   * match the route's previous `.sort({ createdAt: -1 })` behaviour.
   */
  findAll(activeFilter?: boolean): Promise<Alert[]> {
    const where: Prisma.AlertWhereInput = {};
    if (activeFilter !== undefined) where.isActive = activeFilter;
    return prisma.alert.findMany({ where, orderBy: { createdAt: 'desc' } });
  },

  /** Active alerts that haven't fired yet — used by the evaluator loop. */
  findActiveUntriggered(): Promise<Alert[]> {
    return prisma.alert.findMany({ where: { isActive: true, isTriggered: false } });
  },

  /** Insert a new alert. */
  create(data: Prisma.AlertCreateInput): Promise<Alert> {
    return prisma.alert.create({ data });
  },

  /** Mark an alert as triggered with a message. */
  markTriggered(id: number, message: string): Promise<Alert> {
    return prisma.alert.update({
      where: { id },
      data: { isTriggered: true, triggeredAt: new Date(), message },
    });
  },

  /** Delete by id. Returns true iff a row was actually deleted. */
  async delete(id: number): Promise<boolean> {
    const result = await prisma.alert.deleteMany({ where: { id } });
    return result.count > 0;
  },
};

export type { Alert };
