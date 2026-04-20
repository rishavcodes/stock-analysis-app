import { SmartAPIService } from './smartapi.service';
import { YahooFinanceService } from './yahoo-finance.service';
import { Stock, IStock } from '../models/Stock';
import { Candle } from '../models/Candle';
import { StockMetric } from '../models/StockMetric';
import { SectorData } from '../models/SectorData';
import { MarketState } from '../models/MarketState';
import { INDEX_TOKENS, EXCHANGE, INTERVALS, ALPHA_VANTAGE, MarketRegime, REGIME_SMOOTHING_DAYS } from '../config/constants';
import { SECTOR_MAP } from '../config/sector-map';
import { MarketStatus, IndexStatus, SectorRanking, CandleData } from '../types/market.types';
import { isMarketOpen, formatSmartAPIDate, daysAgo, isTradingDayIST, mostRecentTradingDayIST } from '../utils/market-hours';
import { IndicatorService } from './indicator.service';
import { ScoringService } from './scoring.service';
import { logger } from '../utils/logger';

export class MarketDataService {
  private smartApi: SmartAPIService;
  private yahooFinance: YahooFinanceService;
  private indicatorService: IndicatorService;
  private scoringService: ScoringService;
  private initialized = false;

  constructor() {
    this.smartApi = new SmartAPIService();
    this.yahooFinance = new YahooFinanceService();
    this.indicatorService = new IndicatorService();
    this.scoringService = new ScoringService();
  }

  private async ensureInit(): Promise<void> {
    if (!this.initialized) {
      await this.smartApi.initialize();
      this.initialized = true;
    }
  }

  /** Sync instrument master from Angel One */
  async syncInstrumentMaster(): Promise<number> {
    const instruments = await this.smartApi.getInstrumentList();

    // Filter to NSE EQ segment only
    const nseStocks = instruments.filter(
      (i: any) => i.exch_seg === 'NSE' && i.instrumenttype === '' && i.symbol?.endsWith('-EQ')
    );

    let count = 0;
    for (const inst of nseStocks) {
      const symbol = inst.symbol.replace('-EQ', '');
      const sector = SECTOR_MAP[symbol] || 'Unknown';
      await Stock.findOneAndUpdate(
        { token: inst.token },
        {
          symbol,
          token: inst.token,
          name: inst.name || symbol,
          exchange: 'NSE',
          segment: 'EQ',
          sector,
          isin: inst.isin || '',
          lotSize: parseInt(inst.lotsize) || 1,
          isIndex: false,
          isActive: true,
          lastUpdated: new Date(),
        },
        { upsert: true }
      );
      count++;
    }

    logger.info(`Synced ${count} NSE stocks from instrument master`);
    return count;
  }

  /** Fetch and store daily candles for a stock */
  async fetchDailyCandles(stockToken: string, days: number = 365): Promise<CandleData[]> {
    await this.ensureInit();

    const fromDate = formatSmartAPIDate(daysAgo(days));
    // Cap toDate at the most recent trading day's close, not "now". Prevents
    // Angel from returning a partial intraday bar stamped as "today" when the
    // cron (or a manual trigger) fires mid-session or on a weekend/holiday.
    const toDate = formatSmartAPIDate(mostRecentTradingDayIST());

    const raw = await this.smartApi.getCandles(
      stockToken,
      EXCHANGE.NSE,
      INTERVALS.ONE_DAY,
      fromDate,
      toDate
    );

    // Defensive: NSE is closed on Sat/Sun, so any weekend-stamped candle is
    // garbage (e.g. a misrouted intraday snapshot). Drop before upsert.
    const candles = raw.filter((c) => isTradingDayIST(c.timestamp));
    const dropped = raw.length - candles.length;
    if (dropped > 0) {
      logger.warn(`Dropped ${dropped} non-trading-day candle(s) for token ${stockToken}`);
    }

    if (candles.length > 0) {
      const ops = candles.map((c) => ({
        updateOne: {
          filter: { stockToken, interval: 'ONE_DAY', timestamp: c.timestamp },
          update: { $set: { ...c, stockToken, interval: 'ONE_DAY' } },
          upsert: true,
        },
      }));
      await Candle.bulkWrite(ops);
    }

    return candles;
  }

