import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  watchlist: string[]; // Array of stock symbols
  preferences: {
    defaultSector: string | null;
    riskTolerance: 'LOW' | 'MEDIUM' | 'HIGH';
    investmentHorizon: 'SHORT' | 'MEDIUM' | 'LONG';
  };
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, default: 'Default User' },
    email: { type: String, default: '' },
    watchlist: [{ type: String }],
    preferences: {
      defaultSector: { type: String, default: null },
      riskTolerance: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH'], default: 'MEDIUM' },
      investmentHorizon: { type: String, enum: ['SHORT', 'MEDIUM', 'LONG'], default: 'SHORT' },
    },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
