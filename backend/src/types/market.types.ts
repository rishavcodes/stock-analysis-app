export interface CandleData {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndexStatus {
  name: string;
  token: string;
  ltp: number;
  change: number;
  changePercent: number;
  sma50: number;
  sma200: number;
  trend: 'BULLISH' | 'BEARISH' | 'SIDEWAYS';
}

export interface MarketStatus {
  isOpen: boolean;
  nifty: IndexStatus;
  bankNifty: IndexStatus;
  marketScore: number;
  confidence: number;
  timestamp: Date;
}

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

export interface Instrument {
  token: string;
  symbol: string;
  name: string;
  exchange: string;
  segment: string;
  instrumentType: string;
  lotSize: number;
  isin: string;
}
