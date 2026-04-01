import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { StockMetric } from '../models/StockMetric';
import { Stock } from '../models/Stock';
import { Candle } from '../models/Candle';
import { AnalysisLog } from '../models/AnalysisLog';
import { AIAnalysisService } from '../services/ai-analysis.service';
import { validateQuery } from '../middleware/validate';
import { ScreenerQuerySchema } from '../types/api.types';
import { analysisLimiter } from '../middleware/rate-limiter';

const router = Router();
const aiService = new AIAnalysisService();

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

    const [stock, latestMetric, candles, latestAnalysis] = await Promise.all([
      Stock.findOne({ symbol }).lean(),
      StockMetric.findOne({ symbol }).sort({ date: -1 }).lean(),
      Candle.find({ stockToken: symbol, interval: 'ONE_DAY' })
        .sort({ timestamp: -1 })
        .limit(365)
        .lean(),
      AnalysisLog.findOne({ symbol }).sort({ analysisDate: -1 }).lean(),
    ]);

    if (!stock) {
      res.status(404).json({ success: false, error: `Stock ${symbol} not found` });
      return;
    }

    res.json({
      success: true,
      data: {
        stock,
        metrics: latestMetric,
        candles: candles.reverse(),
        analysis: latestAnalysis,
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

export default router;
