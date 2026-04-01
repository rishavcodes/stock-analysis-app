import { Router } from 'express';
import marketRoutes from './market.routes';
import stockRoutes from './stock.routes';
import portfolioRoutes from './portfolio.routes';
import alertRoutes from './alert.routes';

const router = Router();

router.use('/market', marketRoutes);
router.use('/stocks', stockRoutes);
router.use('/portfolio', portfolioRoutes);
router.use('/alerts', alertRoutes);

export default router;
