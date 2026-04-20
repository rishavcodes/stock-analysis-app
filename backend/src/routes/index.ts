import { Router } from 'express';
import marketRoutes from './market.routes';
import stockRoutes from './stock.routes';
import portfolioRoutes from './portfolio.routes';
import alertRoutes from './alert.routes';
import analyticsRoutes from './analytics.routes';
import backtestRoutes from './backtest.routes';
import streamRoutes from './stream.routes';

const router = Router();

router.use('/market', marketRoutes);
router.use('/stocks', stockRoutes);
router.use('/portfolio', portfolioRoutes);
router.use('/alerts', alertRoutes);
router.use('/analytics', analyticsRoutes);
router.use('/backtest', backtestRoutes);
router.use('/stream', streamRoutes);

export default router;