  /** Fetch daily candles for all active stocks */
  async fetchAllDailyCandles(): Promise<void> {
    // Resume support: skip a stock only if it already has a candle for the most
    // recent trading day. Using "any candle in last 2 days" was buggy: a single
    // misstamped candle (e.g. a weekend/intraday row) could stick and prevent
    // backfill of the real mid-range days forever.
    const mostRecent = mostRecentTradingDayIST();

    const stocks = await Stock.find({ isActive: true, isIndex: false }).lean();
    let done = 0;
    let skipped = 0;

    logger.info(`Fetching daily candles for ${stocks.length} stocks (target trading day: ${mostRecent.toISOString().slice(0, 10)})...`);

    for (const stock of stocks) {
      try {
        const existing = await Candle.findOne({
          stockToken: stock.token,
          interval: 'ONE_DAY',
          timestamp: { $gte: mostRecent },
        }).lean();

        if (existing) {
          skipped++;
          continue;
        }

        await this.fetchDailyCandles(stock.token, 365);
        done++;

        if (done % 100 === 0) {
          logger.info(`Candle fetch progress: ${done} fetched, ${skipped} skipped, ${stocks.length - done - skipped} remaining`);
        }
      } catch (error) {
        logger.error(`Failed to fetch candles for ${stock.symbol}:`, error);
      }
    }

    logger.info(`Finished fetching daily candles: ${done} fetched, ${skipped} skipped`);
  }

