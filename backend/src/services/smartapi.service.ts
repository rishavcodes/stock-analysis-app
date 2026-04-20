import { SmartAPI } from 'smartapi-javascript';
import { authenticator } from 'otplib';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { CandleData } from '../types/market.types';
import PQueue from 'p-queue';

export class SmartAPIService {
  private client: SmartAPI;
  private sessionToken: string | null = null;
  private refreshToken: string | null = null;
  private feedToken: string | null = null;
  private sessionExpiry: Date | null = null;
  private queue: PQueue;

  constructor() {
    this.client = new SmartAPI({ api_key: env.SMARTAPI_API_KEY });
    // Self-throttle: 1 request per second
    this.queue = new PQueue({ concurrency: 1, interval: 1000, intervalCap: 1 });
  }

  /** Generate TOTP and create session */
  async initialize(): Promise<void> {
    try {
      const totp = authenticator.generate(env.SMARTAPI_TOTP_SECRET);
      const response = await this.client.generateSession(
        env.SMARTAPI_CLIENT_CODE,
        env.SMARTAPI_PASSWORD,
        totp
      );

      if (!response.status) {
        throw new Error(`SmartAPI session failed: ${response.message}`);
      }

      this.sessionToken = response.data.jwtToken;
      this.refreshToken = response.data.refreshToken;
      this.feedToken = response.data.feedToken;
      // Sessions typically last ~24 hours, refresh after 12
      this.sessionExpiry = new Date(Date.now() + 12 * 60 * 60 * 1000);

      logger.info('SmartAPI session initialized');
    } catch (error) {
      logger.error('SmartAPI initialization failed:', error);
      throw error;
    }
  }

  /** Re-authenticate if session expired */
  private async ensureSession(): Promise<void> {
    if (!this.sessionToken || !this.sessionExpiry || new Date() > this.sessionExpiry) {
      await this.initialize();
    }
  }

  /** Public wrapper for consumers (e.g. MarketStreamService) that need to bootstrap a session. */
  async ensureSessionReady(): Promise<void> {
    await this.ensureSession();
  }

  /** JWT token for Angel REST/WebSocket auth. Call ensureSessionReady() first. */
  getJwtToken(): string | null {
    return this.sessionToken;
  }

  /** Feed token for Angel WebSocket auth. Call ensureSessionReady() first. */
  getFeedToken(): string | null {
    return this.feedToken;
  }

  /** Fetch historical candle data */
  async getCandles(
    symbolToken: string,
    exchange: string,
    interval: string,
    fromDate: string,
    toDate: string
  ): Promise<CandleData[]> {
    return this.queue.add(async () => {
      await this.ensureSession();
      const response = await this.client.getCandleData({
        exchange,
        symboltoken: symbolToken,
        interval,
        fromdate: fromDate,
        todate: toDate,
      });

      if (!response.status || !response.data) {
        logger.warn(`No candle data for token ${symbolToken}: ${response.message}`);
        return [];
      }

      return response.data.map(([timestamp, open, high, low, close, volume]: [string, number, number, number, number, number]) => ({
        timestamp: new Date(timestamp),
        open,
        high,
        low,
        close,
        volume,
      }));
    }) as Promise<CandleData[]>;
  }

  /** Fetch LTP for multiple tokens (max 50 per call) */
  async getLTP(tokens: string[], exchange: string = 'NSE'): Promise<Map<string, number>> {
    return this.queue.add(async () => {
      await this.ensureSession();

      const result = new Map<string, number>();

      // Batch into groups of 50
      for (let i = 0; i < tokens.length; i += 50) {
        const batch = tokens.slice(i, i + 50);
        const response = await this.client.marketData({
          mode: 'LTP',
          exchangeTokens: { [exchange]: batch },
        });

        if (response.status && response.data?.fetched) {
          for (const item of response.data.fetched) {
            result.set(item.symbolToken, item.ltp);
          }
        }
      }

      return result;
    }) as Promise<Map<string, number>>;
  }

  /** Fetch full quote data for tokens */
  async getFullQuote(tokens: string[], exchange: string = 'NSE'): Promise<any[]> {
    return this.queue.add(async () => {
      await this.ensureSession();

      const response = await this.client.marketData({
        mode: 'FULL',
        exchangeTokens: { [exchange]: tokens },
      });

      if (!response.status || !response.data?.fetched) {
        return [];
      }

      return response.data.fetched;
    }) as Promise<any[]>;
  }

  /** Fetch instrument master list */
  async getInstrumentList(): Promise<any[]> {
    const axios = (await import('axios')).default;
    const response = await axios.get(
      'https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json'
    );
    return response.data;
  }

  async logout(): Promise<void> {
    try {
      await this.client.logout();
      this.sessionToken = null;
      logger.info('SmartAPI session closed');
    } catch (error) {
      logger.warn('SmartAPI logout error:', error);
    }
  }
}
