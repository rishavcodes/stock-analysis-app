import { z } from 'zod';

export const ReasoningSchema = z.object({
  market: z.string().optional(),
  sector: z.string().optional(),
  technical: z.string().optional(),
  fundamental: z.string().optional(),
  synthesis: z.string().optional(),
});

export type Reasoning = z.infer<typeof ReasoningSchema>;

// Claude AI analysis output schema
export const AnalysisOutputSchema = z.object({
  recommendation: z.enum(['BUY', 'AVOID', 'WATCH']),
  confidence: z.number().min(0).max(100),
  summary: z.string(),
  bullishFactors: z.array(z.string()),
  bearishFactors: z.array(z.string()),
  entryPrice: z.number().nullable(),
  targetPrice: z.number().nullable(),
  stopLoss: z.number().nullable(),
  timeHorizon: z.enum(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM']),
  reasoning: ReasoningSchema.optional(),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

export interface StockAnalysisInput {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;
  /** Source of `currentPrice`: "LIVE_LTP" when fetched from broker in real-time, "LAST_CANDLE_CLOSE" when we fell back to the stored candle. */
  priceSource: 'LIVE_LTP' | 'LAST_CANDLE_CLOSE';
  /** Date (YYYY-MM-DD) of the most recent candle used for indicators. May be before today. */
  indicatorsAsOf: string;
  /** True when live LTP is materially different from the last stored candle close (> 2%). */
  priceGapFromLastCandle: { pctMove: number; stale: boolean };
  priceData: {
    timestamp: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }[];
  indicators: {
    sma20: number;
    sma50: number;
    sma200: number;
    rsi14: number;
    macdLine: number;
    macdSignal: number;
    macdHistogram: number;
    bollingerUpper: number;
    bollingerLower: number;
    avgVolume20: number;
    volumeRatio: number;
  };
  fundamentals: {
    pe: number | null;
    roe: number | null;
    debtToEquity: number | null;
    revenueGrowthYoY: number | null;
    profitMargin: number | null;
    marketCap: number | null;
  };
  scores: {
    fundamentalScore: number;
    technicalScore: number;
    sectorScore: number;
    marketScore: number;
    finalScore: number;
  };
  marketContext: {
    niftyTrend: string;
    sectorStrength: string;
  };
  decisionTrace?: DecisionTrace;
}

export interface Indicators {
  sma20: number;
  sma50: number;
  sma200: number;
  ema20: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  avgVolume20: number;
  volumeRatio: number;
  isBreakout: boolean;
  breakoutType: 'PRICE' | 'VOLUME' | null;
  trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
}

export const DecisionTraceSchema = z.object({
  regimeDetected: z.enum(['BULLISH', 'BEARISH', 'SIDEWAYS']).nullable(),
  weightsUsed: z
    .object({
      market: z.number(),
      sector: z.number(),
      fundamental: z.number(),
      technical: z.number(),
    })
    .nullable(),
  subScoresAtTime: z.object({
    market: z.number(),
    sector: z.number(),
    fundamental: z.number(),
    technical: z.number(),
    risk: z.number().optional(),
  }),
  indicatorsAtTime: z.record(z.number()),
  riskFactors: z
    .object({
      volatility20d: z.number(),
      maxDrawdown90d: z.number(),
      atr14: z.number(),
      tradedValue20d: z.number().optional(),
    })
    .optional(),
  niftyTrend: z.string(),
  sectorStrength: z.string(),
});

export type DecisionTrace = z.infer<typeof DecisionTraceSchema>;
