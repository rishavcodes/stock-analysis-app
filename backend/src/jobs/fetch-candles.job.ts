import { MarketDataService } from '../services/market-data.service';
import { logger } from '../utils/logger';

const marketDataService = new MarketDataService();

export async function fetchCandlesJob(): Promise<void> {
  try {
    await marketDataService.fetchAllDailyCandles();
    logger.info('Fetch candles job completed');
  } catch (error) {
    logger.error('Fetch candles job failed:', error);
  }
}
