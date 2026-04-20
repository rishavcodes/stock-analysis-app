import { Portfolio, IPortfolio } from '../models/Portfolio';
import { Stock } from '../models/Stock';
import { StockMetric } from '../models/StockMetric';
import { Candle } from '../models/Candle';
import { SmartAPIService } from './smartapi.service';
import { IndicatorService } from './indicator.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { PORTFOLIO_LIMITS } from '../config/constants';

export interface CorrelationEntry {
  heldSymbol: string;
  correlation: number;
  sameSector: boolean;
}

export type CanAddReason = 'SECTOR_OVEREXPOSED' | 'CORRELATED_POSITION';

export interface CanAddPositionResult {
  allowed: boolean;
  currentSectorPct: number;
  projectedSectorPct: number;
  correlations: CorrelationEntry[];
  reason?: CanAddReason;
  blockingSymbol?: string;
}

export class PortfolioService {
  private smartApi: SmartAPIService;
  private indicatorService: IndicatorService;

  constructor() {
    this.smartApi = new SmartAPIService();
    this.indicatorService = new IndicatorService();
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

  /** Sector exposure breakdown for active holdings. */
  async getSectorExposure(): Promise<Array<{ sector: string; value: number; pct: number }>> {
    const holdings = await this.getHoldings();
    if (holdings.length === 0) return [];

    const symbols = holdings.map((h) => h.symbol);
    const stocks = await Stock.find({ symbol: { $in: symbols } }).select('symbol sector').lean();
    const sectorBySymbol = new Map(stocks.map((s) => [s.symbol, s.sector]));

    const sectorValue = new Map<string, number>();
    let totalValue = 0;
    for (const h of holdings) {
      const sector = sectorBySymbol.get(h.symbol) ?? 'Unknown';
      // Use currentPrice if live fetch succeeded; else avgBuyPrice cost basis (fallback in getHoldings).
      const value = (h.currentPrice || h.avgBuyPrice) * h.quantity;
      sectorValue.set(sector, (sectorValue.get(sector) ?? 0) + value);
      totalValue += value;
    }

    return [...sectorValue.entries()]
      .map(([sector, value]) => ({ sector, value, pct: totalValue > 0 ? (value / totalValue) * 100 : 0 }))
      .sort((a, b) => b.value - a.value);
  }

  /**
   * Compute risk-based position size.
   * qty = capital * riskPct / 100 / (entry - stop), capped at MAX_POSITION_PCT of capital.
   * Throws if entry <= stop.
   */
  computePositionSize(capital: number, riskPct: number, entryPrice: number, stopLoss: number): {
    qty: number;
    riskAmount: number;
    positionValue: number;
    cappedByMaxPosition: boolean;
  } {
    if (capital <= 0) throw new AppError(400, 'capital must be > 0');
    if (riskPct <= 0 || riskPct > 100) throw new AppError(400, 'riskPct must be in (0, 100]');
    if (entryPrice <= 0) throw new AppError(400, 'entryPrice must be > 0');
    if (stopLoss >= entryPrice) throw new AppError(400, 'stopLoss must be < entryPrice');

    const riskAmount = (capital * riskPct) / 100;
    const perShareLoss = entryPrice - stopLoss;
    const rawQty = Math.floor(riskAmount / perShareLoss);

    const maxPositionValue = (capital * PORTFOLIO_LIMITS.MAX_POSITION_PCT) / 100;
    const maxQty = Math.floor(maxPositionValue / entryPrice);

    const cappedByMaxPosition = rawQty > maxQty;
    const qty = Math.max(0, Math.min(rawQty, maxQty));
    return {
      qty,
      riskAmount,
      positionValue: qty * entryPrice,
      cappedByMaxPosition,
    };
  }

  /**
   * Compute correlation of a candidate symbol against each active holding.
   * Uses last CORRELATION_LOOKBACK_DAYS daily closes from the Candle collection.
   */
  async getCorrelationWithHoldings(symbol: string): Promise<CorrelationEntry[]> {
    const candidate = await Stock.findOne({ symbol: symbol.toUpperCase() }).lean();
    if (!candidate) throw new AppError(404, `Stock ${symbol} not found`);

    const holdings = await Portfolio.find({ status: 'ACTIVE' }).lean();
    if (holdings.length === 0) return [];

    const heldSymbols = [...new Set(holdings.map((h) => h.symbol))];
    const heldStocks = await Stock.find({ symbol: { $in: heldSymbols } }).lean();
    const heldMap = new Map(heldStocks.map((s) => [s.symbol, s]));

    const lookback = PORTFOLIO_LIMITS.CORRELATION_LOOKBACK_DAYS;

    const candidateCandles = await Candle.find({ stockToken: candidate.token, interval: 'ONE_DAY' })
      .sort({ timestamp: -1 })
      .limit(lookback)
      .lean();
    if (candidateCandles.length < 3) return [];
    const candidateByTs = new Map(
      candidateCandles.map((c) => [c.timestamp.toISOString().slice(0, 10), c.close])
    );

    const results: CorrelationEntry[] = [];
    for (const heldSym of heldSymbols) {
      if (heldSym === candidate.symbol) continue;
      const held = heldMap.get(heldSym);
      if (!held) continue;
      const heldCandles = await Candle.find({ stockToken: held.token, interval: 'ONE_DAY' })
        .sort({ timestamp: -1 })
        .limit(lookback)
        .lean();

      // Align by date: intersect the two series on same-day closes.
      const alignedCandidate: number[] = [];
      const alignedHeld: number[] = [];
      for (const hc of heldCandles) {
        const key = hc.timestamp.toISOString().slice(0, 10);
        const cc = candidateByTs.get(key);
        if (typeof cc === 'number') {
          alignedHeld.push(hc.close);
          alignedCandidate.push(cc);
        }
      }
      // Both were fetched descending; reverse to chronological for returns calc.
      alignedCandidate.reverse();
      alignedHeld.reverse();
      const correlation = this.indicatorService.calcCorrelation(alignedCandidate, alignedHeld);
      if (correlation == null) continue;
      results.push({
        heldSymbol: heldSym,
        correlation,
        sameSector: held.sector === candidate.sector,
      });
    }
    return results.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  }

  /**
   * Whether a new position in `symbol` for `capital` INR should be allowed.
   * Checks sector over-exposure first, then same-sector correlation redundancy.
   */
  async canAddPosition(symbol: string, capital: number): Promise<CanAddPositionResult> {
    const upper = symbol.toUpperCase();
    const candidate = await Stock.findOne({ symbol: upper }).lean();
    if (!candidate) throw new AppError(404, `Stock ${symbol} not found`);

    const exposure = await this.getSectorExposure();
    const totalValue = exposure.reduce((s, e) => s + e.value, 0);
    const currentSectorValue = exposure.find((e) => e.sector === candidate.sector)?.value ?? 0;
    const currentSectorPct = totalValue > 0 ? (currentSectorValue / totalValue) * 100 : 0;
    const projectedTotal = totalValue + capital;
    const projectedSectorValue = currentSectorValue + capital;
    const projectedSectorPct = projectedTotal > 0 ? (projectedSectorValue / projectedTotal) * 100 : 0;

    const correlations = await this.getCorrelationWithHoldings(upper);

    if (projectedSectorPct > PORTFOLIO_LIMITS.MAX_SECTOR_EXPOSURE_PCT) {
      return {
        allowed: false,
        currentSectorPct,
        projectedSectorPct,
        correlations,
        reason: 'SECTOR_OVEREXPOSED',
      };
    }

    const redundant = correlations.find(
      (c) => c.sameSector && c.correlation > PORTFOLIO_LIMITS.CORRELATION_THRESHOLD
    );
    if (redundant) {
      return {
        allowed: false,
        currentSectorPct,
        projectedSectorPct,
        correlations,
        reason: 'CORRELATED_POSITION',
        blockingSymbol: redundant.heldSymbol,
      };
    }

    return {
      allowed: true,
      currentSectorPct,
      projectedSectorPct,
      correlations,
    };
  }

  /** Weighted average of StockMetric.riskScore across active holdings (weighted by position value). */
  async getPortfolioRiskScore(): Promise<number> {
    const holdings = await this.getHoldings();
    if (holdings.length === 0) return 0;
    const symbols = [...new Set(holdings.map((h) => h.symbol))];
    const metrics = await StockMetric.find({ symbol: { $in: symbols } })
      .sort({ date: -1 })
      .lean();
    // Take latest per symbol.
    const latestBySymbol = new Map<string, number>();
    for (const m of metrics) {
      if (!latestBySymbol.has(m.symbol)) latestBySymbol.set(m.symbol, m.riskScore ?? 50);
    }
    let weightedSum = 0;
    let totalValue = 0;
    for (const h of holdings) {
      const risk = latestBySymbol.get(h.symbol) ?? 50;
      const value = (h.currentPrice || h.avgBuyPrice) * h.quantity;
      weightedSum += risk * value;
      totalValue += value;
    }
    return totalValue > 0 ? Math.round(weightedSum / totalValue) : 0;
  }
}
