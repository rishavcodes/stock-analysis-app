import mongoose, { Schema, Document } from 'mongoose';

export interface ICandle extends Document {
  stockToken: string;
  interval: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const candleSchema = new Schema<ICandle>(
  {
    stockToken: { type: String, required: true },
    interval: { type: String, required: true },
    timestamp: { type: Date, required: true },
    open: { type: Number, required: true },
    high: { type: Number, required: true },
    low: { type: Number, required: true },
    close: { type: Number, required: true },
    volume: { type: Number, required: true },
  },
  { timestamps: true }
);

candleSchema.index({ stockToken: 1, interval: 1, timestamp: -1 }, { unique: true });

export const Candle = mongoose.model<ICandle>('Candle', candleSchema);
