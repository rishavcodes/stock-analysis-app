import mongoose, { Schema, Document } from 'mongoose';
import { MarketRegime } from '../config/constants';

export interface IMarketState extends Document {
  date: Date;
  rawRegime: MarketRegime;
  regime: MarketRegime;
  smoothed: boolean;
  niftyClose: number;
}

const marketStateSchema = new Schema<IMarketState>(
  {
    date: { type: Date, required: true, unique: true },
    rawRegime: { type: String, required: true, enum: ['BULLISH', 'BEARISH', 'SIDEWAYS'] },
    regime: { type: String, required: true, enum: ['BULLISH', 'BEARISH', 'SIDEWAYS'] },
    smoothed: { type: Boolean, default: false },
    niftyClose: { type: Number, required: true },
  },
  { timestamps: true }
);

marketStateSchema.index({ date: -1 });

export const MarketState = mongoose.model<IMarketState>('MarketState', marketStateSchema);
