// Stock
export interface Stock {
  _id: string;
  symbol: string;
  token: string;
  name: string;
  exchange: string;
  sector: string;
  isActive: boolean;
}

// Candle
export interface Candle {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// Stock Metric
export interface StockMetric {
  _id: string;
  symbol: string;
  date: string;
  // Fundamentals
  pe: number | null;
  roe: number | null;
  debtToEquity: number | null;
  revenueGrowthYoY: number | null;
  profitMargin: number | null;
  marketCap: number | null;
  // Technicals
  sma20: number;
  sma50: number;
  sma200: number;
  ema20: number;
  rsi14: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  bollingerUpper: number;
  bollingerLower: number;
  avgVolume20: number;
  volumeRatio: number;
  // Scores
  fundamentalScore: number;
  technicalScore: number;
  sectorScore: number;
  marketScore: number;
  finalScore: number;
  // Signals
  isBreakout: boolean;
  breakoutType: 'PRICE' | 'VOLUME' | null;
  trendDirection: 'UP' | 'DOWN' | 'SIDEWAYS';
  // Enriched
  stockInfo?: Stock;
}

// Index status
export interface IndexStatus {
  name: string;
  ltp: number;
  change: number;
  changePercent: number;
  sma50: number;
  sma200: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
}

// Market status
export interface MarketStatus {
  isOpen: boolean;
  nifty: IndexStatus;
  bankNifty: IndexStatus;
  marketScore: number;
  confidence: number;
  timestamp: string;
}

// Sector ranking
export interface SectorRanking {
  sector: string;
  avgChange: number;
  sectorScore: number;
  stockCount: number;
  topGainer: { symbol: string; change: number };
  topLoser: { symbol: string; change: number };
  advances: number;
  declines: number;
}

// Analysis
export interface Analysis {
  _id: string;
  symbol: string;
  analysisDate: string;
  recommendation: 'BUY' | 'AVOID' | 'WATCH';
  confidence: number;
  summary: string;
  bullishFactors: string[];
  bearishFactors: string[];
  entryPrice: number | null;
  targetPrice: number | null;
  stopLoss: number | null;
  timeHorizon: 'SHORT_TERM' | 'MEDIUM_TERM' | 'LONG_TERM';
}

// Portfolio holding
export interface Holding {
  _id: string;
  symbol: string;
  quantity: number;
  avgBuyPrice: number;
  buyDate: string;
  currentPrice: number;
  pnl: number;
  pnlPercent: number;
  stopLoss: number | null;
  targetPrice: number | null;
  notes: string;
  status: 'ACTIVE' | 'EXITED';
}

// Portfolio summary
export interface PortfolioSummary {
  totalInvested: number;
  currentValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  holdingCount: number;
}

// Alert
export interface Alert {
  _id: string;
  symbol: string;
  type: string;
  threshold: number;
  isActive: boolean;
  isTriggered: boolean;
  triggeredAt: string | null;
  message: string;
  createdAt: string;
}

// API Response
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

// Stock detail page data
export interface StockDetail {
  stock: Stock;
  metrics: StockMetric | null;
  candles: Candle[];
  analysis: Analysis | null;
  lastPrice: number | null;
  change: number | null;
  changePercent: number | null;
}
