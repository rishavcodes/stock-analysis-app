import { Router, Request, Response, NextFunction } from 'express';
import { BacktestService } from '../services/backtest.service';
import { BacktestRun } from '../models/BacktestRun';
import { BacktestTrade } from '../models/BacktestTrade';
import { validateBody } from '../middleware/validate';
import { BacktestRunSchema } from '../types/api.types';
import { AppError } from '../middleware/error-handler';

const router = Router();
const backtestService = new BacktestService();

// POST /api/backtest/run — enqueue a run, return runId immediately
router.post('/run', validateBody(BacktestRunSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await backtestService.enqueue(req.body);
    res.status(202).json({ success: true, data: { runId: run._id, status: run.status } });
  } catch (error) {
    next(error);
  }
});

// GET /api/backtest — list runs (newest first)
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const runs = await BacktestRun.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: runs });
  } catch (error) {
    next(error);
  }
});

// GET /api/backtest/:id — single run status + results
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const run = await BacktestRun.findById(req.params.id).lean();
    if (!run) throw new AppError(404, 'Backtest run not found');
    res.json({ success: true, data: run });
  } catch (error) {
    next(error);
  }
});

// GET /api/backtest/:id/trades — per-trade rows for a run
router.get('/:id/trades', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const trades = await BacktestTrade.find({ runId: req.params.id }).sort({ entryDate: 1 }).lean();
    res.json({ success: true, data: trades });
  } catch (error) {
    next(error);
  }
});

export default router;
