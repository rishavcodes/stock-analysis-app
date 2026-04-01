import { MarketDataService } from '../services/market-data.service';
import { logger } from '../utils/logger';

const marketDataService = new MarketDataService();

export async function fetchFundamentalsJob(): Promise<void> {
  try {
    await marketDataService.fetchFundamentalsBatch(30);
    logger.info('Fetch fundamentals job completed');
  } catch (error) {
    logger.error('Fetch fundamentals job failed:', error);
  }
}
