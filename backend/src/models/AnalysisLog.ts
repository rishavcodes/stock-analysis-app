import mongoose, { Schema, Document } from 'mongoose';

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
  inputData: Record<string, unknown>;
  modelUsed: string;
  expiresAt: Date;
}

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
    inputData: { type: Schema.Types.Mixed, default: {} },
    modelUsed: { type: String, default: 'claude-sonnet-4-6' },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true }
);

analysisLogSchema.index({ symbol: 1, analysisDate: -1 });
analysisLogSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL index

export const AnalysisLog = mongoose.model<IAnalysisLog>('AnalysisLog', analysisLogSchema);
