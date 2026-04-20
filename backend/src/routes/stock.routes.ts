import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { StockMetric } from '../models/StockMetric';
import { Stock } from '../models/Stock';
import { Candle } from '../models/Candle';
import { AnalysisLog } from '../models/AnalysisLog';
import { AIAnalysisService } from '../services/ai-analysis.service';
import { SmartAPIService } from '../services/smartapi.service';
import { validateQuery, validateBody } from '../middleware/validate';
import { ScreenerQuerySchema, ManualFundamentalsSchema } from '../types/api.types';
import { analysisLimiter } from '../middleware/rate-limiter';
import { logger } from '../utils/logger';

const router = Router();
const aiService = new AIAnalysisService();
const smartApi = new SmartAPIService();

// GET /api/stocks/screener
router.get('/screener', validateQuery(ScreenerQuerySchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { sector, minScore, maxScore, sortBy, sortOrder, breakoutOnly, page, limit } = req.query as any;

    const filter: Record<string, any> = {};
    if (sector) filter.sector = sector;
    if (minScore !== undefined || maxScore !== undefined) {
      filter.finalScore = {};
      if (minScore !== undefined) filter.finalScore.$gte = minScore;
      if (maxScore !== undefined) filter.finalScore.$lte = maxScore;
    }
    if (breakoutOnly) filter.isBreakout = true;

    const basePipeline: mongoose.PipelineStage[] = [
      { $sort: { symbol: 1 as const, date: -1 as const } },
      { $group: { _id: '$symbol', latestMetric: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$latestMetric' } },
    ];

    if (Object.keys(filter).length > 0) {
      basePipeline.push({ $match: filter });
    }

    const dataPipeline: mongoose.PipelineStage[] = [
      ...basePipeline,
      { $sort: { [sortBy || 'finalScore']: sortOrder === 'asc' ? 1 as const : -1 as const } },
      { $skip: ((page || 1) - 1) * (limit || 20) },
      { $limit: limit || 20 },
    ];

    const countPipeline: mongoose.PipelineStage[] = [
      ...basePipeline,
      { $count: 'total' },
    ];

    const [metrics, countResult] = await Promise.all([
      StockMetric.aggregate(dataPipeline),
      StockMetric.aggregate(countPipeline),
    ]);

    // Enrich with stock info
    const symbols = metrics.map((m: any) => m.symbol);
    const stocks = await Stock.find({ symbol: { $in: symbols } }).lean();
    const stockMap = new Map(stocks.map((s) => [s.symbol, s]));

    const enriched = metrics.map((m: any) => ({
      ...m,
      stockInfo: stockMap.get(m.symbol) || null,
    }));

    const total = countResult[0]?.total || 0;

    res.json({
      success: true,
      data: enriched,
      pagination: {
        page: page || 1,
        limit: limit || 20,
        total,
        totalPages: Math.ceil(total / (limit || 20)),
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stocks/:symbol
router.get('/:symbol', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();

    // Fetch stock first to get the Angel One token for candle query
    const stock = await Stock.findOne({ symbol }).lean();
    if (!stock) {
      res.status(404).json({ success: false, error: `Stock ${symbol} not found` });
      return;
    }

    const [latestMetric, candles, latestAnalysis] = await Promise.all([
      StockMetric.findOne({ symbol }).sort({ date: -1 }).lean(),
      Candle.find({ stockToken: stock.token, interval: 'ONE_DAY' })
        .sort({ timestamp: -1 })
        .limit(365)
        .lean(),
      AnalysisLog.findOne({ symbol }).sort({ analysisDate: -1 }).lean(),
    ]);

    let lastPrice: number | null = null;
    // Angel's "FULL" quote returns `close` = previous trading day's close.
    // Use that as the authoritative prevClose, not candles[1], so the change
    // is always relative to yesterday regardless of DB freshness.
    let prevClose: number | null = null;

    try {
      await smartApi.initialize();
      const fullQuote = await smartApi.getFullQuote([stock.token], stock.exchange);
      const row = fullQuote[0];
      if (row) {
        if (typeof row.ltp === 'number' && row.ltp > 0) lastPrice = row.ltp;
        if (typeof row.close === 'number' && row.close > 0) prevClose = row.close;
      }
    } catch (error) {
      logger.warn(`Could not fetch FULL quote for ${symbol}, falling back to LTP + candles[1]`);
    }

    // Fallback 1: try plain LTP if FULL didn't return a price.
    if (lastPrice == null) {
      try {
        const ltpMap = await smartApi.getLTP([stock.token], stock.exchange);
        lastPrice = ltpMap.get(stock.token) ?? null;
      } catch {
        // swallow; next fallback uses candles.
      }
    }

    // Fallback 2: last candle close if live is unavailable.
    if (lastPrice == null && candles.length > 0) {
      lastPrice = candles[0].close;
    }

    // Fallback for prevClose: candles[1] (best-effort). Only used when broker quote
    // failed; will be stale if the candle job is behind, so treat as last resort.
    if (prevClose == null && candles.length > 1) {
      prevClose = candles[1].close;
    }

    const change = lastPrice != null && prevClose != null ? lastPrice - prevClose : null;
    const changePercent = lastPrice != null && prevClose != null && prevClose > 0
      ? ((lastPrice - prevClose) / prevClose) * 100
      : null;

    res.json({
      success: true,
      data: {
        stock,
        metrics: latestMetric,
        candles: candles.reverse(), // oldest first for charts
        analysis: latestAnalysis,
        lastPrice,
        prevClose,
        change,
        changePercent,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/stocks/:symbol/analysis — trigger AI analysis
router.get('/:symbol/analysis', analysisLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    const force = req.query.force === 'true';
    const analysis = await aiService.analyzeStock(symbol, force);
    res.json({ success: true, data: analysis });
  } catch (error) {
    next(error);
  }
});

// GET /api/stocks/analysis/:id/trace — decision trace for an AnalysisLog row
router.get('/analysis/:id/trace', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = req.params.id as string;
    if (!mongoose.isValidObjectId(id)) {
      res.status(400).json({ success: false, error: 'Invalid analysis id' });
      return;
    }
    const log = await AnalysisLog.findById(id).lean();
    if (!log) {
      res.status(404).json({ success: false, error: 'Analysis not found' });
      return;
    }
    const input = (log.inputData ?? {}) as Record<string, unknown>;
    res.json({
      success: true,
      data: {
        _id: log._id,
        symbol: log.symbol,
        analysisDate: log.analysisDate,
        recommendation: log.recommendation,
        confidence: log.confidence,
        reasoning: log.reasoning,
        predictionOutcome: log.predictionOutcome,
        decisionTrace: input.decisionTrace ?? null,
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/stocks/:symbol/fundamentals — Manual fundamentals import
router.post('/:symbol/fundamentals', validateBody(ManualFundamentalsSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    const stock = await Stock.findOne({ symbol }).lean();
    if (!stock) {
      res.status(404).json({ success: false, error: `Stock ${symbol} not found` });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updated = await StockMetric.findOneAndUpdate(
      { symbol, date: today },
      {
        $set: {
          ...req.body,
          fundamentalsUpdatedAt: new Date(),
        },
      },
      { upsert: true, new: true }
    );

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

export default router;
