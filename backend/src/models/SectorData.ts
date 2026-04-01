import mongoose, { Schema, Document } from 'mongoose';

export interface ISectorData extends Document {
  sector: string;
  date: Date;
  avgChange: number;
  topGainer: { symbol: string; change: number };
  topLoser: { symbol: string; change: number };
  sectorScore: number;
  stockCount: number;
  advanceDecline: { advances: number; declines: number };
}

const sectorDataSchema = new Schema<ISectorData>(
  {
    sector: { type: String, required: true },
    date: { type: Date, required: true },
    avgChange: { type: Number, default: 0 },
    topGainer: {
      symbol: { type: String, default: '' },
      change: { type: Number, default: 0 },
    },
    topLoser: {
      symbol: { type: String, default: '' },
      change: { type: Number, default: 0 },
    },
    sectorScore: { type: Number, default: 0, min: 0, max: 100 },
    stockCount: { type: Number, default: 0 },
    advanceDecline: {
      advances: { type: Number, default: 0 },
      declines: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

sectorDataSchema.index({ sector: 1, date: -1 }, { unique: true });

export const SectorData = mongoose.model<ISectorData>('SectorData', sectorDataSchema);
