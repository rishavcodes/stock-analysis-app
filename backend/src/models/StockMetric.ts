import mongoose, { Schema, Document } from 'mongoose';

export interface IStockMetric extends Document {
  symbol: string;
  date: Date;

  // Fundamentals (Alpha Vantage)
  pe: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  revenueGrowthYoY: number | null;
  profitGrowthYoY: number | null;
  profitMargin: number | null;
  marketCap: number | null;
  bookValue: number | null;
  dividendYield: number | null;
  promoterHolding: number | null;

  // Technicals (computed)
  sma20: number;
  sma50: number;
  sma200: number;
  ema20: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  bollingerUpper: number;
  bollingerLower: number;
  avgVolume20: number;
  volumeRatio: number;

  // Scores
  fundamentalScore: number;
  technicalScore: number;
  sectorScore: number;
  marketScore: number;
  finalScore: number;

  // Signals
  isBreakout: boolean;
  breakoutType: 'PRICE' | 'VOLUME' | null;
  trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS';

  // Metadata
  fundamentalsUpdatedAt: Date | null;
}

const stockMetricSchema = new Schema<IStockMetric>(
  {
    symbol: { type: String, required: true },
    date: { type: Date, required: true },

    // Fundamentals
    pe: { type: Number, default: null },
    roe: { type: Number, default: null },
    roce: { type: Number, default: null },
    debtToEquity: { type: Number, default: null },
    revenueGrowthYoY: { type: Number, default: null },
    profitGrowthYoY: { type: Number, default: null },
    profitMargin: { type: Number, default: null },
    marketCap: { type: Number, default: null },
    bookValue: { type: Number, default: null },
    dividendYield: { type: Number, default: null },
    promoterHolding: { type: Number, default: null },

    // Technicals
    sma20: { type: Number, default: 0 },
    sma50: { type: Number, default: 0 },
    sma200: { type: Number, default: 0 },
    ema20: { type: Number, default: 0 },
    rsi14: { type: Number, default: 50 },
    macdLine: { type: Number, default: 0 },
    macdSignal: { type: Number, default: 0 },
    macdHistogram: { type: Number, default: 0 },
    bollingerUpper: { type: Number, default: 0 },
    bollingerLower: { type: Number, default: 0 },
    avgVolume20: { type: Number, default: 0 },
    volumeRatio: { type: Number, default: 1 },

    // Scores
    fundamentalScore: { type: Number, default: 0, min: 0, max: 100 },
    technicalScore: { type: Number, default: 0, min: 0, max: 100 },
    sectorScore: { type: Number, default: 0, min: 0, max: 100 },
    marketScore: { type: Number, default: 0, min: 0, max: 100 },
    finalScore: { type: Number, default: 0, min: 0, max: 100 },

    // Signals
    isBreakout: { type: Boolean, default: false },
    breakoutType: { type: String, enum: ['PRICE', 'VOLUME', null], default: null },
    trendDirection: { type: String, enum: ['UP', 'DOWN', 'SIDEWAYS'], default: 'SIDEWAYS' },

    fundamentalsUpdatedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

stockMetricSchema.index({ symbol: 1, date: -1 }, { unique: true });
stockMetricSchema.index({ finalScore: -1 });

export const StockMetric = mongoose.model<IStockMetric>('StockMetric', stockMetricSchema);
