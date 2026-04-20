import mongoose, { Schema, Document } from 'mongoose';

export type PredictionResult = 'WIN' | 'LOSS' | 'NEUTRAL' | 'UNEVALUABLE';
export type PredictionExitReason =
  | 'TARGET_HIT'
  | 'STOP_LOSS_HIT'
  | 'TIME_EXPIRED'
  | 'NO_EXIT_RULES'
  | 'INSUFFICIENT_DATA';

export interface IPredictionOutcome {
  evaluated: boolean;
  result?: PredictionResult;
  returnPct?: number;
  exitPrice?: number;
  exitReason?: PredictionExitReason;
  sameCandleHit?: boolean;
  evaluatedAt?: Date;
}

export interface IAnalysisLog extends Document {
  symbol: string;
  analysisDate: Date;
  recommendation: 'BUY' | 'AVOID' | 'WATCH';
  confidence: number;
  summary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  timeHorizon: 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
  reasoning?: {
    market?: string;
    sector?: string;
    technical?: string;
    fundamental?: string;
    synthesis?: string;
  };
  predictionOutcome: IPredictionOutcome;
  inputData: Record<string, unknown>;
  modelUsed: string;
  expiresAt: Date;
}

const reasoningSchema = new Schema(
  {
    market: { type: String },
    sector: { type: String },
    technical: { type: String },
    fundamental: { type: String },
    synthesis: { type: String },
  },
  { _id: false }
);

const predictionOutcomeSchema = new Schema(
  {
    evaluated: { type: Boolean, default: false, required: true },
    result: { type: String, enum: ['WIN', 'LOSS', 'NEUTRAL', 'UNEVALUABLE'] },
    returnPct: { type: Number },
    exitPrice: { type: Number },
    exitReason: {
      type: String,
      enum: ['TARGET_HIT', 'STOP_LOSS_HIT', 'TIME_EXPIRED', 'NO_EXIT_RULES', 'INSUFFICIENT_DATA'],
    },
    sameCandleHit: { type: Boolean },
    evaluatedAt: { type: Date },
  },
  { _id: false }
);

const analysisLogSchema = new Schema<IAnalysisLog>(
  {
    symbol: { type: String, required: true },
    analysisDate: { type: Date, required: true },
    recommendation: { type: String, required: true, enum: ['BUY', 'AVOID', 'WATCH'] },
    confidence: { type: Number, required: true, min: 0, max: 100 },
    summary: { type: String, required: true },
    bullishFactors: [{ type: String }],
    bearishFactors: [{ type: String }],
    entryPrice: { type: Number, default: null },
    targetPrice: { type: Number, default: null },
    stopLoss: { type: Number, default: null },
    timeHorizon: { type: String, enum: ['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM'], default: 'SHORT_TERM' },
    reasoning: { type: reasoningSchema, default: undefined },
    predictionOutcome: { type: predictionOutcomeSchema, default: () => ({ evaluated: false }) },
    inputData: { type: Schema.Types.Mixed, default: {} },
    modelUsed: { type: String, default: 'claude-sonnet-4-6' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

analysisLogSchema.index({ symbol: 1, analysisDate: -1 });
analysisLogSchema.index({ 'predictionOutcome.evaluated': 1, timeHorizon: 1, analysisDate: 1 });
// Partial TTL: only auto-delete rows that have NOT been evaluated yet.
// Evaluated rows are retained for analytics. Schema-level declaration is advisory:
// in prod the old unconditional TTL must be dropped and this partial index created
// via the one-shot migration script (see backend/src/scripts/migrate-ttl-partial.ts).
analysisLogSchema.index(
  { expiresAt: 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: { 'predictionOutcome.evaluated': { $ne: true } },
  }
);

export const AnalysisLog = mongoose.model<IAnalysisLog>('AnalysisLog', analysisLogSchema);
