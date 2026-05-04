import { Router, Request, Response, NextFunction } from 'express';
import { alertRepo } from '../repositories/alert.repo';
import { parseIntId } from '../repositories/portfolio.repo';
import { validateBody } from '../middleware/validate';
import { CreateAlertSchema } from '../types/api.types';

const router = Router();

// GET /api/alerts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { active } = req.query;
    const activeFilter = active === 'true' ? true : active === 'false' ? false : undefined;
    const alerts = await alertRepo.findAll(activeFilter);
    res.json({ success: true, data: alerts });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts
router.post('/', validateBody(CreateAlertSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await alertRepo.create(req.body);
    res.status(201).json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = parseIntId(req.params.id as string);
    if (id === null) {
      res.status(404).json({ success: false, error: 'Alert not found' });
      return;
    }
    const ok = await alertRepo.delete(id);
    if (!ok) {
      res.status(404).json({ success: false, error: 'Alert not found' });
      return;
    }
    res.json({ success: true, data: { message: 'Alert removed' } });
  } catch (error) {
    next(error);
  }
});

export default router;
