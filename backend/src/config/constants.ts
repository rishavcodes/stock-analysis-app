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

// Scoring weights
export const SCORE_WEIGHTS = {
  MARKET: 0.20,
  SECTOR: 0.20,
  FUNDAMENTAL: 0.30,
  TECHNICAL: 0.30,
} as const;

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
