import cron from 'node-cron';
import { logger } from '../utils/logger';
import { isMarketOpen, mostRecentTradingDayIST } from '../utils/market-hours';
import { prisma } from '../config/prisma';
import { INDEX_TOKENS } from '../config/constants';
import { fetchCandlesJob } from './fetch-candles.job';
import { computeMetricsJob } from './compute-metrics.job';
import { fetchFundamentalsJob } from './fetch-fundamentals.job';
import { checkAlertsJob } from './check-alerts.job';
import { evaluatePredictionsJob } from './evaluate-predictions.job';

/**
 * Catch up missed cron runs on boot. node-cron only fires while the process
 * is alive, so any deploy / crash / dyno-spindown that straddles a cron
 * minute silently loses that day's run. On startup we check whether the
 * latest candle and metric are at or after the most recent trading day; if
 * not, fire the corresponding job once. Both jobs internally skip per-symbol
 * work that's already up to date, so re-running them is cheap when fresh.
 *
 * Sequenced so candles land before metrics — metrics compute reads candles.
 */
async function runStartupCatchUp(): Promise<void> {
  const target = mostRecentTradingDayIST();

  // Use NIFTY 50 as the canary token: if its latest candle is at or after the
  // target trading day the candle pipeline ran successfully. Per-symbol
  // freshness is handled inside fetchAllDailyCandles' resume logic.
  const newestCandle = await prisma.candle.findFirst({
    where: { stockToken: INDEX_TOKENS.NIFTY_50, interval: 'ONE_DAY' },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true },
  });
  const candlesStale = !newestCandle || newestCandle.timestamp < target;

  if (candlesStale) {
    logger.warn(
      `Startup catch-up: candles stale (newest=${newestCandle?.timestamp.toISOString() ?? 'none'}, target=${target.toISOString()}); running fetch-candles`
    );
    await fetchCandlesJob();
  }

  const newestMetric = await prisma.stockMetric.findFirst({
    orderBy: { date: 'desc' },
    select: { date: true },
  });
  const metricsStale = !newestMetric || newestMetric.date < target;

  if (metricsStale) {
    logger.warn(
      `Startup catch-up: metrics stale (newest=${newestMetric?.date.toISOString() ?? 'none'}, target=${target.toISOString()}); running compute-metrics`
    );
    await computeMetricsJob();
  }

  if (!candlesStale && !metricsStale) {
    logger.info('Startup catch-up: candles and metrics already up to date');
  }
}

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

  // Fire-and-forget catch-up. Errors are caught and logged inside each job
  // wrapper, so we don't need a try/catch here — but we do want to surface
  // a failure of the catch-up dispatcher itself (e.g. a Prisma outage).
  void runStartupCatchUp().catch((err) => {
    logger.error('Startup catch-up failed:', err);
  });
}
