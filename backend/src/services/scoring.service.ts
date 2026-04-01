import { SCORE_WEIGHTS } from '../config/constants';
import { Indicators } from '../types/analysis.types';
import { IStockMetric } from '../models/StockMetric';

export class ScoringService {
  /** Compute fundamental score (0-100) based on financial metrics */
  computeFundamentalScore(metric: Partial<IStockMetric>): number {
    let score = 0;
    let factorCount = 0;

    // PE Ratio (lower is better for value)
    if (metric.pe != null && metric.pe > 0) {
      factorCount++;
      if (metric.pe <= 15) score += 20;
      else if (metric.pe <= 25) score += 15;
      else if (metric.pe <= 40) score += 10;
      else score += 5;
    }

    // ROE (higher is better)
    if (metric.roe != null) {
      factorCount++;
      const roe = metric.roe * 100; // Convert decimal to percentage
      if (roe >= 20) score += 20;
      else if (roe >= 15) score += 15;
      else if (roe >= 10) score += 10;
      else score += 5;
    }

    // Debt/Equity (lower is better)
    if (metric.debtToEquity != null) {
      factorCount++;
      if (metric.debtToEquity <= 0.5) score += 20;
      else if (metric.debtToEquity <= 1) score += 15;
      else if (metric.debtToEquity <= 2) score += 10;
      else score += 5;
    }

    // Revenue Growth YoY
    if (metric.revenueGrowthYoY != null) {
      factorCount++;
      const growth = metric.revenueGrowthYoY * 100;
      if (growth >= 15) score += 20;
      else if (growth >= 10) score += 15;
      else if (growth >= 5) score += 10;
      else if (growth >= 0) score += 5;
      else score += 2;
    }

    // Profit Margin
    if (metric.profitMargin != null) {
      factorCount++;
      const margin = metric.profitMargin * 100;
      if (margin >= 20) score += 20;
      else if (margin >= 15) score += 15;
      else if (margin >= 10) score += 10;
      else if (margin >= 5) score += 5;
      else score += 2;
    }

    // Normalize to 0-100
    if (factorCount === 0) return 50; // No data, neutral score
    return Math.round((score / (factorCount * 20)) * 100);
  }

  /** Compute technical score (0-100) based on indicators */
  computeTechnicalScore(closes: number[], indicators: Partial<Indicators>): number {
    let score = 0;
    const price = closes[closes.length - 1] || 0;

    // 1. MA Alignment (25 points)
    if (indicators.sma20 && indicators.sma50 && indicators.sma200) {
      if (price > indicators.sma20 && indicators.sma20 > indicators.sma50 && indicators.sma50 > indicators.sma200) {
        score += 25; // Perfect bullish alignment
      } else if (price > indicators.sma50 && indicators.sma50 > indicators.sma200) {
        score += 20;
      } else if (price > indicators.sma200) {
        score += 12;
      } else if (price > indicators.sma50) {
        score += 8;
      } else {
        score += 3;
      }
    }

    // 2. RSI (25 points)
    if (indicators.rsi14 != null) {
      const rsi = indicators.rsi14;
      if (rsi >= 50 && rsi <= 70) score += 25; // Bullish momentum, not overbought
      else if (rsi >= 40 && rsi < 50) score += 15; // Approaching bullish
      else if (rsi > 70 && rsi <= 80) score += 12; // Overbought caution
      else if (rsi >= 30 && rsi < 40) score += 10; // Oversold bounce potential
      else if (rsi < 30) score += 8; // Deeply oversold
      else score += 5; // Very overbought
    }

    // 3. MACD (25 points)
    if (indicators.macdLine != null && indicators.macdSignal != null && indicators.macdHistogram != null) {
      if (indicators.macdLine > indicators.macdSignal && indicators.macdHistogram > 0) {
        score += 25; // Bullish crossover with positive momentum
      } else if (indicators.macdLine > indicators.macdSignal) {
        score += 18; // Bullish but weakening
      } else if (indicators.macdHistogram > 0) {
        score += 12;
      } else {
        score += 5; // Bearish
      }
    }

    // 4. Volume (25 points)
    if (indicators.volumeRatio != null) {
      if (indicators.volumeRatio > 2) score += 25; // Strong volume
      else if (indicators.volumeRatio > 1.5) score += 20;
      else if (indicators.volumeRatio > 1) score += 15;
      else if (indicators.volumeRatio > 0.8) score += 10;
      else score += 5; // Low volume
    }

    return Math.min(100, score);
  }

