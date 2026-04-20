import axios from 'axios';
import { logger } from '../utils/logger';

export interface QuarterlyEarning {
  quarter: string;        // e.g. "2024Q3"
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePct: number | null;
}

interface CompanyFundamentals {
  pe: number | null;
  forwardPe: number | null;
  roe: number | null;
  roce: number | null;
  debtToEquity: number | null;
  revenueGrowthYoY: number | null;
  profitGrowthYoY: number | null;
  profitMargin: number | null;
  marketCap: number | null;
  bookValue: number | null;
  dividendYield: number | null;
  promoterHolding: number | null;
  quarterlyEarnings: QuarterlyEarning[];
  quarterlyEpsGrowth: number[];  // last 4 YoY EPS growth % (oldest first)
}

export class YahooFinanceService {
  private cookie: string | null = null;
  private crumb: string | null = null;
  private sessionExpiry: number = 0;

  /** Authenticate: get cookie + crumb (valid for ~1 hour) */
  private async ensureSession(): Promise<void> {
    if (this.cookie && this.crumb && Date.now() < this.sessionExpiry) return;

    try {
      // Step 1: Get cookies from Yahoo
      const consentRes = await axios.get('https://fc.yahoo.com', {
        validateStatus: () => true,
        maxRedirects: 0,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      const setCookies = consentRes.headers['set-cookie'] || [];
      this.cookie = setCookies.map((c: string) => c.split(';')[0]).join('; ');

      // Step 2: Get crumb using cookies
      const crumbRes = await axios.get('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Cookie': this.cookie,
        },
      });

      this.crumb = crumbRes.data;
      this.sessionExpiry = Date.now() + 55 * 60 * 1000; // Refresh in 55 min
      logger.info('Yahoo Finance session initialized');
    } catch (error) {
      logger.error('Yahoo Finance session init failed:', error);
      throw error;
    }
  }

  private extractRaw(field: any): number | null {
    if (!field || field.raw == null) return null;
    return field.raw;
  }

  /** Fetch fundamentals for an NSE stock */
  async getCompanyFundamentals(symbol: string): Promise<CompanyFundamentals | null> {
    try {
      await this.ensureSession();

      const yahooSymbol = `${symbol}.NS`; // NSE suffix for Yahoo Finance

      const response = await axios.get(
        `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${yahooSymbol}`,
        {
          params: {
            modules: 'defaultKeyStatistics,financialData,summaryDetail,earningsHistory,earningsTrend',
            crumb: this.crumb,
          },
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Cookie': this.cookie!,
          },
          timeout: 10000,
        }
      );

      const result = response.data?.quoteSummary?.result?.[0];
      if (!result) {
        logger.warn(`No Yahoo Finance data for ${yahooSymbol}`);
        return null;
      }

      const fd = result.financialData || {};
      const ks = result.defaultKeyStatistics || {};
      const sd = result.summaryDetail || {};

      // Yahoo returns debtToEquity as a percentage (e.g., 35.65 = 35.65%)
      const rawDebtToEquity = this.extractRaw(fd.debtToEquity);
      const debtToEquity = rawDebtToEquity != null ? rawDebtToEquity / 100 : null;

      const quarterlyEarnings = this.parseQuarterlyEarnings(result.earningsHistory);
      const quarterlyEpsGrowth = this.computeQuarterlyEpsGrowth(quarterlyEarnings);

      const fundamentals: CompanyFundamentals = {
        pe: this.extractRaw(sd.trailingPE),
        forwardPe: this.extractRaw(sd.forwardPE),
        roe: this.extractRaw(fd.returnOnEquity),
        roce: this.extractRaw(fd.returnOnAssets), // ROA as proxy for ROCE
        debtToEquity,
        revenueGrowthYoY: this.extractRaw(fd.revenueGrowth),
        profitGrowthYoY: this.extractRaw(fd.earningsGrowth),
        profitMargin: this.extractRaw(fd.profitMargins),
        marketCap: this.extractRaw(sd.marketCap),
        bookValue: this.extractRaw(ks.bookValue),
        dividendYield: this.extractRaw(sd.dividendYield),
        promoterHolding: this.extractRaw(ks.heldPercentInsiders),
        quarterlyEarnings,
        quarterlyEpsGrowth,
      };

      logger.info(`Yahoo Finance: fetched fundamentals for ${symbol} (PE: ${fundamentals.pe}, MarketCap: ${fundamentals.marketCap}, Q growth: [${quarterlyEpsGrowth.map((v) => v.toFixed(1)).join(',')}])`);
      return fundamentals;
    } catch (error: any) {
      if (error.response?.status === 401) {
        // Cookie/crumb expired, reset session
        this.cookie = null;
        this.crumb = null;
        this.sessionExpiry = 0;
        logger.warn(`Yahoo Finance auth expired for ${symbol}, will retry next call`);
      } else {
        logger.error(`Yahoo Finance error for ${symbol}:`, error.message);
      }
      return null;
    }
  }

  /** Parse Yahoo's earningsHistory module into our normalized shape (oldest first). */
  private parseQuarterlyEarnings(earningsHistory: any): QuarterlyEarning[] {
    const rows: any[] = earningsHistory?.history ?? [];
    if (!Array.isArray(rows) || rows.length === 0) return [];
    return rows
      .map((r) => ({
        quarter: r.quarter?.fmt ?? '',
        epsActual: this.extractRaw(r.epsActual),
        epsEstimate: this.extractRaw(r.epsEstimate),
        surprisePct: this.extractRaw(r.surprisePercent),
      }))
      .filter((r) => r.quarter !== '');
  }

  /**
   * Compute last-4 YoY EPS growth % from the earnings history.
   * Yahoo returns quarterly EPS but typically without prior-year data to do a true YoY
   * in one call. As a pragmatic proxy we use sequential QoQ growth of the last 5 points
   * (giving 4 growth values, newest last). Returns [] if fewer than 2 points.
   * EPS sign flips return a capped sentinel (±100%) to avoid math blowup.
   */
  private computeQuarterlyEpsGrowth(earnings: QuarterlyEarning[]): number[] {
    const eps = earnings
      .map((e) => e.epsActual)
      .filter((v): v is number => typeof v === 'number');
    if (eps.length < 2) return [];
    const slice = eps.slice(-5); // up to 5 quarters -> up to 4 growth points
    const growth: number[] = [];
    for (let i = 1; i < slice.length; i++) {
      const prev = slice[i - 1];
      const curr = slice[i];
      if (prev === 0 || !Number.isFinite(prev)) continue;
      if (prev < 0 && curr > 0) growth.push(100);
      else if (prev > 0 && curr < 0) growth.push(-100);
      else {
        const g = ((curr - prev) / Math.abs(prev)) * 100;
        growth.push(Math.max(-100, Math.min(100, g)));
      }
    }
    return growth;
  }
}
