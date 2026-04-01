import axios from 'axios';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { ALPHA_VANTAGE } from '../config/constants';

const BASE_URL = 'https://www.alphavantage.co/query';

interface CompanyOverview {
  pe: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  revenueGrowthYoY: number | null;
  profitGrowthYoY: number | null;
  profitMargin: number | null;
  marketCap: number | null;
  bookValue: number | null;
  dividendYield: number | null;
}

export class AlphaVantageService {
  private dailyCallCount = 0;
  private lastResetDate: string = '';

  private resetCounterIfNewDay(): void {
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.dailyCallCount = 0;
      this.lastResetDate = today;
    }
  }

  private checkQuota(): boolean {
    this.resetCounterIfNewDay();
    return this.dailyCallCount < ALPHA_VANTAGE.MAX_DAILY_CALLS;
  }

  /** Format NSE symbol for Alpha Vantage (e.g., RELIANCE -> RELIANCE.BSE) */
  private formatSymbol(nseSymbol: string): string {
    return `${nseSymbol}.BSE`;
  }

  private parseNumber(value: string | undefined): number | null {
    if (!value || value === 'None' || value === '-') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  /** Fetch company overview (fundamentals) */
  async getCompanyOverview(symbol: string): Promise<CompanyOverview | null> {
    if (!this.checkQuota()) {
      logger.warn('Alpha Vantage daily quota exhausted');
      return null;
    }

    try {
      this.dailyCallCount++;
      const response = await axios.get(BASE_URL, {
        params: {
          function: 'OVERVIEW',
          symbol: this.formatSymbol(symbol),
          apikey: env.ALPHA_VANTAGE_API_KEY,
        },
      });

      const data = response.data;

      if (data['Note'] || data['Information']) {
        logger.warn(`Alpha Vantage rate limited for ${symbol}`);
        return null;
      }

      if (!data['Symbol']) {
        logger.warn(`No Alpha Vantage data for ${symbol}`);
        return null;
      }

      return {
        pe: this.parseNumber(data['TrailingPE']),
        roe: this.parseNumber(data['ReturnOnEquityTTM']),
        roce: this.parseNumber(data['ReturnOnAssetsTTM']), // Closest available
        debtToEquity: this.parseNumber(data['DebtToEquityRatio'])
          ? this.parseNumber(data['DebtToEquityRatio'])! / 100
          : null,
        revenueGrowthYoY: this.parseNumber(data['QuarterlyRevenueGrowthYOY']),
        profitGrowthYoY: this.parseNumber(data['QuarterlyEarningsGrowthYOY']),
        profitMargin: this.parseNumber(data['ProfitMargin']),
        marketCap: this.parseNumber(data['MarketCapitalization']),
        bookValue: this.parseNumber(data['BookValue']),
        dividendYield: this.parseNumber(data['DividendYield']),
      };
    } catch (error) {
      logger.error(`Alpha Vantage error for ${symbol}:`, error);
      return null;
    }
  }

  /** Get income statement data */
  async getIncomeStatement(symbol: string): Promise<any | null> {
    if (!this.checkQuota()) return null;

    try {
      this.dailyCallCount++;
      const response = await axios.get(BASE_URL, {
        params: {
          function: 'INCOME_STATEMENT',
          symbol: this.formatSymbol(symbol),
          apikey: env.ALPHA_VANTAGE_API_KEY,
        },
      });

      if (response.data['Note'] || !response.data['annualReports']) {
        return null;
      }

      return response.data;
    } catch (error) {
      logger.error(`Alpha Vantage income statement error for ${symbol}:`, error);
      return null;
    }
  }

  /** Get remaining daily quota */
  getRemainingQuota(): number {
    this.resetCounterIfNewDay();
    return ALPHA_VANTAGE.MAX_DAILY_CALLS - this.dailyCallCount;
  }
}
