import { Router, Request, Response, NextFunction } from 'express';
import mongoose from 'mongoose';
import { stockMetricRepo } from '../repositories/stockmetric.repo';
import { stockRepo } from '../repositories/stock.repo';
import { candleRepo } from '../repositories/candle.repo';
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
    const pageN = page || 1;
    const limitN = limit || 20;

    // Sector lives on Stock, not StockMetric — resolve it to a symbol set first
    // and pass that into the metric query. (The Mongoose version pushed a
    // {sector: ...} match into the aggregation against StockMetric, where the
    // field doesn't exist, and silently returned zero rows.)
    let symbolsInSector: string[] | undefined;
    if (sector) {
      const stocksInSector = await stockRepo.findSymbolsBySector(sector);
      symbolsInSector = stocksInSector.map((s) => s.symbol);
      if (symbolsInSector.length === 0) {
        res.json({
          success: true,
          data: [],
          pagination: { page: pageN, limit: limitN, total: 0, totalPages: 0 },
        });
        return;
      }
    }

    const { items: metrics, total } = await stockMetricRepo.screenerLatestPerSymbol({
      symbols: symbolsInSector,
      minScore,
      maxScore,
      breakoutOnly,
      sortBy: sortBy || 'finalScore',
      sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
      page: pageN,
      limit: limitN,
    });

    // Enrich with stock info
    const symbols = metrics.map((m) => m.symbol);
    const stocks = await stockRepo.findManyBySymbols(symbols);
    const stockMap = new Map(stocks.map((s) => [s.symbol, s]));

    const enriched = metrics.map((m) => ({
      ...m,
      stockInfo: stockMap.get(m.symbol) || null,
    }));

    res.json({
      success: true,
      data: enriched,
      pagination: {
        page: pageN,
        limit: limitN,
        total,
        totalPages: Math.ceil(total / limitN),
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
    const stock = await stockRepo.findBySymbol(symbol);
    if (!stock) {
      res.status(404).json({ success: false, error: `Stock ${symbol} not found` });
      return;
    }

    const [latestMetric, candles, latestAnalysis] = await Promise.all([
      stockMetricRepo.findLatestBySymbol(symbol),
      candleRepo.findRecent(stock.token, 'ONE_DAY', 365),
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
    const stock = await stockRepo.findBySymbol(symbol);
    if (!stock) {
      res.status(404).json({ success: false, error: `Stock ${symbol} not found` });
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const updated = await stockMetricRepo.upsertOnSymbolDate(symbol, today, {
      ...req.body,
      fundamentalsUpdatedAt: new Date(),
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
});

export default router;
