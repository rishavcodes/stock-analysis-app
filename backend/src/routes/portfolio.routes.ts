import { Router, Request, Response, NextFunction } from 'express';
import { PortfolioService } from '../services/portfolio.service';
import { validateBody } from '../middleware/validate';
import { AddHoldingSchema } from '../types/api.types';

const router = Router();
const portfolioService = new PortfolioService();

// GET /api/portfolio
router.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const holdings = await portfolioService.getHoldings();
    const summary = await portfolioService.getSummary();
    res.json({ success: true, data: { holdings, summary } });
  } catch (error) {
    next(error);
  }
});

// POST /api/portfolio
router.post('/', validateBody(AddHoldingSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const holding = await portfolioService.addHolding(req.body);
    res.status(201).json({ success: true, data: holding });
  } catch (error) {
    next(error);
  }
});

// PUT /api/portfolio/:id
router.put('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const holding = await portfolioService.updateHolding(req.params.id as string, req.body);
    res.json({ success: true, data: holding });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/portfolio/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await portfolioService.removeHolding(req.params.id as string);
    res.json({ success: true, data: { message: 'Holding removed' } });
  } catch (error) {
    next(error);
  }
});

// POST /api/portfolio/:id/exit
router.post('/:id/exit', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { exitPrice } = req.body;
    const holding = await portfolioService.exitHolding(req.params.id as string, exitPrice);
    res.json({ success: true, data: holding });
  } catch (error) {
    next(error);
  }
});

export default router;