  /** Compute market score (0-100) based on Nifty 50 trend */
  computeMarketScore(niftyCloses: number[]): number {
    if (niftyCloses.length < 200) return 50;

    let score = 0;
    const price = niftyCloses[niftyCloses.length - 1];

    // SMA 50
    const sma50 =
      niftyCloses.slice(-50).reduce((sum, v) => sum + v, 0) / 50;
    // SMA 200
    const sma200 =
      niftyCloses.slice(-200).reduce((sum, v) => sum + v, 0) / 200;

    // Price vs MAs
    if (price > sma50 && sma50 > sma200) score += 40; // Bullish
    else if (price > sma200) score += 25; // Moderate
    else score += 10; // Bearish

    // Higher highs check (last 20 days)
    const recent = niftyCloses.slice(-20);
    const firstHalf = Math.max(...recent.slice(0, 10));
    const secondHalf = Math.max(...recent.slice(10));
    if (secondHalf > firstHalf) score += 20; // Making higher highs
    else score += 8;

    // Volatility (low is positive for market health)
    const returns = [];
    for (let i = 1; i < Math.min(20, niftyCloses.length); i++) {
      returns.push((niftyCloses[niftyCloses.length - i] - niftyCloses[niftyCloses.length - i - 1]) / niftyCloses[niftyCloses.length - i - 1]);
    }
    const avgReturn = returns.reduce((s, r) => s + r, 0) / returns.length;
    const volatility = Math.sqrt(returns.reduce((s, r) => s + Math.pow(r - avgReturn, 2), 0) / returns.length);

    if (volatility < 0.01) score += 20; // Low volatility
    else if (volatility < 0.015) score += 15;
    else if (volatility < 0.02) score += 10;
    else score += 5;

    // Momentum (20-day return)
    const ret20d = (niftyCloses[niftyCloses.length - 1] - niftyCloses[niftyCloses.length - 21]) / niftyCloses[niftyCloses.length - 21];
    if (ret20d > 0.05) score += 20;
    else if (ret20d > 0.02) score += 15;
    else if (ret20d > 0) score += 10;
    else score += 3;

    return Math.min(100, score);
  }

  /** Compute sector score (0-100) */
  computeSectorScore(
    avgChange: number,
    advances: number,
    declines: number,
    technicalScores: number[]
  ): number {
    let score = 0;

    // Average technical score of sector stocks
    if (technicalScores.length > 0) {
      const avgTechnical = technicalScores.reduce((s, v) => s + v, 0) / technicalScores.length;
      score += avgTechnical * 0.5; // 50% weight
    }

    // Advance/Decline ratio
    const total = advances + declines;
    if (total > 0) {
      const adRatio = advances / total;
      score += adRatio * 30; // 30% weight, max 30
    }

    // Momentum from avgChange
    if (avgChange > 3) score += 20;
    else if (avgChange > 1) score += 15;
    else if (avgChange > 0) score += 10;
    else score += 5;

    return Math.min(100, Math.round(score));
  }

  /** Compute final weighted score */
  computeFinalScore(
    marketScore: number,
    sectorScore: number,
    fundamentalScore: number,
    technicalScore: number
  ): number {
    return Math.round(
      marketScore * SCORE_WEIGHTS.MARKET +
      sectorScore * SCORE_WEIGHTS.SECTOR +
      fundamentalScore * SCORE_WEIGHTS.FUNDAMENTAL +
      technicalScore * SCORE_WEIGHTS.TECHNICAL
    );
  }
}
