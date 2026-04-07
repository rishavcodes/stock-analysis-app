import { Request } from 'express';
import { z } from 'zod';

// Screener query params
export const ScreenerQuerySchema = z.object({
  sector: z.string().optional(),
  minScore: z.coerce.number().min(0).max(100).optional(),
  maxScore: z.coerce.number().min(0).max(100).optional(),
  sortBy: z.enum(['finalScore', 'technicalScore', 'fundamentalScore', 'changePercent', 'volume']).default('finalScore'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  breakoutOnly: z.coerce.boolean().optional(),
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
});

export type ScreenerQuery = z.infer<typeof ScreenerQuerySchema>;

// Portfolio add request
export const AddHoldingSchema = z.object({
  symbol: z.string().min(1),
  quantity: z.number().positive(),
  avgBuyPrice: z.number().positive(),
  buyDate: z.string().transform((s) => new Date(s)),
  stopLoss: z.number().positive().optional(),
  targetPrice: z.number().positive().optional(),
  notes: z.string().optional(),
});

export type AddHolding = z.infer<typeof AddHoldingSchema>;

// Alert create request
export const CreateAlertSchema = z.object({
  symbol: z.string().min(1),
  type: z.enum(['PRICE_ABOVE', 'PRICE_BELOW', 'VOLUME_SPIKE', 'BREAKOUT', 'STOP_LOSS', 'TARGET_HIT', 'SCORE_CHANGE']),
  threshold: z.number(),
  message: z.string().optional(),
});

export type CreateAlert = z.infer<typeof CreateAlertSchema>;

// Manual fundamentals import
export const ManualFundamentalsSchema = z.object({
  pe: z.number().nullable().optional(),
  roe: z.number().nullable().optional(),
  roce: z.number().nullable().optional(),
  debtToEquity: z.number().nullable().optional(),
  revenueGrowthYoY: z.number().nullable().optional(),
  profitGrowthYoY: z.number().nullable().optional(),
  profitMargin: z.number().nullable().optional(),
  marketCap: z.number().nullable().optional(),
  bookValue: z.number().nullable().optional(),
  dividendYield: z.number().nullable().optional(),
  promoterHolding: z.number().nullable().optional(),
});

export type ManualFundamentals = z.infer<typeof ManualFundamentalsSchema>;

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
