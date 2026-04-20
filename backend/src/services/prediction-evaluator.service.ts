import { AnalysisLog, IAnalysisLog, IPredictionOutcome, PredictionExitReason, PredictionResult } from '../models/AnalysisLog';
import { Stock } from '../models/Stock';
import { Candle } from '../models/Candle';
import { HORIZON_DAYS, NEUTRAL_THRESHOLD_PCT } from '../config/constants';
import { logger } from '../utils/logger';

type CandleRow = { timestamp: Date; open: number; high: number; low: number; close: number };

export interface EvaluationInput {
  analysisDate: Date;
  timeHorizon: keyof typeof HORIZON_DAYS;
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
}

/**
 * Pure function: given a log's exit rules and the candles that follow its analysisDate
 * (chronological, strictly after analysisDate), compute the outcome.
 * Kept pure so it can be unit-tested without mongo.
 */
export function evaluateCandles(
  input: EvaluationInput,
  futureCandles: CandleRow[],
  now: Date = new Date()
): IPredictionOutcome {
  const horizonDays = HORIZON_DAYS[input.timeHorizon];
  const horizonEnd = new Date(input.analysisDate.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  // Too early: horizon hasn't elapsed yet.
  if (now < horizonEnd) {
    return { evaluated: false };
  }

  // No exit rules to grade against.
  if (input.entryPrice == null || input.targetPrice == null || input.stopLoss == null) {
    return {
      evaluated: true,
      result: 'UNEVALUABLE',
      exitReason: 'NO_EXIT_RULES',
      evaluatedAt: now,
    };
  }

  const candlesInWindow = futureCandles.filter((c) => c.timestamp > input.analysisDate && c.timestamp <= horizonEnd);
  if (candlesInWindow.length < 5) {
    return {
      evaluated: true,
      result: 'UNEVALUABLE',
      exitReason: 'INSUFFICIENT_DATA',
      evaluatedAt: now,
    };
  }

  const { entryPrice, targetPrice, stopLoss } = input;

  for (const candle of candlesInWindow) {
    const hitTarget = candle.high >= targetPrice;
    const hitStop = candle.low <= stopLoss;
    if (hitTarget || hitStop) {
      const sameCandleHit = hitTarget && hitStop;
      // Same-candle ambiguity resolved pessimistically: treat as LOSS.
      const exitReason: PredictionExitReason = hitStop && (!hitTarget || sameCandleHit)
        ? 'STOP_LOSS_HIT'
        : 'TARGET_HIT';
      const exitPrice = exitReason === 'TARGET_HIT' ? targetPrice : stopLoss;
      const returnPct = ((exitPrice - entryPrice) / entryPrice) * 100;
      const result: PredictionResult = exitReason === 'TARGET_HIT' ? 'WIN' : 'LOSS';
      return {
        evaluated: true,
        result,
        returnPct,
        exitPrice,
        exitReason,
        sameCandleHit,
        evaluatedAt: now,
      };
    }
  }

  // Time expired without hit.
  const lastClose = candlesInWindow[candlesInWindow.length - 1].close;
  const returnPct = ((lastClose - entryPrice) / entryPrice) * 100;
  let result: PredictionResult = 'NEUTRAL';
  if (returnPct >= NEUTRAL_THRESHOLD_PCT) result = 'WIN';
  else if (returnPct <= -NEUTRAL_THRESHOLD_PCT) result = 'LOSS';

  return {
    evaluated: true,
    result,
    returnPct,
    exitPrice: lastClose,
    exitReason: 'TIME_EXPIRED',
    evaluatedAt: now,
  };
}

export class PredictionEvaluatorService {
  /** Evaluate all unevaluated AnalysisLog rows whose horizon has elapsed. */
  async evaluateAll(now: Date = new Date()): Promise<{ evaluated: number; skipped: number }> {
    const candidates = await AnalysisLog.find({
      'predictionOutcome.evaluated': { $ne: true },
    })
      .sort({ analysisDate: 1 })
      .lean();

    if (candidates.length === 0) {
      logger.info('PredictionEvaluator: no unevaluated logs');
      return { evaluated: 0, skipped: 0 };
    }

    // Bulk-load stock tokens.
    const symbols = [...new Set(candidates.map((c) => c.symbol))];
    const stocks = await Stock.find({ symbol: { $in: symbols } }).lean();
    const tokenMap = new Map(stocks.map((s) => [s.symbol, s.token]));

    let evaluated = 0;
    let skipped = 0;

    for (const log of candidates) {
      const horizonDays = HORIZON_DAYS[log.timeHorizon as keyof typeof HORIZON_DAYS];
      const horizonEnd = new Date(log.analysisDate.getTime() + horizonDays * 24 * 60 * 60 * 1000);
      if (now < horizonEnd) {
        skipped++;
        continue;
      }

      const token = tokenMap.get(log.symbol);
      if (!token) {
        logger.warn(`PredictionEvaluator: no stock token for ${log.symbol}, marking INSUFFICIENT_DATA`);
        await AnalysisLog.updateOne(
          { _id: log._id },
          {
            $set: {
              'predictionOutcome.evaluated': true,
              'predictionOutcome.result': 'UNEVALUABLE',
              'predictionOutcome.exitReason': 'INSUFFICIENT_DATA',
              'predictionOutcome.evaluatedAt': now,
            },
          }
        );
        evaluated++;
        continue;
      }

      const candles = await Candle.find({
        stockToken: token,
        interval: 'ONE_DAY',
        timestamp: { $gt: log.analysisDate, $lte: horizonEnd },
      })
        .sort({ timestamp: 1 })
        .lean();

      const outcome = evaluateCandles(
        {
          analysisDate: log.analysisDate,
          timeHorizon: log.timeHorizon as keyof typeof HORIZON_DAYS,
          entryPrice: log.entryPrice,
          targetPrice: log.targetPrice,
          stopLoss: log.stopLoss,
        },
        candles,
        now
      );

      if (!outcome.evaluated) {
        skipped++;
        continue;
      }

      await AnalysisLog.updateOne({ _id: log._id }, { $set: { predictionOutcome: outcome } });
      evaluated++;
    }

    logger.info(`PredictionEvaluator: evaluated=${evaluated} skipped=${skipped}`);
    return { evaluated, skipped };
  }
}
