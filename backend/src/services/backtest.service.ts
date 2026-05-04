import PQueue from 'p-queue';
import type { BacktestRun } from '@prisma/client';
import { backtestRepo } from '../repositories/backtest.repo';
import type { BacktestConfig, BacktestResults, EquityPoint, TradeExitReason } from '../types/backtest.types';
import { stockMetricRepo } from '../repositories/stockmetric.repo';
import { candleRepo } from '../repositories/candle.repo';
import { stockRepo } from '../repositories/stock.repo';
import { logger } from '../utils/logger';

export interface CandleRow {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SimulatedTrade {
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  returnPct: number;
  exitReason: TradeExitReason;
}

export interface SimulateInputs {
  entryPrice: number;
  stopLoss: number;
  target: number;
  entryDate: Date;
  futureCandles: CandleRow[];    // chronological, strictly after entryDate
  technicalScoreByDate?: Map<string, number>;  // YYYY-MM-DD -> technicalScore
  config: Pick<BacktestConfig, 'exitRule' | 'technicalExitThreshold' | 'maxHoldDays' | 'holdDays' | 'slippagePct'>;
}

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Pure: simulate a single trade's exit given future candles and exit rule.
 * Returns null if the window produced no usable exit (no future data).
 */
export function simulateTrade(inputs: SimulateInputs): SimulatedTrade | null {
  const { entryPrice, stopLoss, target, entryDate, futureCandles, technicalScoreByDate, config } = inputs;
  if (futureCandles.length === 0) return null;

  const maxHold = config.exitRule === 'FIXED_HOLD' ? config.holdDays : config.maxHoldDays;
  const window = futureCandles.slice(0, maxHold);

  let exit: { date: Date; price: number; reason: TradeExitReason } | null = null;

  for (let i = 0; i < window.length; i++) {
    const candle = window[i];
    // Intraday: check stop first (pessimistic).
    if (candle.low <= stopLoss) {
      exit = { date: candle.timestamp, price: stopLoss, reason: 'STOP_LOSS_HIT' };
      break;
    }
    if (candle.high >= target) {
      exit = { date: candle.timestamp, price: target, reason: 'TARGET_HIT' };
      break;
    }
    if (config.exitRule === 'TECHNICAL' && technicalScoreByDate) {
      const key = dateKey(candle.timestamp);
      const ts = technicalScoreByDate.get(key);
      if (ts != null && ts < config.technicalExitThreshold) {
        exit = { date: candle.timestamp, price: candle.close, reason: 'TECHNICAL_EXIT' };
        break;
      }
    }
  }

  if (!exit) {
    const last = window[window.length - 1];
    exit = { date: last.timestamp, price: last.close, reason: 'TIME_EXPIRED' };
  }

  const slippage = config.slippagePct / 100;
  const realizedExit = exit.price * (1 - slippage); // bias exit lower to penalize
  const realizedEntry = entryPrice * (1 + slippage); // bias entry higher
  const returnPct = ((realizedExit - realizedEntry) / realizedEntry) * 100;

  return {
    entryDate,
    entryPrice: realizedEntry,
    exitDate: exit.date,
    exitPrice: realizedExit,
    returnPct,
    exitReason: exit.reason,
  };
}

/** Compute summary metrics from a trade list + equity curve. Pure. */
export function computeMetrics(trades: SimulatedTrade[], equityCurve: EquityPoint[]): Omit<BacktestResults, 'equityCurve' | 'notes'> {
  const wins = trades.filter((t) => t.returnPct > 0).length;
  const losses = trades.filter((t) => t.returnPct <= 0).length;
  const totalTrades = trades.length;
  const graded = wins + losses;
  const winRate = graded > 0 ? wins / graded : 0;
  const avgReturnPct =
    totalTrades > 0 ? trades.reduce((s, t) => s + t.returnPct, 0) / totalTrades : 0;

  // Max drawdown from equity curve
  let peak = equityCurve[0]?.equity ?? 0;
  let maxDD = 0;
  for (const p of equityCurve) {
    if (p.equity > peak) peak = p.equity;
    if (peak > 0) {
      const dd = (peak - p.equity) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }

  // Daily returns from equity curve for Sharpe (annualized).
  const dailyReturns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1].equity;
    if (prev > 0) dailyReturns.push((equityCurve[i].equity - prev) / prev);
  }
  let sharpe = 0;
  if (dailyReturns.length >= 2) {
    const mean = dailyReturns.reduce((s, v) => s + v, 0) / dailyReturns.length;
    const variance = dailyReturns.reduce((s, v) => s + (v - mean) ** 2, 0) / dailyReturns.length;
    const stdDev = Math.sqrt(variance);
    sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0;
  }

