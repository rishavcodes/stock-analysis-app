import cron from 'node-cron';
import { logger } from '../utils/logger';
import { isMarketOpen } from '../utils/market-hours';
import { fetchCandlesJob } from './fetch-candles.job';
import { computeMetricsJob } from './compute-metrics.job';
import { fetchFundamentalsJob } from './fetch-fundamentals.job';
import { checkAlertsJob } from './check-alerts.job';
import { evaluatePredictionsJob } from './evaluate-predictions.job';

export function initScheduler(): void {
  // Fetch daily candles at 4:00 PM IST (10:30 UTC)
  cron.schedule('30 10 * * 1-5', async () => {
    logger.info('Running scheduled job: fetch daily candles');
    await fetchCandlesJob();
  });

  // Compute metrics at 4:30 PM IST (11:00 UTC)
  cron.schedule('0 11 * * 1-5', async () => {
    logger.info('Running scheduled job: compute metrics');
    await computeMetricsJob();
  });

  // Fetch fundamentals at 6:00 AM IST (00:30 UTC)
  cron.schedule('30 0 * * 1-5', async () => {
    logger.info('Running scheduled job: fetch fundamentals');
    await fetchFundamentalsJob();
  });

  // Check alerts every 60 seconds during market hours
  cron.schedule('* * * * *', async () => {
    if (isMarketOpen()) {
      await checkAlertsJob();
    }
  });

  // Evaluate past predictions at 6:00 PM IST (12:30 UTC) weekdays
  cron.schedule('30 12 * * 1-5', async () => {
    logger.info('Running scheduled job: evaluate predictions');
    await evaluatePredictionsJob();
  });

  logger.info('Cron scheduler initialized');
}
