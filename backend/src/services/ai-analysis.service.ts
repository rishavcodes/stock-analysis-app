import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { Stock } from '../models/Stock';
import { Candle } from '../models/Candle';
import { StockMetric } from '../models/StockMetric';
import { SectorData } from '../models/SectorData';
import { AnalysisLog } from '../models/AnalysisLog';
import { AnalysisOutput, AnalysisOutputSchema, DecisionTrace, DecisionTraceSchema, StockAnalysisInput } from '../types/analysis.types';
import { AI_CACHE, INDEX_TOKENS } from '../config/constants';
import { isMarketOpen } from '../utils/market-hours';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';
import { SmartAPIService } from './smartapi.service';

const MIN_RISK_REWARD_RATIO = 2;

const SYSTEM_PROMPT = `You are an expert Indian equity research analyst specializing in short-term investing (2-6 month horizon).

You will receive structured data about a stock including price history, technical indicators, fundamental metrics, and market context. Analyze all inputs to generate an actionable recommendation.

OUTPUT FORMAT (STRICT):
Return ONLY a single JSON object. No markdown fences, no prose before or after. The object must match this shape exactly:

{
  "recommendation": "BUY" | "WATCH" | "AVOID",
  "confidence": number 0-100,
  "summary": string,
  "bullishFactors": string[],
  "bearishFactors": string[],
  "entryPrice": number | null,
  "targetPrice": number | null,
  "stopLoss": number | null,
  "timeHorizon": "SHORT_TERM" | "MEDIUM_TERM" | "LONG_TERM",
  "reasoning": {
    "market": string,      // 1-2 sentences on Nifty trend + regime
    "sector": string,      // 1-2 sentences on sector strength
    "technical": string,   // 1-2 sentences on price action, MAs, RSI, MACD, volume
    "fundamental": string, // 1-2 sentences on PE/ROE/growth/margins
    "synthesis": string    // 1-2 sentences tying it all together + final call
  }
}

REASONING ORDER (MUST follow exactly): market -> sector -> technical -> fundamental -> synthesis.
Do not ignore the numeric scores in the input. If your reasoning conflicts with the scores, explicitly call out the conflict in "synthesis".

RECOMMENDATION RULES:
- BUY: Strong technicals + supportive fundamentals + favorable market/sector. Confidence > 60. entryPrice, targetPrice, stopLoss ALL required (non-null).
- WATCH: Mixed signals or neutral setup. Confidence 40-60. entryPrice may be a watch-trigger level.
- AVOID: Weak technicals, deteriorating fundamentals, or bearish market. targetPrice and stopLoss may be null.

RISK-REWARD RULE (HARD CONSTRAINT for BUY):
(targetPrice - entryPrice) / (entryPrice - stopLoss) MUST be >= ${MIN_RISK_REWARD_RATIO}.
If you cannot construct entry/target/stop levels satisfying this ratio (e.g. nearest resistance is too close to support), you MUST downgrade the recommendation to WATCH and explain why in "synthesis".

PRICE DATA FRESHNESS:
- \`currentPrice\` is the authoritative current market price. When \`priceSource === "LIVE_LTP"\` it is a real-time broker quote.
- \`priceData\` (OHLCV) and all \`indicators\` (SMAs, RSI, MACD, Bollinger, etc.) are computed from daily candles as of \`indicatorsAsOf\` — this is typically the prior trading session's close and may be 1+ days behind \`currentPrice\`.
- If \`priceGapFromLastCandle.stale === true\` (|move| > 2% since last candle), the stock has moved significantly since indicators were computed. Mention this explicitly in \`reasoning.technical\` and be cautious: indicator levels (SMA, Bollinger bands, breakout thresholds) reflect yesterday's price — don't quote them as if they're current.
- ALL price levels (\`entryPrice\`, \`targetPrice\`, \`stopLoss\`) MUST be expressed relative to \`currentPrice\`, not the last candle close. Never suggest entering at a price materially below the live price unless you explicitly intend a pullback-entry WATCH call.

LEVEL GUIDANCE:
- entryPrice: near \`currentPrice\` (at-market or a small pullback). For BUY, do NOT set entryPrice more than ~2% below \`currentPrice\` — use WATCH if you want a deeper pullback.
- stopLoss: below key support, typically 5-8% below entry.
- targetPrice: at the next meaningful resistance or computed from a >=2:1 R:R.
- Be specific and quantitative. Reference actual input numbers.`;

