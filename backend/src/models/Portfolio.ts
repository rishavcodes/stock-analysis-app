import mongoose, { Schema, Document } from 'mongoose';

export interface IPortfolio extends Document {
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  buyDate: Date;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  stopLoss: number | null;
  targetPrice: number | null;
  notes: string;
  status: 'ACTIVE' | 'EXITED';
  exitPrice: number | null;
  exitDate: Date | null;
}

const portfolioSchema = new Schema<IPortfolio>(
  {
    symbol: { type: String, required: true },
    quantity: { type: Number, required: true },
    avgBuyPrice: { type: Number, required: true },
    buyDate: { type: Date, required: true },
    currentPrice: { type: Number, default: 0 },
    pnl: { type: Number, default: 0 },
    pnlPercent: { type: Number, default: 0 },
    stopLoss: { type: Number, default: null },
    targetPrice: { type: Number, default: null },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['ACTIVE', 'EXITED'], default: 'ACTIVE' },
    exitPrice: { type: Number, default: null },
    exitDate: { type: Date, default: null },
  },
  { timestamps: true }
);

portfolioSchema.index({ symbol: 1, status: 1 });

export const Portfolio = mongoose.model<IPortfolio>('Portfolio', portfolioSchema);
