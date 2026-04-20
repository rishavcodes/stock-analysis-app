import mongoose, { Schema, Document, Types } from 'mongoose';

export type TradeExitReason = 'TARGET_HIT' | 'STOP_LOSS_HIT' | 'TECHNICAL_EXIT' | 'TIME_EXPIRED';

export interface IBacktestTrade extends Document {
  runId: Types.ObjectId;
  symbol: string;
  sector: string;
  entryDate: Date;
  entryPrice: number;
  exitDate: Date;
  exitPrice: number;
  returnPct: number;
  exitReason: TradeExitReason;
  scoreAtEntry: number;
  qty: number;
}

const backtestTradeSchema = new Schema<IBacktestTrade>(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'BacktestRun', required: true, index: true },
    symbol: { type: String, required: true },
    sector: { type: String, required: true },
    entryDate: { type: Date, required: true },
    entryPrice: { type: Number, required: true },
    exitDate: { type: Date, required: true },
    exitPrice: { type: Number, required: true },
    returnPct: { type: Number, required: true },
    exitReason: {
      type: String,
      enum: ['TARGET_HIT', 'STOP_LOSS_HIT', 'TECHNICAL_EXIT', 'TIME_EXPIRED'],
      required: true,
    },
    scoreAtEntry: { type: Number, required: true },
    qty: { type: Number, required: true },
  },
  { timestamps: true }
);

backtestTradeSchema.index({ runId: 1, entryDate: 1 });

export const BacktestTrade = mongoose.model<IBacktestTrade>('BacktestTrade', backtestTradeSchema);
