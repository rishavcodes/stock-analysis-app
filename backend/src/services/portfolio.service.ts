import { Portfolio, IPortfolio } from '../models/Portfolio';
import { Stock } from '../models/Stock';
import { SmartAPIService } from './smartapi.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

export class PortfolioService {
  private smartApi: SmartAPIService;

  constructor() {
    this.smartApi = new SmartAPIService();
  }

  /** Get all active holdings with live P&L */
  async getHoldings() {
    const holdings = await Portfolio.find({ status: 'ACTIVE' }).lean();

    if (holdings.length === 0) return [];

    // Fetch live prices
    const symbols = holdings.map((h) => h.symbol);
    const stocks = await Stock.find({ symbol: { $in: symbols } }).lean();
    const tokenMap = new Map(stocks.map((s) => [s.symbol, s.token]));
    const tokens = stocks.map((s) => s.token);

    try {
      await this.smartApi.initialize();
      const ltpMap = await this.smartApi.getLTP(tokens);

      return holdings.map((h) => {
        const token = tokenMap.get(h.symbol);
        const ltp = token ? (ltpMap.get(token) || h.currentPrice) : h.currentPrice;
        const pnl = (ltp - h.avgBuyPrice) * h.quantity;
        const pnlPercent = h.avgBuyPrice > 0 ? ((ltp - h.avgBuyPrice) / h.avgBuyPrice) * 100 : 0;

        return { ...h, currentPrice: ltp, pnl, pnlPercent };
      });
    } catch (error) {
      logger.warn('Could not fetch live prices for portfolio, using cached:', error);
      return holdings;
    }
  }

  /** Get portfolio summary */
  async getSummary(): Promise<{
    totalInvested: number;
    currentValue: number;
    totalPnl: number;
    totalPnlPercent: number;
    holdingCount: number;
  }> {
    const holdings = await this.getHoldings();

    const totalInvested = holdings.reduce((sum, h) => sum + h.avgBuyPrice * h.quantity, 0);
    const currentValue = holdings.reduce((sum, h) => sum + h.currentPrice * h.quantity, 0);
    const totalPnl = currentValue - totalInvested;
    const totalPnlPercent = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

    return {
      totalInvested,
      currentValue,
      totalPnl,
      totalPnlPercent,
      holdingCount: holdings.length,
    };
  }

  /** Add a new holding */
  async addHolding(data: {
    symbol: string;
    quantity: number;
    avgBuyPrice: number;
    buyDate: Date;
    stopLoss?: number;
    targetPrice?: number;
    notes?: string;
  }): Promise<IPortfolio> {
    const stock = await Stock.findOne({ symbol: data.symbol.toUpperCase() });
    if (!stock) throw new AppError(404, `Stock ${data.symbol} not found`);

    const holding = await Portfolio.create({
      ...data,
      symbol: data.symbol.toUpperCase(),
      currentPrice: data.avgBuyPrice,
      pnl: 0,
      pnlPercent: 0,
      status: 'ACTIVE',
    });

    logger.info(`Added holding: ${data.symbol} x${data.quantity} @ ${data.avgBuyPrice}`);
    return holding;
  }

  /** Update a holding */
  async updateHolding(id: string, updates: Partial<IPortfolio>): Promise<IPortfolio> {
    const holding = await Portfolio.findByIdAndUpdate(id, updates, { new: true });
    if (!holding) throw new AppError(404, 'Holding not found');
    return holding;
  }

  /** Remove a holding */
  async removeHolding(id: string): Promise<void> {
    const result = await Portfolio.findByIdAndDelete(id);
    if (!result) throw new AppError(404, 'Holding not found');
  }

  /** Exit a holding (mark as sold) */
  async exitHolding(id: string, exitPrice: number): Promise<IPortfolio> {
    const holding = await Portfolio.findById(id);
    if (!holding) throw new AppError(404, 'Holding not found');

    holding.status = 'EXITED';
    holding.exitPrice = exitPrice;
    holding.exitDate = new Date();
    holding.pnl = (exitPrice - holding.avgBuyPrice) * holding.quantity;
    holding.pnlPercent = ((exitPrice - holding.avgBuyPrice) / holding.avgBuyPrice) * 100;
    await holding.save();

    logger.info(`Exited holding: ${holding.symbol} @ ${exitPrice}, P&L: ${holding.pnl}`);
    return holding;
  }
}
