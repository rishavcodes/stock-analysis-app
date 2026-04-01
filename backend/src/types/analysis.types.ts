import { z } from 'zod';

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
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;

export interface StockAnalysisInput {
  symbol: string;
  name: string;
  sector: string;
  currentPrice: number;
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
