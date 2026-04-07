import { Router, Request, Response, NextFunction } from 'express';
import { MarketDataService } from '../services/market-data.service';
import { Stock } from '../models/Stock';
import { SECTOR_MAP } from '../config/sector-map';

const router = Router();
const marketDataService = new MarketDataService();

// GET /api/market/status
router.get('/status', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const status = await marketDataService.getMarketStatus();
    res.json({ success: true, data: status });
  } catch (error) {
    next(error);
  }
});

// GET /api/market/sectors
router.get('/sectors', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const sectors = await marketDataService.getSectorRankings();
    res.json({ success: true, data: sectors });
  } catch (error) {
    next(error);
  }
});

// POST /api/market/update-sectors — Apply sector mapping to existing stocks
router.post('/update-sectors', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    let updated = 0;
    for (const [symbol, sector] of Object.entries(SECTOR_MAP)) {
      const result = await Stock.updateOne({ symbol }, { $set: { sector } });
      if (result.modifiedCount > 0) updated++;
    }
    res.json({ success: true, data: { message: `Updated sectors for ${updated} stocks` } });
  } catch (error) {
    next(error);
  }
});

// POST /api/market/sync-instruments — One-time: fetch all NSE stock symbols
router.post('/sync-instruments', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const count = await marketDataService.syncInstrumentMaster();
    res.json({ success: true, data: { message: `Synced ${count} instruments` } });
  } catch (error) {
    next(error);
  }
});

// POST /api/market/fetch-candles — Fetch daily candles for all stocks (takes a while)
router.post('/fetch-candles', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: { message: 'Candle fetch started in background' } });
    // Run in background after responding
    marketDataService.fetchAllDailyCandles().catch((e) => console.error('Candle fetch error:', e));
  } catch (error) {
    next(error);
  }
});

// POST /api/market/compute-metrics — Compute indicators + scores for all stocks
router.post('/compute-metrics', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await marketDataService.computeSectorData();
    await marketDataService.computeAllMetrics();
    res.json({ success: true, data: { message: 'Metrics computed' } });
  } catch (error) {
    next(error);
  }
});

// POST /api/market/fetch-fundamentals — Fetch fundamentals from Alpha Vantage (30 stocks/batch)
router.post('/fetch-fundamentals', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: { message: 'Fundamentals fetch started in background' } });
    marketDataService.fetchFundamentalsBatch(30).catch((e) => console.error('Fundamentals fetch error:', e));
  } catch (error) {
    next(error);
  }
});

export default router;