const RETRY_PROMPT = 'Your previous response did not parse as valid JSON matching the required schema. Return ONLY the JSON object, no prose, no code fences. Follow the schema from the system prompt exactly.';

export function extractJsonBlock(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const match = text.match(/\{[\s\S]*\}/);
  return match ? match[0] : null;
}

export function computeRiskReward(entry: number | null, target: number | null, stop: number | null): number | null {
  if (entry == null || target == null || stop == null) return null;
  const reward = target - entry;
  const risk = entry - stop;
  if (risk <= 0 || reward <= 0) return null;
  return reward / risk;
}

/** Parse Claude response text into a validated AnalysisOutput. Throws on failure. */
export function parseClaudeResponse(text: string): AnalysisOutput {
  const jsonBlock = extractJsonBlock(text);
  if (!jsonBlock) throw new Error('No JSON block found in Claude response');
  const parsed = JSON.parse(jsonBlock);
  return AnalysisOutputSchema.parse(parsed);
}

/**
 * Apply the server-side risk-reward guardrail.
 * BUY with R:R < 2 (or any null price level) is auto-downgraded to WATCH.
 */
export function applyRiskRewardGuardrail(output: AnalysisOutput): AnalysisOutput {
  if (output.recommendation !== 'BUY') return output;

  const hasLevels = output.entryPrice != null && output.targetPrice != null && output.stopLoss != null;
  if (!hasLevels) {
    return {
      ...output,
      recommendation: 'WATCH',
      reasoning: {
        ...output.reasoning,
        synthesis: `${output.reasoning?.synthesis ?? ''}\nAuto-downgraded to WATCH: BUY requires non-null entry/target/stop.`.trim(),
      },
    };
  }

  const rr = computeRiskReward(output.entryPrice, output.targetPrice, output.stopLoss);
  if (rr == null || rr < MIN_RISK_REWARD_RATIO) {
    return {
      ...output,
      recommendation: 'WATCH',
      reasoning: {
        ...output.reasoning,
        synthesis: `${output.reasoning?.synthesis ?? ''}\nAuto-downgraded: R:R=${rr?.toFixed(2) ?? 'invalid'} < ${MIN_RISK_REWARD_RATIO}:1.`.trim(),
      },
    };
  }

  return output;
}

export class AIAnalysisService {
  private client: Anthropic;
  private smartApi: SmartAPIService;

  constructor() {
    this.client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
    this.smartApi = new SmartAPIService();
  }

