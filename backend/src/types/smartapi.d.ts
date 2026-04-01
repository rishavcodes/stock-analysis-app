declare module 'smartapi-javascript' {
  interface SmartAPIOptions {
    api_key: string;
  }

  interface SessionResponse {
    status: boolean;
    message: string;
    data: {
      jwtToken: string;
      refreshToken: string;
      feedToken: string;
    };
  }

  interface CandleParams {
    exchange: string;
    symboltoken: string;
    interval: string;
    fromdate: string;
    todate: string;
  }

  interface CandleResponse {
    status: boolean;
    message: string;
    data: [string, number, number, number, number, number][]; // [timestamp, O, H, L, C, V]
  }

  interface QuoteParams {
    mode: 'LTP' | 'OHLC' | 'FULL';
    exchangeTokens: Record<string, string[]>;
  }

  interface LTPData {
    exchange: string;
    tradingSymbol: string;
    symbolToken: string;
    ltp: number;
  }

  interface FullQuoteData extends LTPData {
    open: number;
    high: number;
    low: number;
    close: number;
    lastTradeQty: number;
    exchFeedTime: string;
    exchTradeTime: string;
    netChange: number;
    percentChange: number;
    avgPrice: number;
    tradeVolume: number;
    opnInterest: number;
    totBuyQuan: number;
    totSellQuan: number;
    '52WeekHigh': number;
    '52WeekLow': number;
  }

  interface QuoteResponse {
    status: boolean;
    message: string;
    data: {
      fetched: (LTPData | FullQuoteData)[];
      unfetched: { exchange: string; symbolToken: string }[];
    };
  }

  interface ProfileResponse {
    status: boolean;
    message: string;
    data: {
      clientcode: string;
      name: string;
      email: string;
      mobileno: string;
      exchanges: string[];
      products: string[];
      broker: string;
    };
  }

  class SmartAPI {
    constructor(options: SmartAPIOptions);
    generateSession(clientCode: string, password: string, totp: string): Promise<SessionResponse>;
    getProfile(): Promise<ProfileResponse>;
    getCandleData(params: CandleParams): Promise<CandleResponse>;
    marketData(params: QuoteParams): Promise<QuoteResponse>;
    logout(): Promise<{ status: boolean; message: string }>;
  }

  class WebSocket {}
  class WebSocketV2 {}

  export { SmartAPI, WebSocket, WebSocketV2 };
}
