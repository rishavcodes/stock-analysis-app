// Angel One index tokens
export const INDEX_TOKENS = {
  NIFTY_50: '99926000',
  BANK_NIFTY: '99926009',
} as const;

// NSE exchange code
export const EXCHANGE = {
  NSE: 'NSE',
  BSE: 'BSE',
} as const;

// Market hours (IST)
export const MARKET_HOURS = {
  OPEN_HOUR: 9,
  OPEN_MINUTE: 15,
  CLOSE_HOUR: 15,
  CLOSE_MINUTE: 30,
} as const;

// Candle intervals
export const INTERVALS = {
  ONE_MINUTE: 'ONE_MINUTE',
  FIVE_MINUTE: 'FIVE_MINUTE',
  FIFTEEN_MINUTE: 'FIFTEEN_MINUTE',
  ONE_HOUR: 'ONE_HOUR',
  ONE_DAY: 'ONE_DAY',
} as const;

// Default scoring weights (used when regime is unknown).
export const SCORE_WEIGHTS = {
  MARKET: 0.20,
  SECTOR: 0.20,
  FUNDAMENTAL: 0.30,
  TECHNICAL: 0.30,
} as const;

// Per-regime weight overrides. Each row must sum to 1.0.
export const WEIGHT_CONFIG = {
  BULLISH: { market: 0.15, sector: 0.20, fundamental: 0.25, technical: 0.40 },
  BEARISH: { market: 0.25, sector: 0.20, fundamental: 0.35, technical: 0.20 },
  SIDEWAYS: { market: 0.20, sector: 0.30, fundamental: 0.25, technical: 0.25 },
} as const;

// Number of consecutive raw-regime readings required to flip the smoothed regime.
export const REGIME_SMOOTHING_DAYS = 3;

export type MarketRegime = keyof typeof WEIGHT_CONFIG;

// Indian market sectors
export const SECTORS = [
  'IT',
  'Banking',
  'Financial Services',
  'Pharma',
  'Auto',
  'FMCG',
  'Energy',
  'Metals',
  'Realty',
  'Telecom',
  'Media',
  'Infrastructure',
  'Chemicals',
  'Cement',
  'Consumer Durables',
  'Oil & Gas',
  'Power',
  'Capital Goods',
  'Healthcare',
  'Textiles',
] as const;

// Alpha Vantage rate limiting
export const ALPHA_VANTAGE = {
  MAX_DAILY_CALLS: 480, // 500 limit with 20 buffer
  CACHE_DAYS: 7,
} as const;

// Claude analysis cache duration (ms)
export const AI_CACHE = {
  MARKET_HOURS_MS: 4 * 60 * 60 * 1000,   // 4 hours
  AFTER_HOURS_MS: 24 * 60 * 60 * 1000,    // 24 hours
} as const;

// Prediction evaluation horizons (calendar days)
export const HORIZON_DAYS = {
  SHORT_TERM: 30,
  MEDIUM_TERM: 90,
  LONG_TERM: 180,
} as const;

// A TIME_EXPIRED prediction is WIN/LOSS only if abs(returnPct) crosses this; else NEUTRAL.
export const NEUTRAL_THRESHOLD_PCT = 3;

// Risk-adjusted scoring (Phase 3).
export const RISK_PENALTY = 0.2;
export const LIQUIDITY_THRESHOLDS = {
  // traded-value anchors in INR for the illiquidity penalty (log-scale between).
  HIGH_LIQUIDITY_INR: 50_000_000, // 5 Cr daily -> 0 penalty
  LOW_LIQUIDITY_INR: 5_000_000,   // 50 L daily -> max penalty
} as const;

// Portfolio intelligence (Phase 6).
export const PORTFOLIO_LIMITS = {
  MAX_SECTOR_EXPOSURE_PCT: 30,
  DEFAULT_RISK_PER_TRADE_PCT: 1,
  MAX_POSITION_PCT: 10,
  CORRELATION_THRESHOLD: 0.8,
  CORRELATION_LOOKBACK_DAYS: 90,
} as const;