  /** Fetch live LTP if possible; fall back silently to null on any error. */
  private async tryFetchLiveLTP(token: string, exchange: string): Promise<number | null> {
    try {
      await this.smartApi.initialize();
      const ltpMap = await this.smartApi.getLTP([token], exchange);
      return ltpMap.get(token) ?? null;
    } catch (error) {
      logger.warn(`AIAnalysis: live LTP unavailable, falling back to last candle close: ${error instanceof Error ? error.message : error}`);
      return null;
    }
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
    const lastCandleClose = sortedCandles[sortedCandles.length - 1]?.close || 0;
    const lastCandleDate = sortedCandles[sortedCandles.length - 1]?.timestamp ?? metric.date;
    const indicatorsAsOf = lastCandleDate.toISOString().split('T')[0];

    // Prefer live LTP over stored candle so Claude reasons against the actual current price.
    const liveLtp = await this.tryFetchLiveLTP(stock.token, stock.exchange);
    const usingLive = liveLtp != null && liveLtp > 0;
    const currentPrice = usingLive ? (liveLtp as number) : lastCandleClose;
    const priceSource = usingLive ? 'LIVE_LTP' : 'LAST_CANDLE_CLOSE';
    const pctMove =
      lastCandleClose > 0 && usingLive ? ((currentPrice - lastCandleClose) / lastCandleClose) * 100 : 0;
    const priceGapFromLastCandle = { pctMove, stale: Math.abs(pctMove) > 2 };

    const niftyTrend = niftyCandles.length > 0 ? (niftyCandles[0].close > niftyCandles[niftyCandles.length - 1].close ? 'Bullish' : 'Bearish') : 'Unknown';

    const sectorStrength = sectorData ? `${sectorData.sector}: Score ${sectorData.sectorScore}/100` : 'Unknown';

    const decisionTrace: DecisionTrace = DecisionTraceSchema.parse({
      regimeDetected: metric.marketRegime ?? null,
      weightsUsed: metric.weightsUsed ?? null,
      subScoresAtTime: {
        market: metric.marketScore,
        sector: metric.sectorScore,
        fundamental: metric.fundamentalScore,
        technical: metric.technicalScore,
        risk: metric.riskScore,
      },
      indicatorsAtTime: {
        sma20: metric.sma20,
        sma50: metric.sma50,
        sma200: metric.sma200,
        rsi14: metric.rsi14,
        macdLine: metric.macdLine,
        macdSignal: metric.macdSignal,
        macdHistogram: metric.macdHistogram,
        volumeRatio: metric.volumeRatio,
      },
      riskFactors: {
        volatility20d: metric.volatility20d ?? 0,
        maxDrawdown90d: metric.maxDrawdown90d ?? 0,
        atr14: metric.atr14 ?? 0,
        tradedValue20d: metric.tradedValue20d ?? 0,
      },
      niftyTrend,
      sectorStrength,
    });

    return {
      symbol: stock.symbol,
      name: stock.name,
      sector: stock.sector,
      currentPrice,
      priceSource,
      indicatorsAsOf,
      priceGapFromLastCandle,
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
        sectorStrength,
      },
      decisionTrace,
    };
  }

  /** Call Claude with the prompt and parse; retry once on parse failure. */
  private async callClaudeAndParse(input: StockAnalysisInput): Promise<AnalysisOutput> {
    const userMessage = `Analyze the following Indian stock for short-term (2-6 months) investing potential. Respond with ONLY the JSON object as specified:\n\n${JSON.stringify(input, null, 2)}`;

    const firstResponse = await this.client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const firstText = firstResponse.content.find((b) => b.type === 'text');
    if (!firstText || firstText.type !== 'text') throw new Error('No text response from Claude');

    try {
      return parseClaudeResponse(firstText.text);
    } catch {
      logger.warn(`Claude response failed first parse for ${input.symbol}, retrying once`);

      const retryResponse = await this.client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMessage },
          { role: 'assistant', content: firstText.text },
          { role: 'user', content: RETRY_PROMPT },
        ],
      });

      const retryText = retryResponse.content.find((b) => b.type === 'text');
      if (!retryText || retryText.type !== 'text') throw new Error('No text response from Claude on retry');

      return parseClaudeResponse(retryText.text);
    }
  }

  /** Analyze a stock using Claude */
  async analyzeStock(symbol: string, force: boolean = false) {
    if (!force) {
      const cached = await this.getCachedAnalysis(symbol);
      if (cached) {
        logger.debug(`Returning cached analysis for ${symbol}`);
        return cached;
      }
    }

    const input = await this.buildInput(symbol);

    try {
      const parsed = await this.callClaudeAndParse(input);
      const analysisOutput = applyRiskRewardGuardrail(parsed);
      if (analysisOutput.recommendation !== parsed.recommendation) {
        logger.warn(`R:R guardrail downgraded ${symbol} from ${parsed.recommendation} to ${analysisOutput.recommendation}`);
      }

      const cacheDuration = isMarketOpen() ? AI_CACHE.MARKET_HOURS_MS : AI_CACHE.AFTER_HOURS_MS;

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
        reasoning: analysisOutput.reasoning,
        inputData: input,
        modelUsed: 'claude-sonnet-4-6',
        expiresAt: new Date(Date.now() + cacheDuration),
      });

      logger.info(`AI analysis completed for ${symbol}: ${analysisOutput.recommendation} (${analysisOutput.confidence}%)`);
      if (input.decisionTrace) {
        logger.decision({
          symbol,
          recommendation: analysisOutput.recommendation,
          regime: input.decisionTrace.regimeDetected,
          weightsUsed: input.decisionTrace.weightsUsed,
          scores: {
            market: input.decisionTrace.subScoresAtTime.market,
            sector: input.decisionTrace.subScoresAtTime.sector,
            fundamental: input.decisionTrace.subScoresAtTime.fundamental,
            technical: input.decisionTrace.subScoresAtTime.technical,
            risk: input.decisionTrace.subScoresAtTime.risk,
            final: input.scores.finalScore,
          },
          confidence: analysisOutput.confidence,
        });
      }
      return analysisLog;
    } catch (error) {
      logger.error(`AI analysis failed for ${symbol}:`, error);
      throw new AppError(500, `AI analysis failed for ${symbol}`);
    }
  }
}
