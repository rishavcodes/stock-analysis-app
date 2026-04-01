import { Router, Request, Response, NextFunction } from 'express';
import { Alert } from '../models/Alert';
import { validateBody } from '../middleware/validate';
import { CreateAlertSchema } from '../types/api.types';

const router = Router();

// GET /api/alerts
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { active } = req.query;
    const filter: Record<string, any> = {};
    if (active === 'true') filter.isActive = true;
    if (active === 'false') filter.isActive = false;

    const alerts = await Alert.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: alerts });
  } catch (error) {
    next(error);
  }
});

// POST /api/alerts
router.post('/', validateBody(CreateAlertSchema), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const alert = await Alert.create(req.body);
    res.status(201).json({ success: true, data: alert });
  } catch (error) {
    next(error);
  }
});

// DELETE /api/alerts/:id
router.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await Alert.findByIdAndDelete(req.params.id);
    res.json({ success: true, data: { message: 'Alert removed' } });
  } catch (error) {
    next(error);
  }
});

export default router;
