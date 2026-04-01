import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { env } from '../config/env';
import { Stock } from '../models/Stock';
import { Candle } from '../models/Candle';
import { StockMetric } from '../models/StockMetric';
import { SectorData } from '../models/SectorData';
import { AnalysisLog, IAnalysisLog } from '../models/AnalysisLog';
import { AnalysisOutputSchema, StockAnalysisInput } from '../types/analysis.types';
import { AI_CACHE, INDEX_TOKENS } from '../config/constants';
import { isMarketOpen } from '../utils/market-hours';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';

const SYSTEM_PROMPT = `You are an expert Indian equity research analyst specializing in short-term investing (2-6 month horizon).

You will receive structured data about a stock including price history, technical indicators, fundamental metrics, and market context. Analyze all inputs to generate an actionable recommendation.

Guidelines:
- BUY: Strong technicals + supportive fundamentals + favorable market/sector. Confidence > 60.
- WATCH: Mixed signals or neutral setup. Wait for confirmation. Confidence 40-60.
- AVOID: Weak technicals, deteriorating fundamentals, or bearish market. Confidence reflects risk.
- Consider the Indian market context (NSE, regulatory environment, FII/DII activity patterns).
- For short-term (2-6 months), weight technicals more heavily but don't ignore fundamentals.
- Entry price should be near support or breakout level.
- Stop-loss should be below key support (typically 5-8% below entry).
- Target should be at resistance or based on risk-reward ratio of at least 2:1.
- Be specific and quantitative in your reasoning.`;

export class AIAnalysisService {
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  /** Get cached analysis if still valid */
  private async getCachedAnalysis(symbol: string) {
    return AnalysisLog.findOne({
      symbol,
      expiresAt: { $gt: new Date() },
    })
      .sort({ analysisDate: -1 })
      .lean();
  }

  /** Build the analysis input from database data */
  private async buildInput(symbol: string): Promise<StockAnalysisInput> {
    const stock = await Stock.findOne({ symbol }).lean();
    if (!stock) throw new AppError(404, `Stock ${symbol} not found`);

    const [metric, candles, sectorData, niftyCandles] = await Promise.all([
      StockMetric.findOne({ symbol }).sort({ date: -1 }).lean(),
      Candle.find({ stockToken: stock.token, interval: 'ONE_DAY' })
        .sort({ timestamp: -1 })
        .limit(60)
        .lean(),
      SectorData.findOne({ sector: stock.sector }).sort({ date: -1 }).lean(),
      Candle.find({ stockToken: INDEX_TOKENS.NIFTY_50, interval: 'ONE_DAY' })
        .sort({ timestamp: -1 })
        .limit(5)
        .lean(),
    ]);

    if (!metric) throw new AppError(400, `No metrics available for ${symbol}. Run metric computation first.`);

    const sortedCandles = candles.reverse();
    const currentPrice = sortedCandles[sortedCandles.length - 1]?.close || 0;
    const niftyTrend = niftyCandles.length > 0 ? (niftyCandles[0].close > niftyCandles[niftyCandles.length - 1].close ? 'Bullish' : 'Bearish') : 'Unknown';

    return {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      currentPrice,
      priceData: sortedCandles.slice(-30).map((c) => ({
        timestamp: c.timestamp.toISOString().split('T')[0],
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      })),
      indicators: {
        sma20: metric.sma20,
        sma50: metric.sma50,
        sma200: metric.sma200,
        rsi14: metric.rsi14,
        macdLine: metric.macdLine,
        macdSignal: metric.macdSignal,
        macdHistogram: metric.macdHistogram,
        bollingerUpper: metric.bollingerUpper,
        bollingerLower: metric.bollingerLower,
        avgVolume20: metric.avgVolume20,
        volumeRatio: metric.volumeRatio,
      },
      fundamentals: {
        pe: metric.pe,
        roe: metric.roe,
        debtToEquity: metric.debtToEquity,
        revenueGrowthYoY: metric.revenueGrowthYoY,
        profitMargin: metric.profitMargin,
        marketCap: metric.marketCap,
      },
      scores: {
        fundamentalScore: metric.fundamentalScore,
        technicalScore: metric.technicalScore,
        sectorScore: metric.sectorScore,
        marketScore: metric.marketScore,
        finalScore: metric.finalScore,
      },
      marketContext: {
        niftyTrend,
        sectorStrength: sectorData ? `${sectorData.sector}: Score ${sectorData.sectorScore}/100` : 'Unknown',
      },
    };
  }

  /** Analyze a stock using Claude */
  async analyzeStock(symbol: string, force: boolean = false) {
    // Check cache first
    if (!force) {
      const cached = await this.getCachedAnalysis(symbol);
      if (cached) {
        logger.debug(`Returning cached analysis for ${symbol}`);
        return cached;
      }
    }

    const input = await this.buildInput(symbol);

    try {
      const response = await this.client.messages.create({
        model: 'claude-sonnet-4-6-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Analyze the following Indian stock for short-term (2-6 months) investing potential:\n\n${JSON.stringify(input, null, 2)}`,
          },
        ],
      });

      // Extract text content
      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      // Parse the response - try JSON extraction first
      let analysisOutput;
      try {
        const jsonMatch = textBlock.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          analysisOutput = AnalysisOutputSchema.parse(JSON.parse(jsonMatch[0]));
        } else {
          // If Claude didn't return JSON, construct from text
          analysisOutput = {
            recommendation: 'WATCH' as const,
            confidence: 50,
            summary: textBlock.text.slice(0, 500),
            bullishFactors: [],
            bearishFactors: [],
            entryPrice: null,
            targetPrice: null,
            stopLoss: null,
            timeHorizon: 'SHORT_TERM' as const,
          };
        }
      } catch {
        analysisOutput = {
          recommendation: 'WATCH' as const,
          confidence: 50,
          summary: textBlock.text.slice(0, 500),
          bullishFactors: [],
          bearishFactors: [],
          entryPrice: null,
          targetPrice: null,
          stopLoss: null,
          timeHorizon: 'SHORT_TERM' as const,
        };
      }

      // Determine cache duration
      const cacheDuration = isMarketOpen() ? AI_CACHE.MARKET_HOURS_MS : AI_CACHE.AFTER_HOURS_MS;

      // Store in database
      const analysisLog = await AnalysisLog.create({
        symbol,
        analysisDate: new Date(),
        recommendation: analysisOutput.recommendation,
        confidence: analysisOutput.confidence,
        summary: analysisOutput.summary,
        bullishFactors: analysisOutput.bullishFactors,
        bearishFactors: analysisOutput.bearishFactors,
        entryPrice: analysisOutput.entryPrice,
        targetPrice: analysisOutput.targetPrice,
        stopLoss: analysisOutput.stopLoss,
        timeHorizon: analysisOutput.timeHorizon,
        inputData: input,
        modelUsed: 'claude-sonnet-4-6-20250514',
        expiresAt: new Date(Date.now() + cacheDuration),
      });

      logger.info(`AI analysis completed for ${symbol}: ${analysisOutput.recommendation} (${analysisOutput.confidence}%)`);
      return analysisLog;
    } catch (error) {
      logger.error(`AI analysis failed for ${symbol}:`, error);
      throw new AppError(500, `AI analysis failed for ${symbol}`);
    }
  }
}
