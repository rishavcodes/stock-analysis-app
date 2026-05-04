import { Prisma, type BacktestRun, type BacktestTrade } from '@prisma/client';
import { prisma } from '../config/prisma';
import type { BacktestConfig, BacktestResults } from '../types/backtest.types';

/**
 * Repository for the Postgres `backtest_runs` and `backtest_trades` tables.
 *
 * The two models are kept in one repo because the trade rows only exist as
 * children of a run — there's no caller that touches one without the other.
 *
 * Note on JSON typing: `config` and `results` are stored as Postgres `jsonb`.
 * Prisma reads them back as `JsonValue`; callers that need the typed shape
 * can cast through the `BacktestConfig` / `BacktestResults` interfaces.
 */

export interface TradeInput {
  runId: number;
  symbol: string;
  sector: string;
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  returnPct: number;
  exitReason: string;
  scoreAtEntry: number;
  qty: number;
}

export const backtestRepo = {
  /** Insert a new run in PENDING state. */
  createRun(config: BacktestConfig): Promise<BacktestRun> {
    return prisma.backtestRun.create({
      data: {
        config: config as unknown as Prisma.InputJsonValue,
        status: 'PENDING',
      },
    });
  },

  /** Single run by id, or null. */
  findRunById(id: number): Promise<BacktestRun | null> {
    return prisma.backtestRun.findUnique({ where: { id } });
  },

  /** Most recent N runs, newest first. */
  listRecentRuns(limit: number): Promise<BacktestRun[]> {
    return prisma.backtestRun.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  },

  /**
   * Update a run's status / lifecycle fields. Replaces Mongoose's
   * `run.<field> = ...; await run.save()` pattern in `BacktestService.execute()`.
   * Accepts the typed `results` shape (cast to JsonValue internally).
   */
  updateRun(
    id: number,
    data: {
      status?: string;
      startedAt?: Date;
      completedAt?: Date;
      error?: string;
      results?: BacktestResults;
    }
  ): Promise<BacktestRun> {
    const update: Prisma.BacktestRunUpdateInput = {};
    if (data.status !== undefined) update.status = data.status;
    if (data.startedAt !== undefined) update.startedAt = data.startedAt;
    if (data.completedAt !== undefined) update.completedAt = data.completedAt;
    if (data.error !== undefined) update.error = data.error;
    if (data.results !== undefined) update.results = data.results as unknown as Prisma.InputJsonValue;
    return prisma.backtestRun.update({ where: { id }, data: update });
  },

  /** Bulk-insert simulated trades. Returns the number of rows inserted. */
  async insertTrades(rows: TradeInput[]): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await prisma.backtestTrade.createMany({ data: rows });
    return result.count;
  },

  /** All trades for a run, sorted by entryDate ASC (matches the route's order). */
  listTradesForRun(runId: number): Promise<BacktestTrade[]> {
    return prisma.backtestTrade.findMany({
      where: { runId },
      orderBy: { entryDate: 'asc' },
    });
  },
};

export type { BacktestRun, BacktestTrade };
