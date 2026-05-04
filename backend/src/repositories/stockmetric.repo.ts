import { Prisma, type StockMetric } from '@prisma/client';
import { prisma } from '../config/prisma';

/**
 * Repository for the Postgres `stock_metrics` table.
 *
 * Most reads return a single row keyed by `(symbol, date)` or "the most recent
 * row for a symbol". The composite unique on `(symbol, date)` is the natural
 * key — the metric-compute pipeline upserts on it daily.
 *
 * The screener method here is the one non-trivial piece: Mongoose used a
 * `$group + $first` aggregate to dedupe to "latest per symbol". Postgres has
 * `DISTINCT ON`, but Prisma exposes that via `distinct` + `orderBy`. With
 * ~2,400 stocks the latest-per-symbol slice is small enough to filter / sort
 * / paginate in memory afterwards. If this table grows past a few hundred
 * thousand rows we should switch to raw SQL with a CTE.
 */
export const stockMetricRepo = {
  /** Latest metric for a single symbol, or null. */
  findLatestBySymbol(symbol: string): Promise<StockMetric | null> {
    return prisma.stockMetric.findFirst({
      where: { symbol },
      orderBy: { date: 'desc' },
    });
  },

  /**
   * One row per symbol — the latest by date. Replaces the Mongoose pattern of
   * `find(...).sort({date:-1})` followed by a Map dedupe in JS.
   */
  findLatestByManySymbols(symbols: string[]): Promise<StockMetric[]> {
    if (symbols.length === 0) return Promise.resolve([]);
    return prisma.stockMetric.findMany({
      where: { symbol: { in: symbols } },
      distinct: ['symbol'],
      orderBy: [{ symbol: 'asc' }, { date: 'desc' }],
    });
  },

  /** Metrics for a list of symbols on a specific date — used for sector aggregation. */
  findOnDateForSymbols(symbols: string[], date: Date): Promise<StockMetric[]> {
    if (symbols.length === 0) return Promise.resolve([]);
    return prisma.stockMetric.findMany({
      where: { symbol: { in: symbols }, date },
    });
  },

  /**
   * Backtest entry candidates: rows on `date` whose finalScore meets the
   * threshold, sorted by finalScore DESC.
   */
  findCandidatesOnDateAboveScore(date: Date, scoreThreshold: number): Promise<StockMetric[]> {
    return prisma.stockMetric.findMany({
      where: { date, finalScore: { gte: scoreThreshold } },
      orderBy: { finalScore: 'desc' },
    });
  },

  /**
   * Backtest exit input: technicalScore-by-date series for one symbol in
   * `(fromExclusive, toInclusive]`, oldest first.
   */
  findTechnicalScoreInRange(
    symbol: string,
    fromExclusive: Date,
    toInclusive: Date
  ): Promise<Array<{ date: Date; technicalScore: number }>> {
    return prisma.stockMetric.findMany({
      where: { symbol, date: { gt: fromExclusive, lte: toInclusive } },
      select: { date: true, technicalScore: true },
      orderBy: { date: 'asc' },
    });
  },

  /** Distinct dates that have any metric in the range — drives backtest day axis. */
  async distinctDatesInRange(from: Date, to: Date): Promise<Date[]> {
    const rows = await prisma.stockMetric.findMany({
      where: { date: { gte: from, lte: to } },
      distinct: ['date'],
      select: { date: true },
      orderBy: { date: 'asc' },
    });
    return rows.map((r) => r.date);
  },

  /**
   * Upsert keyed by (symbol, date). Used by the daily compute pipeline and
   * the manual-fundamentals route. Caller passes the full row payload; we
   * forward the same payload to both the create and the update branches.
   */
  upsertOnSymbolDate(
    symbol: string,
    date: Date,
    data: Omit<Prisma.StockMetricCreateInput, 'symbol' | 'date'>
  ): Promise<StockMetric> {
    return prisma.stockMetric.upsert({
      where: { symbol_date: { symbol, date } },
      create: { symbol, date, ...data },
      update: data,
    });
  },

  /**
   * Apply fundamentals to the most recent metric for a symbol. If no metric
   * exists yet, create today's row instead. Mirrors the Mongoose
   * `findOneAndUpdate({symbol}, ..., {sort: {date:-1}, new: true})` followed
   * by a `create` fallback — but split into two explicit Prisma calls.
   *
   * Not transactional: the same race the original code accepts. If two
   * fundamentals jobs fight over the same symbol on the same day, the
   * second writer's data wins (which is what the original did too).
   */
  async upsertLatestFundamentals(
    symbol: string,
    todayIfNew: Date,
    fundamentals: Prisma.StockMetricUpdateInput
  ): Promise<StockMetric> {
    const latest = await prisma.stockMetric.findFirst({
      where: { symbol },
      orderBy: { date: 'desc' },
    });
    if (latest) {
      return prisma.stockMetric.update({
        where: { id: latest.id },
        data: fundamentals,
      });
    }
    return prisma.stockMetric.create({
      data: { ...(fundamentals as Prisma.StockMetricCreateInput), symbol, date: todayIfNew },
    });
  },

  /**
   * Screener: returns the latest metric per symbol, then applies filter +
   * sort + pagination. Total count is the filtered count (post-filter,
   * pre-pagination) — matches the `$count` pipeline shape callers expect.
   *
   * `symbols`, when set, restricts to that set BEFORE deduping (used to
   * implement the sector filter at the route layer).
   */
  async screenerLatestPerSymbol(args: {
    symbols?: string[];
    minScore?: number;
    maxScore?: number;
    breakoutOnly?: boolean;
    sortBy: string;
    sortOrder: 'asc' | 'desc';
    page: number;
    limit: number;
  }): Promise<{ items: StockMetric[]; total: number }> {
    const where: Prisma.StockMetricWhereInput = {};
    if (args.symbols && args.symbols.length > 0) {
      where.symbol = { in: args.symbols };
    }

    const latestPerSymbol = await prisma.stockMetric.findMany({
      where,
      distinct: ['symbol'],
      orderBy: [{ symbol: 'asc' }, { date: 'desc' }],
    });

    const filtered = latestPerSymbol.filter((m) => {
      if (args.minScore !== undefined && m.finalScore < args.minScore) return false;
      if (args.maxScore !== undefined && m.finalScore > args.maxScore) return false;
      if (args.breakoutOnly && !m.isBreakout) return false;
      return true;
    });

    const sortKey = args.sortBy as keyof StockMetric;
    const dir = args.sortOrder === 'asc' ? 1 : -1;
    filtered.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
      return 0;
    });

    const total = filtered.length;
    const skip = (args.page - 1) * args.limit;
    const items = filtered.slice(skip, skip + args.limit);
    return { items, total };
  },
};

export type { StockMetric };
