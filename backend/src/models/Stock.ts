import mongoose, { Schema, Document } from 'mongoose';

export interface IStock extends Document {
  symbol: string;
  token: string;
  name: string;
  exchange: string;
  segment: string;
  sector: string;
  isin: string;
  lotSize: number;
  isIndex: boolean;
  isActive: boolean;
  lastUpdated: Date;
}

const stockSchema = new Schema<IStock>(
  {
    symbol: { type: String, required: true, unique: true, index: true },
    token: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    exchange: { type: String, required: true, default: 'NSE' },
    segment: { type: String, default: 'EQ' },
    sector: { type: String, default: 'Unknown', index: true },
    isin: { type: String, default: '' },
    lotSize: { type: Number, default: 1 },
    isIndex: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    lastUpdated: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const Stock = mongoose.model<IStock>('Stock', stockSchema);