  return { winRate, avgReturnPct, maxDrawdown: maxDD, sharpe, totalTrades, wins, losses };
}

export class BacktestService {
  private queue = new PQueue({ concurrency: 1 });

  /** Enqueue a run; returns immediately with a PENDING record. */
  async enqueue(config: BacktestConfig): Promise<BacktestRun> {
    const run = await backtestRepo.createRun(config);
    this.queue.add(() => this.execute(run.id)).catch((err) => {
      logger.error(`Backtest queue error for ${run.id}:`, err);
    });
    return run;
  }

  /** Actually execute a queued run. */
  private async execute(runId: number): Promise<void> {
    const run = await backtestRepo.findRunById(runId);
    if (!run) {
      logger.error(`Backtest run ${runId} not found`);
      return;
    }
    await backtestRepo.updateRun(runId, { status: 'RUNNING', startedAt: new Date() });

    try {
      const results = await this.runInternal(run);
      await backtestRepo.updateRun(runId, {
        status: 'DONE',
        results,
        completedAt: new Date(),
      });
      logger.info(`Backtest ${runId} DONE: trades=${results.totalTrades} winRate=${(results.winRate * 100).toFixed(1)}%`);
    } catch (error: any) {
      logger.error(`Backtest ${runId} FAILED:`, error);
      await backtestRepo.updateRun(runId, {
        status: 'FAILED',
        error: error?.message ?? String(error),
        completedAt: new Date(),
      });
    }
  }

