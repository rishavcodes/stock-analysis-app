import mongoose, { Schema, Document } from 'mongoose';

export interface IAlert extends Document {
  symbol: string;
  type: 'PRICE_ABOVE' | 'PRICE_BELOW' | 'VOLUME_SPIKE' | 'BREAKOUT' | 'STOP_LOSS' | 'TARGET_HIT' | 'SCORE_CHANGE';
  threshold: number;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt: Date | null;
  message: string;
  createdAt: Date;
}

const alertSchema = new Schema<IAlert>(
  {
    symbol: { type: String, required: true },
    type: {
      type: String,
      required: true,
      enum: ['PRICE_ABOVE', 'PRICE_BELOW', 'VOLUME_SPIKE', 'BREAKOUT', 'STOP_LOSS', 'TARGET_HIT', 'SCORE_CHANGE'],
    },
    threshold: { type: Number, required: true },
    isActive: { type: Boolean, default: true },
    isTriggered: { type: Boolean, default: false },
    triggeredAt: { type: Date, default: null },
    message: { type: String, default: '' },
  },
  { timestamps: true }
);

alertSchema.index({ isActive: 1, symbol: 1 });

export const Alert = mongoose.model<IAlert>('Alert', alertSchema);