  /** Compute indicators and scores for all stocks */
  async computeAllMetrics(): Promise<void> {
    const stocks = await Stock.find({ isActive: true, isIndex: false }).lean();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Get market score once
    const niftyCandles = await Candle.find({
      stockToken: INDEX_TOKENS.NIFTY_50,
      interval: 'ONE_DAY',
    })
      .sort({ timestamp: -1 })
      .limit(200)
      .lean();
    const niftyCloses = niftyCandles.reverse().map((c) => c.close);
    const marketScore = this.scoringService.computeMarketScore(niftyCloses);

    // Determine current market regime with N-day smoothing to avoid whipsaw.
    const rawRegime = this.indicatorService.classifyMarketRegime(niftyCloses);
    const regime = await this.resolveSmoothedRegime(rawRegime, today, niftyCloses[niftyCloses.length - 1] ?? 0);
    logger.info(`Market regime: raw=${rawRegime} smoothed=${regime}`);

    for (const stock of stocks) {
      try {
        const candles = await Candle.find({
          stockToken: stock.token,
          interval: 'ONE_DAY',
        })
          .sort({ timestamp: -1 })
          .limit(200)
          .lean();

        if (candles.length < 50) continue; // Not enough data

        const closes = candles.reverse().map((c) => c.close);
        const volumes = candles.map((c) => c.volume);
        const highs = candles.map((c) => c.high);
        const lows = candles.map((c) => c.low);

        // Compute indicators
        const indicators = this.indicatorService.computeAll(closes, highs, volumes);

        // Risk metrics
        const currentPrice = closes[closes.length - 1] ?? 0;
        const volatility20d = this.indicatorService.calcVolatility(closes, 20);
        const maxDrawdown90d = this.indicatorService.calcMaxDrawdown(closes, 90);
        const atr14 = this.indicatorService.calcATR(highs, lows, closes, 14);
        const tradedValue20d = this.indicatorService.calcTradedValue(indicators.avgVolume20, currentPrice);
        const riskScore = this.scoringService.computeRiskScore({
          volatility: volatility20d,
          maxDrawdown: maxDrawdown90d,
          atr14,
          price: currentPrice,
          tradedValue: tradedValue20d,
        });

        // Get existing fundamental data
        const existingMetric = await StockMetric.findOne({ symbol: stock.symbol })
          .sort({ date: -1 })
          .lean();

        // Compute scores
        const technicalScore = this.scoringService.computeTechnicalScore(closes, indicators);
        const fundamentalScore = existingMetric
          ? this.scoringService.computeFundamentalScore(existingMetric as any)
          : 50; // Default if no fundamentals

        // Get sector score
        const sectorData = await SectorData.findOne({ sector: stock.sector })
          .sort({ date: -1 })
          .lean();
        const sectorScore = sectorData?.sectorScore || 50;

        const { finalScore, weightsUsed } = this.scoringService.computeFinalScore(
          marketScore,
          sectorScore,
          fundamentalScore,
          technicalScore,
          regime
        );
        const adjustedFinalScore = this.scoringService.computeAdjustedFinalScore(finalScore, riskScore);

        await StockMetric.findOneAndUpdate(
          { symbol: stock.symbol, date: today },
          {
            symbol: stock.symbol,
            date: today,
            // Keep existing fundamentals
            pe: existingMetric?.pe ?? null,
            roe: existingMetric?.roe ?? null,
            roce: existingMetric?.roce ?? null,
            debtToEquity: existingMetric?.debtToEquity ?? null,
            revenueGrowthYoY: existingMetric?.revenueGrowthYoY ?? null,
            profitGrowthYoY: existingMetric?.profitGrowthYoY ?? null,
            profitMargin: existingMetric?.profitMargin ?? null,
            marketCap: existingMetric?.marketCap ?? null,
            bookValue: existingMetric?.bookValue ?? null,
            dividendYield: existingMetric?.dividendYield ?? null,
            promoterHolding: existingMetric?.promoterHolding ?? null,
            fundamentalsUpdatedAt: existingMetric?.fundamentalsUpdatedAt ?? null,
            // Technicals
            ...indicators,
            // Risk
            volatility20d,
            maxDrawdown90d,
            atr14,
            tradedValue20d,
            riskScore,
            adjustedFinalScore,
            // Scores
            fundamentalScore,
            technicalScore,
            sectorScore,
            marketScore,
            finalScore,
            marketRegime: regime,
            weightsUsed,
          },
          { upsert: true }
        );
      } catch (error) {
        logger.error(`Failed to compute metrics for ${stock.symbol}:`, error);
      }
    }

    logger.info('Finished computing metrics for all stocks');
  }

