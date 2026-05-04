import { Router, Request, Response, NextFunction } from 'express';
import { AnalysisLog } from '../models/AnalysisLog';
import { stockRepo } from '../repositories/stock.repo';

const router = Router();

type GroupKey = 'recommendation' | 'sector' | 'month' | 'timeHorizon';

/** GET /api/analytics/accuracy — prediction outcome aggregates. */
router.get('/accuracy', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { from, to, recommendation, sector, groupBy } = req.query as Record<string, string | undefined>;

    const match: Record<string, unknown> = {
      'predictionOutcome.evaluated': true,
    };
    if (from || to) {
      const dateFilter: Record<string, Date> = {};
      if (from) dateFilter.$gte = new Date(from);
      if (to) dateFilter.$lte = new Date(to);
      match.analysisDate = dateFilter;
    }
    if (recommendation) match.recommendation = recommendation;

    // Sector filter requires joining Stock by symbol. Build a symbol list from Stock first.
    if (sector) {
      const stocks = await stockRepo.findSymbolsBySector(sector);
      match.symbol = { $in: stocks.map((s) => s.symbol) };
    }

    const logs = await AnalysisLog.find(match).select(
      'symbol recommendation timeHorizon analysisDate predictionOutcome'
    ).lean();

    const overall = summarize(logs);

    let breakdowns: Array<{ key: string } & ReturnType<typeof summarize>> = [];
    if (groupBy) {
      const group = groupBy as GroupKey;
      const sectorBySymbol = new Map<string, string>();
      if (group === 'sector') {
        const allSymbols = [...new Set(logs.map((l) => l.symbol))];
        const stocks = await stockRepo.findManyBySymbolsWithSector(allSymbols);
        stocks.forEach((s) => sectorBySymbol.set(s.symbol, s.sector));
      }
      const bucket = new Map<string, typeof logs>();
      for (const log of logs) {
        const key = keyFor(group, log, sectorBySymbol);
        if (!bucket.has(key)) bucket.set(key, []);
        bucket.get(key)!.push(log);
      }
      breakdowns = [...bucket.entries()]
        .map(([key, rows]) => ({ key, ...summarize(rows) }))
        .sort((a, b) => b.total - a.total);
    }

    res.json({ success: true, data: { overall, breakdowns } });
  } catch (error) {
    next(error);
  }
});

function keyFor(
  group: GroupKey,
  log: { symbol: string; recommendation: string; timeHorizon: string; analysisDate: Date },
  sectorBySymbol: Map<string, string>
): string {
  switch (group) {
    case 'recommendation':
      return log.recommendation;
    case 'sector':
      return sectorBySymbol.get(log.symbol) ?? 'Unknown';
    case 'timeHorizon':
      return log.timeHorizon;
    case 'month': {
      const d = new Date(log.analysisDate);
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
  }
}

function summarize(logs: Array<{ predictionOutcome: { result?: string; returnPct?: number } }>) {
  let win = 0;
  let loss = 0;
  let neutral = 0;
  let unevaluable = 0;
  let returnSum = 0;
  let returnCount = 0;
  for (const log of logs) {
    const r = log.predictionOutcome?.result;
    if (r === 'WIN') win++;
    else if (r === 'LOSS') loss++;
    else if (r === 'NEUTRAL') neutral++;
    else if (r === 'UNEVALUABLE') unevaluable++;
    if (typeof log.predictionOutcome?.returnPct === 'number') {
      returnSum += log.predictionOutcome.returnPct;
      returnCount++;
    }
  }
  const graded = win + loss;
  return {
    total: logs.length,
    win,
    loss,
    neutral,
    unevaluable,
    winRate: graded > 0 ? win / graded : 0,
    avgReturnPct: returnCount > 0 ? returnSum / returnCount : 0,
  };
}

export default router;
