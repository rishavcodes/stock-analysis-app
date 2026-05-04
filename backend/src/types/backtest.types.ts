/**
 * Pure TypeScript types for the backtest pipeline.
 *
 * Originally lived alongside the Mongoose model in `models/BacktestRun.ts` /
 * `models/BacktestTrade.ts`. After the Phase 6 migration the runtime models
 * are owned by Prisma; only these typed shapes remained, so they moved here
 * during Phase 7 cleanup.
 *
 * `BacktestConfig` and `BacktestResults` describe the JSONB payloads stored
 * on `BacktestRun.config` / `BacktestRun.results`. Casting through these
 * interfaces is how the service reads the typed shape back out of Prisma.
 */

export type TradeExitReason =
  | 'TARGET_HIT'
  | 'STOP_LOSS_HIT'
  | 'TECHNICAL_EXIT'
  | 'TIME_EXPIRED';

export interface BacktestConfig {
  from: Date;
  to: Date;
  scoreThreshold: number;
  exitRule: 'TECHNICAL' | 'FIXED_HOLD' | 'AI_RULES';
  technicalExitThreshold: number;
  maxHoldDays: number;
  stopLossAtrMultiple: number;
  targetAtrMultiple: number;
  holdDays: number;
  capital: number;
  positionSizePct: number;
  slippagePct: number;
  maxConcurrentPositions: number;
  useHistoricalSectors: boolean;
}

export interface EquityPoint {
  date: Date;
  equity: number;
}

export interface BacktestResults {
  winRate: number;
  avgReturnPct: number;
  maxDrawdown: number;
  sharpe: number;
  totalTrades: number;
  wins: number;
  losses: number;
  equityCurve: EquityPoint[];
  notes: string[];
}
