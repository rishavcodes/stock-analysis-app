import { MarketDataService } from '../services/market-data.service';
import { logger } from '../utils/logger';

const marketDataService = new MarketDataService();

export async function computeMetricsJob(): Promise<void> {
  try {
    await marketDataService.computeSectorData();
    await marketDataService.computeAllMetrics();
    logger.info('Compute metrics job completed');
  } catch (error) {
    logger.error('Compute metrics job failed:', error);
  }
}