  /** Fetch fundamentals from Yahoo Finance for a batch of stocks */
  async fetchFundamentalsBatch(batchSize: number = 30): Promise<void> {
    // Get stocks that haven't been updated recently
    const cutoffDate = new Date(Date.now() - ALPHA_VANTAGE.CACHE_DAYS * 24 * 60 * 60 * 1000);

    const stocks = await Stock.find({ isActive: true, isIndex: false }).lean();

    // Prioritize stocks without fundamental data or with stale data
    const needsUpdate: typeof stocks = [];
    for (const stock of stocks) {
      const metric = await StockMetric.findOne({ symbol: stock.symbol })
        .sort({ date: -1 })
        .lean();

      if (!metric?.fundamentalsUpdatedAt || metric.fundamentalsUpdatedAt < cutoffDate) {
        needsUpdate.push(stock);
      }
      if (needsUpdate.length >= batchSize) break;
    }

    logger.info(`Fetching fundamentals for ${needsUpdate.length} stocks via Yahoo Finance...`);
    let success = 0;

    for (const stock of needsUpdate) {
      try {
        const fundamentals = await this.yahooFinance.getCompanyFundamentals(stock.symbol);
        if (fundamentals) {
          // quarterlyEarnings is captured in Yahoo response but not persisted on StockMetric
          // (we only keep the derived growth % array and consistency score).
          const { quarterlyEarnings, quarterlyEpsGrowth, ...rest } = fundamentals;
          const earningsConsistencyScore =
            quarterlyEpsGrowth.length >= 2
              ? this.scoringService.computeEarningsConsistency(quarterlyEpsGrowth)
              : null;

          // Update the latest existing metric (not by today's date)
          // This ensures fundamentals land on the same doc that has technicals
          const updated = await StockMetric.findOneAndUpdate(
            { symbol: stock.symbol },
            {
              $set: {
                ...rest,
                quarterlyEpsGrowth,
                earningsConsistencyScore,
                fundamentalsUpdatedAt: new Date(),
              },
            },
            { sort: { date: -1 }, new: true }
          );

          if (!updated) {
            // No metric exists yet — create one for today
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            await StockMetric.create({
              symbol: stock.symbol,
              date: today,
              ...rest,
              quarterlyEpsGrowth,
              earningsConsistencyScore,
              fundamentalsUpdatedAt: new Date(),
            });
          }

          success++;
          logger.debug(`Updated fundamentals for ${stock.symbol}`);
        }

        // Rate limit: ~2 requests per second to avoid Yahoo throttling
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Failed to fetch fundamentals for ${stock.symbol}:`, error);
      }
    }

    logger.info(`Finished fetching fundamentals: ${success}/${needsUpdate.length} updated`);
  }

  /** Get market status (Nifty + BankNifty) */
  async getMarketStatus(): Promise<MarketStatus> {
    await this.ensureInit();

    // Get live LTP
    const ltpMap = await this.smartApi.getLTP(
      [INDEX_TOKENS.NIFTY_50, INDEX_TOKENS.BANK_NIFTY],
      EXCHANGE.NSE
    );

    // Get historical candles for trend computation
    const [niftyCandles, bankNiftyCandles] = await Promise.all([
      Candle.find({ stockToken: INDEX_TOKENS.NIFTY_50, interval: 'ONE_DAY' })
        .sort({ timestamp: -1 })
        .limit(200)
        .lean(),
      Candle.find({ stockToken: INDEX_TOKENS.BANK_NIFTY, interval: 'ONE_DAY' })
        .sort({ timestamp: -1 })
        .limit(200)
        .lean(),
    ]);

    const buildIndexStatus = (
      name: string,
      token: string,
      candles: any[]
    ): IndexStatus => {
      const closes = candles.reverse().map((c: any) => c.close);
      const currentPrice = ltpMap.get(token) || closes[closes.length - 1] || 0;
      const prevClose = closes[closes.length - 2] || currentPrice;
      const sma50 = this.indicatorService.calcSMA(closes, 50);
      const sma200 = this.indicatorService.calcSMA(closes, 200);
      const lastSma50 = sma50[sma50.length - 1] || 0;
      const lastSma200 = sma200[sma200.length - 1] || 0;

      // Delegate to the pure classifier so live-status and scoring share the same rule.
      const closesWithLive = [...closes.slice(0, -1), currentPrice];
      const trend = this.indicatorService.classifyMarketRegime(closesWithLive);

      return {
        name,
        token,
        ltp: currentPrice,
        change: currentPrice - prevClose,
        changePercent: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0,
        sma50: lastSma50,
        sma200: lastSma200,
        trend,
      };
    };

    const nifty = buildIndexStatus('NIFTY 50', INDEX_TOKENS.NIFTY_50, niftyCandles);
    const bankNifty = buildIndexStatus('BANK NIFTY', INDEX_TOKENS.BANK_NIFTY, bankNiftyCandles);

    const niftyCloses = niftyCandles.map((c: any) => c.close);
    const marketScore = this.scoringService.computeMarketScore(niftyCloses);

    return {
      isOpen: isMarketOpen(),
      nifty,
      bankNifty,
      marketScore,
      confidence: Math.min(100, Math.max(0, marketScore)),
      timestamp: new Date(),
    };
  }

  /** Get sector rankings */
  async getSectorRankings(): Promise<SectorRanking[]> {
    const sectors = await SectorData.find()
      .sort({ date: -1 })
      .lean();

    // Get latest entry per sector
    const latestMap = new Map<string, any>();
    for (const s of sectors) {
      if (!latestMap.has(s.sector)) {
        latestMap.set(s.sector, s);
      }
    }

    return Array.from(latestMap.values())
      .map((s) => ({
        sector: s.sector,
        avgChange: s.avgChange,
        sectorScore: s.sectorScore,
        stockCount: s.stockCount,
        topGainer: s.topGainer,
        topLoser: s.topLoser,
        advances: s.advanceDecline.advances,
        declines: s.advanceDecline.declines,
      }))
      .sort((a, b) => b.sectorScore - a.sectorScore);
  }

  /** Compute and store sector data */
  async computeSectorData(): Promise<void> {
    const stocks = await Stock.find({ isActive: true, isIndex: false }).lean();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Group by sector
    const sectorStocks = new Map<string, typeof stocks>();
    for (const stock of stocks) {
      const sector = stock.sector || 'Unknown';
      if (!sectorStocks.has(sector)) sectorStocks.set(sector, []);
      sectorStocks.get(sector)!.push(stock);
    }

    for (const [sector, sectorStockList] of sectorStocks) {
      const metrics = await StockMetric.find({
        symbol: { $in: sectorStockList.map((s) => s.symbol) },
        date: today,
      }).lean();

      if (metrics.length === 0) continue;

      // Compute sector aggregates
      const changes = metrics.map((m) => {
        const candle = m as any; // Has technicalScore at least
        return { symbol: m.symbol, change: 0, score: m.technicalScore };
      });

      const avgChange = changes.reduce((sum, c) => sum + c.change, 0) / changes.length;
      const sorted = [...changes].sort((a, b) => b.score - a.score);
      const advances = changes.filter((c) => c.change > 0).length;
      const declines = changes.filter((c) => c.change < 0).length;

      const sectorScore = this.scoringService.computeSectorScore(
        avgChange,
        advances,
        declines,
        metrics.map((m) => m.technicalScore)
      );

      await SectorData.findOneAndUpdate(
        { sector, date: today },
        {
          sector,
          date: today,
          avgChange,
          topGainer: sorted[0] ? { symbol: sorted[0].symbol, change: sorted[0].score } : { symbol: '', change: 0 },
          topLoser: sorted[sorted.length - 1]
            ? { symbol: sorted[sorted.length - 1].symbol, change: sorted[sorted.length - 1].score }
            : { symbol: '', change: 0 },
          sectorScore,
          stockCount: sectorStockList.length,
          advanceDecline: { advances, declines },
        },
        { upsert: true }
      );
    }

    logger.info('Finished computing sector data');
  }

  /**
   * Smooth today's raw regime against recent MarketState history.
   * Only flip the persisted regime when the last REGIME_SMOOTHING_DAYS raw readings agree;
   * otherwise carry forward yesterday's regime. Persists today's MarketState row.
   */
  private async resolveSmoothedRegime(
    rawRegime: MarketRegime,
    today: Date,
    niftyClose: number
  ): Promise<MarketRegime> {
    const history = await MarketState.find({ date: { $lt: today } })
      .sort({ date: -1 })
      .limit(REGIME_SMOOTHING_DAYS - 1)
      .lean();

    const previousRegime = history[0]?.regime;
    const recentRaw = [rawRegime, ...history.map((h) => h.rawRegime)];

    let resolvedRegime: MarketRegime;
    let smoothed = false;
    if (!previousRegime) {
      resolvedRegime = rawRegime;
    } else if (
      recentRaw.length >= REGIME_SMOOTHING_DAYS &&
      recentRaw.every((r) => r === rawRegime)
    ) {
      resolvedRegime = rawRegime;
    } else if (rawRegime === previousRegime) {
      resolvedRegime = rawRegime;
    } else {
      resolvedRegime = previousRegime;
      smoothed = true;
    }

    await MarketState.findOneAndUpdate(
      { date: today },
      { date: today, rawRegime, regime: resolvedRegime, smoothed, niftyClose },
      { upsert: true }
    );

    return resolvedRegime;
  }
}
