import mongoose, { Schema, Document } from 'mongoose';

export type BacktestStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
export type BacktestExitRule = 'TECHNICAL' | 'FIXED_HOLD' | 'AI_RULES';

export interface BacktestConfig {
  from: Date;
  to: Date;
  scoreThreshold: number;
  exitRule: BacktestExitRule;
  technicalExitThreshold: number;
  maxHoldDays: number;
  stopLossAtrMultiple: number;
  targetAtrMultiple: number;
  holdDays: number;
  capital: number;
  positionSizePct: number;
  slippagePct: number;
  maxConcurrentPositions: number;
  useHistoricalSectors: boolean;
}

export interface EquityPoint {
  date: Date;
  equity: number;
}

export interface BacktestResults {
  winRate: number;
  avgReturnPct: number;
  maxDrawdown: number;
  sharpe: number;
  totalTrades: number;
  wins: number;
  losses: number;
  equityCurve: EquityPoint[];
  notes: string[];
}

export interface IBacktestRun extends Document {
  config: BacktestConfig;
  status: BacktestStatus;
  startedAt?: Date;
  completedAt?: Date;
  results?: BacktestResults;
  error?: string;
}

const backtestConfigSchema = new Schema<BacktestConfig>(
  {
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    scoreThreshold: { type: Number, required: true },
    exitRule: { type: String, enum: ['TECHNICAL', 'FIXED_HOLD', 'AI_RULES'], required: true },
    technicalExitThreshold: { type: Number, required: true },
    maxHoldDays: { type: Number, required: true },
    stopLossAtrMultiple: { type: Number, required: true },
    targetAtrMultiple: { type: Number, required: true },
    holdDays: { type: Number, required: true },
    capital: { type: Number, required: true },
    positionSizePct: { type: Number, required: true },
    slippagePct: { type: Number, required: true },
    maxConcurrentPositions: { type: Number, required: true },
    useHistoricalSectors: { type: Boolean, required: true },
  },
  { _id: false }
);

const equityPointSchema = new Schema<EquityPoint>(
  { date: { type: Date, required: true }, equity: { type: Number, required: true } },
  { _id: false }
);

const resultsSchema = new Schema<BacktestResults>(
  {
    winRate: { type: Number, required: true },
    avgReturnPct: { type: Number, required: true },
    maxDrawdown: { type: Number, required: true },
    sharpe: { type: Number, required: true },
    totalTrades: { type: Number, required: true },
    wins: { type: Number, required: true },
    losses: { type: Number, required: true },
    equityCurve: { type: [equityPointSchema], default: [] },
    notes: { type: [String], default: [] },
  },
  { _id: false }
);

const backtestRunSchema = new Schema<IBacktestRun>(
  {
    config: { type: backtestConfigSchema, required: true },
    status: { type: String, enum: ['PENDING', 'RUNNING', 'DONE', 'FAILED'], default: 'PENDING' },
    startedAt: { type: Date },
    completedAt: { type: Date },
    results: { type: resultsSchema },
    error: { type: String },
  },
  { timestamps: true }
);

backtestRunSchema.index({ status: 1, startedAt: -1 });

export const BacktestRun = mongoose.model<IBacktestRun>('BacktestRun', backtestRunSchema);
