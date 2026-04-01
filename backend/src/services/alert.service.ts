import { Alert, IAlert } from '../models/Alert';
import { Portfolio } from '../models/Portfolio';
import { StockMetric } from '../models/StockMetric';
import { Stock } from '../models/Stock';
import { SmartAPIService } from './smartapi.service';
import { logger } from '../utils/logger';

export class AlertService {
  private smartApi: SmartAPIService;

  constructor() {
    this.smartApi = new SmartAPIService();
  }

  /** Evaluate all active alerts against current market data */
  async evaluateAlerts() {
    const activeAlerts = await Alert.find({ isActive: true, isTriggered: false }).lean();
    if (activeAlerts.length === 0) return [];

    // Get unique symbols
    const symbols = [...new Set(activeAlerts.map((a) => a.symbol))];
    const stocks = await Stock.find({ symbol: { $in: symbols } }).lean();
    const tokenMap = new Map(stocks.map((s) => [s.symbol, s.token]));
    const tokens = stocks.map((s) => s.token);

    // Fetch live prices
    let ltpMap: Map<string, number>;
    try {
      await this.smartApi.initialize();
      ltpMap = await this.smartApi.getLTP(tokens);
    } catch (error) {
      logger.error('Failed to fetch prices for alert evaluation:', error);
      return [];
    }

    const triggeredAlerts: typeof activeAlerts = [];

    for (const alert of activeAlerts) {
      const token = tokenMap.get(alert.symbol);
      if (!token) continue;

      const currentPrice = ltpMap.get(token);
      if (!currentPrice) continue;

      let triggered = false;

      switch (alert.type) {
        case 'PRICE_ABOVE':
          triggered = currentPrice >= alert.threshold;
          break;
        case 'PRICE_BELOW':
          triggered = currentPrice <= alert.threshold;
          break;
        case 'STOP_LOSS':
          triggered = currentPrice <= alert.threshold;
          break;
        case 'TARGET_HIT':
          triggered = currentPrice >= alert.threshold;
          break;
        case 'VOLUME_SPIKE': {
          const metric = await StockMetric.findOne({ symbol: alert.symbol })
            .sort({ date: -1 })
            .lean();
          if (metric && metric.volumeRatio >= alert.threshold) {
            triggered = true;
          }
          break;
        }
        case 'BREAKOUT': {
          const metric = await StockMetric.findOne({ symbol: alert.symbol })
            .sort({ date: -1 })
            .lean();
          if (metric?.isBreakout) {
            triggered = true;
          }
          break;
        }
        case 'SCORE_CHANGE': {
          const metric = await StockMetric.findOne({ symbol: alert.symbol })
            .sort({ date: -1 })
            .lean();
          if (metric && metric.finalScore >= alert.threshold) {
            triggered = true;
          }
          break;
        }
      }

      if (triggered) {
        await Alert.findByIdAndUpdate(alert._id, {
          isTriggered: true,
          triggeredAt: new Date(),
          message: `${alert.type} alert triggered for ${alert.symbol} at price ${currentPrice}`,
        });
        triggeredAlerts.push(alert);
        logger.info(`Alert triggered: ${alert.type} for ${alert.symbol}`);
      }
    }

    // Also check portfolio stop-losses
    const activeHoldings = await Portfolio.find({ status: 'ACTIVE', stopLoss: { $ne: null } }).lean();
    for (const holding of activeHoldings) {
      const token = tokenMap.get(holding.symbol);
      if (!token) continue;
      const currentPrice = ltpMap.get(token);
      if (!currentPrice || !holding.stopLoss) continue;

      if (currentPrice <= holding.stopLoss) {
        // Auto-create triggered alert for stop-loss breach
        const alert = await Alert.create({
          symbol: holding.symbol,
          type: 'STOP_LOSS',
          threshold: holding.stopLoss,
          isActive: false,
          isTriggered: true,
          triggeredAt: new Date(),
          message: `STOP-LOSS BREACH: ${holding.symbol} at ${currentPrice} (SL: ${holding.stopLoss})`,
        });
        triggeredAlerts.push(alert as any);
        logger.warn(`Stop-loss breached for ${holding.symbol}: ${currentPrice} <= ${holding.stopLoss}`);
      }
    }

    return triggeredAlerts;
  }
}