  /** Core simulation loop. Separated for readability. */
  private async runInternal(run: BacktestRun): Promise<BacktestResults> {
    // Postgres stores `config` as jsonb; the typed shape is owned by the
    // BacktestConfig interface and never modified through the column.
    const cfg = run.config as unknown as BacktestConfig;
    const notes: string[] = [];

    if (!cfg.useHistoricalSectors) {
      notes.push('useHistoricalSectors=false: sector dimension excluded from entry scoring.');
    }
    notes.push('Universe derived from StockMetric rows in range (survivorship bias: only stocks present in the DB for the window).');

    // Iterate trading days in range. Use StockMetric distinct dates as the day axis.
    const tradingDays = await stockMetricRepo.distinctDatesInRange(cfg.from, cfg.to);

    const stocks = await stockRepo.findAllNonIndex();
    const tokenBySymbol = new Map(stocks.map((s) => [s.symbol, s.token]));
    const sectorBySymbol = new Map(stocks.map((s) => [s.symbol, s.sector]));

    const openPositions = new Map<string, { entryDate: Date; entryPrice: number; stopLoss: number; target: number; atr: number; score: number; qty: number }>();
    const trades: SimulatedTrade[] = [];
    const tradeRows: any[] = [];
    let equity = cfg.capital;
    const equityCurve: EquityPoint[] = [];

    // Pre-cache candles per stock as we encounter them.
    const candleCache = new Map<string, CandleRow[]>();
    const loadCandles = async (symbol: string): Promise<CandleRow[]> => {
      if (candleCache.has(symbol)) return candleCache.get(symbol)!;
      const token = tokenBySymbol.get(symbol);
      if (!token) return [];
      const candles = await candleRepo.findAllAsc(token, 'ONE_DAY');
      const rows = candles.map((c) => ({
        timestamp: c.timestamp,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      candleCache.set(symbol, rows);
      return rows;
    };

    for (const day of tradingDays) {
      // Check exits first for any open positions.
      for (const [sym, pos] of [...openPositions.entries()]) {
        const allCandles = await loadCandles(sym);
        const futureCandles = allCandles.filter((c) => c.timestamp > pos.entryDate);
        if (futureCandles.length === 0) continue;

        // Build technicalScoreByDate for TECHNICAL exits (bounded to dates <= current day).
        const metricRows = await stockMetricRepo.findTechnicalScoreInRange(sym, pos.entryDate, day);
        const tsMap = new Map(metricRows.map((m) => [dateKey(m.date), m.technicalScore]));

        const sim = simulateTrade({
          entryPrice: pos.entryPrice,
          stopLoss: pos.stopLoss,
          target: pos.target,
          entryDate: pos.entryDate,
          futureCandles,
          technicalScoreByDate: tsMap,
          config: cfg,
        });

        if (sim && sim.exitDate <= day) {
          trades.push(sim);
          const pnl = (sim.exitPrice - sim.entryPrice) * pos.qty;
          equity += pnl;
          tradeRows.push({
            runId: run.id,
            symbol: sym,
            sector: sectorBySymbol.get(sym) ?? 'Unknown',
            entryDate: sim.entryDate,
            entryPrice: sim.entryPrice,
            exitDate: sim.exitDate,
            exitPrice: sim.exitPrice,
            returnPct: sim.returnPct,
            exitReason: sim.exitReason,
            scoreAtEntry: pos.score,
            qty: pos.qty,
          });
          openPositions.delete(sym);
        }
      }

      // Then check for new entries (lookahead-safe: StockMetric.date <= day).
      if (openPositions.size < cfg.maxConcurrentPositions) {
        const candidates = await stockMetricRepo.findCandidatesOnDateAboveScore(day, cfg.scoreThreshold);

        for (const cand of candidates) {
          if (openPositions.size >= cfg.maxConcurrentPositions) break;
          if (openPositions.has(cand.symbol)) continue;

          const allCandles = await loadCandles(cand.symbol);
          // Entry at NEXT trading day's open (first candle strictly after `day`).
          const nextCandle = allCandles.find((c) => c.timestamp > day);
          if (!nextCandle) continue;

          const atr = cand.atr14 && cand.atr14 > 0 ? cand.atr14 : nextCandle.open * 0.02; // 2% fallback
          const entryPrice = nextCandle.open;
          const stopLoss = entryPrice - atr * cfg.stopLossAtrMultiple;
          const target = entryPrice + atr * cfg.targetAtrMultiple;

          const positionValue = (equity * cfg.positionSizePct) / 100;
          const qty = Math.floor(positionValue / entryPrice);
          if (qty <= 0) continue;

          openPositions.set(cand.symbol, {
            entryDate: nextCandle.timestamp,
            entryPrice,
            stopLoss,
            target,
            atr,
            score: cand.finalScore,
            qty,
          });
        }
      }

      equityCurve.push({ date: day, equity });
    }

    // Force-close any remaining open positions at the last day's close.
    for (const [sym, pos] of openPositions) {
      const allCandles = await loadCandles(sym);
      const futureCandles = allCandles.filter((c) => c.timestamp > pos.entryDate);
      if (futureCandles.length === 0) continue;
      const last = futureCandles[Math.min(futureCandles.length - 1, cfg.maxHoldDays - 1)];
      const sim: SimulatedTrade = {
        entryDate: pos.entryDate,
        entryPrice: pos.entryPrice * (1 + cfg.slippagePct / 100),
        exitDate: last.timestamp,
        exitPrice: last.close * (1 - cfg.slippagePct / 100),
        returnPct: ((last.close * (1 - cfg.slippagePct / 100) - pos.entryPrice * (1 + cfg.slippagePct / 100)) / (pos.entryPrice * (1 + cfg.slippagePct / 100))) * 100,
        exitReason: 'TIME_EXPIRED',
      };
      trades.push(sim);
      equity += (sim.exitPrice - sim.entryPrice) * pos.qty;
      tradeRows.push({
        runId: run.id,
        symbol: sym,
        sector: sectorBySymbol.get(sym) ?? 'Unknown',
        entryDate: sim.entryDate,
        entryPrice: sim.entryPrice,
        exitDate: sim.exitDate,
        exitPrice: sim.exitPrice,
        returnPct: sim.returnPct,
        exitReason: sim.exitReason,
        scoreAtEntry: pos.score,
        qty: pos.qty,
      });
    }

    if (tradeRows.length > 0) {
      await backtestRepo.insertTrades(tradeRows);
    }

    const summary = computeMetrics(trades, equityCurve);
    return { ...summary, equityCurve, notes };
  }
}
