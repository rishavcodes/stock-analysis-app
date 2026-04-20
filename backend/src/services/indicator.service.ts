import { Indicators } from '../types/analysis.types';

export class IndicatorService {
  /** Simple Moving Average */
  calcSMA(data: number[], period: number): number[] {
    const result: number[] = [];
    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        result.push(0);
        continue;
      }
      const slice = data.slice(i - period + 1, i + 1);
      result.push(slice.reduce((sum, v) => sum + v, 0) / period);
    }
    return result;
  }

  /** Exponential Moving Average */
  calcEMA(data: number[], period: number): number[] {
    const result: number[] = [];
    const multiplier = 2 / (period + 1);

    for (let i = 0; i < data.length; i++) {
      if (i === 0) {
        result.push(data[0]);
      } else if (i < period - 1) {
        // Use SMA for initial values
        const slice = data.slice(0, i + 1);
        result.push(slice.reduce((sum, v) => sum + v, 0) / (i + 1));
      } else if (i === period - 1) {
        // First EMA is the SMA
        const slice = data.slice(0, period);
        result.push(slice.reduce((sum, v) => sum + v, 0) / period);
      } else {
        result.push((data[i] - result[i - 1]) * multiplier + result[i - 1]);
      }
    }
    return result;
  }

  /** Relative Strength Index */
  calcRSI(data: number[], period: number = 14): number[] {
    const result: number[] = new Array(data.length).fill(50);
    if (data.length < period + 1) return result;

    const gains: number[] = [];
    const losses: number[] = [];

    for (let i = 1; i < data.length; i++) {
      const change = data[i] - data[i - 1];
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? Math.abs(change) : 0);
    }

    // First average
    let avgGain = gains.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
    let avgLoss = losses.slice(0, period).reduce((sum, v) => sum + v, 0) / period;

    for (let i = period; i < gains.length; i++) {
      avgGain = (avgGain * (period - 1) + gains[i]) / period;
      avgLoss = (avgLoss * (period - 1) + losses[i]) / period;

      if (avgLoss === 0) {
        result[i + 1] = 100;
      } else {
        const rs = avgGain / avgLoss;
        result[i + 1] = 100 - 100 / (1 + rs);
      }
    }

    return result;
  }

  /** MACD (12, 26, 9) */
  calcMACD(data: number[]): { line: number[]; signal: number[]; histogram: number[] } {
    const ema12 = this.calcEMA(data, 12);
    const ema26 = this.calcEMA(data, 26);

    const macdLine = ema12.map((v, i) => v - ema26[i]);
    const signal = this.calcEMA(macdLine, 9);
    const histogram = macdLine.map((v, i) => v - signal[i]);

    return { line: macdLine, signal, histogram };
  }

  /** Bollinger Bands (20, 2) */
  calcBollingerBands(
    data: number[],
    period: number = 20,
    stdMultiplier: number = 2
  ): { upper: number[]; middle: number[]; lower: number[] } {
    const middle = this.calcSMA(data, period);
    const upper: number[] = [];
    const lower: number[] = [];

    for (let i = 0; i < data.length; i++) {
      if (i < period - 1) {
        upper.push(0);
        lower.push(0);
        continue;
      }
      const slice = data.slice(i - period + 1, i + 1);
      const mean = middle[i];
      const stdDev = Math.sqrt(
        slice.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / period
      );
      upper.push(mean + stdMultiplier * stdDev);
      lower.push(mean - stdMultiplier * stdDev);
    }

    return { upper, middle, lower };
  }

  /** Average volume over N periods */
  calcAvgVolume(volumes: number[], period: number = 20): number {
    if (volumes.length < period) {
      return volumes.reduce((sum, v) => sum + v, 0) / volumes.length;
    }
    const recent = volumes.slice(-period);
    return recent.reduce((sum, v) => sum + v, 0) / period;
  }

  /** Detect breakout: price above 20-day high with volume > 1.5x average */
  detectBreakout(
    closes: number[],
    highs: number[],
    volumes: number[]
  ): { isBreakout: boolean; breakoutType: 'PRICE' | 'VOLUME' | null } {
    if (closes.length < 21) return { isBreakout: false, breakoutType: null };

    const currentClose = closes[closes.length - 1];
    const currentVolume = volumes[volumes.length - 1];
    const recentHighs = highs.slice(-21, -1); // Last 20 days excluding today
    const maxHigh = Math.max(...recentHighs);
    const avgVol = this.calcAvgVolume(volumes.slice(0, -1), 20);

    const priceBreakout = currentClose > maxHigh;
    const volumeSpike = currentVolume > avgVol * 1.5;

    if (priceBreakout && volumeSpike) {
      return { isBreakout: true, breakoutType: 'PRICE' };
    }
    if (volumeSpike) {
      return { isBreakout: true, breakoutType: 'VOLUME' };
    }

    return { isBreakout: false, breakoutType: null };
  }

  /**
   * Annualized-style daily return volatility (std dev of simple returns) over `period`.
   * Returns the stdDev as a decimal (e.g. 0.018 = 1.8% daily stdev).
   */
  calcVolatility(closes: number[], period: number = 20): number {
    if (closes.length < period + 1) return 0;
    const slice = closes.slice(-(period + 1));
    const returns: number[] = [];
    for (let i = 1; i < slice.length; i++) {
      if (slice[i - 1] === 0) continue;
      returns.push((slice[i] - slice[i - 1]) / slice[i - 1]);
    }
    if (returns.length === 0) return 0;
    const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
    const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
    return Math.sqrt(variance);
  }

  /** Max peak-to-trough drawdown over the last `lookback` closes. Returns a positive decimal (e.g. 0.22 = 22% drawdown). */
  calcMaxDrawdown(closes: number[], lookback: number = 90): number {
    if (closes.length === 0) return 0;
    const slice = closes.slice(-lookback);
    let peak = slice[0];
    let maxDD = 0;
    for (const price of slice) {
      if (price > peak) peak = price;
      if (peak > 0) {
        const dd = (peak - price) / peak;
        if (dd > maxDD) maxDD = dd;
      }
    }
    return maxDD;
  }

  /** Average True Range (Wilder smoothing), `period` default 14. Returns ATR in price units. */
  calcATR(highs: number[], lows: number[], closes: number[], period: number = 14): number {
    const n = Math.min(highs.length, lows.length, closes.length);
    if (n < period + 1) return 0;
    const trs: number[] = [];
    for (let i = 1; i < n; i++) {
      const highLow = highs[i] - lows[i];
      const highPrev = Math.abs(highs[i] - closes[i - 1]);
      const lowPrev = Math.abs(lows[i] - closes[i - 1]);
      trs.push(Math.max(highLow, highPrev, lowPrev));
    }
    if (trs.length < period) return 0;
    // Wilder smoothing: first ATR = mean(TR over first `period` values), then recursive.
    let atr = trs.slice(0, period).reduce((s, v) => s + v, 0) / period;
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
  }

  /** Traded value proxy for liquidity: avg volume * latest price (INR). */
  calcTradedValue(avgVolume20: number, price: number): number {
    return Math.max(0, avgVolume20 * price);
  }

  /**
   * Pearson correlation of daily simple returns between two close-price series.
   * Both series must be aligned (same length, same dates). Returns a value in [-1, 1].
   * Returns null if too few aligned data points.
   */
  calcCorrelation(closesA: number[], closesB: number[]): number | null {
    const n = Math.min(closesA.length, closesB.length);
    if (n < 3) return null;
    const a = closesA.slice(-n);
    const b = closesB.slice(-n);
    const retA: number[] = [];
    const retB: number[] = [];
    for (let i = 1; i < n; i++) {
      if (a[i - 1] === 0 || b[i - 1] === 0) continue;
      retA.push((a[i] - a[i - 1]) / a[i - 1]);
      retB.push((b[i] - b[i - 1]) / b[i - 1]);
    }
    if (retA.length < 2) return null;
    const meanA = retA.reduce((s, v) => s + v, 0) / retA.length;
    const meanB = retB.reduce((s, v) => s + v, 0) / retB.length;
    let num = 0;
    let denA = 0;
    let denB = 0;
    for (let i = 0; i < retA.length; i++) {
      const da = retA[i] - meanA;
      const db = retB[i] - meanB;
      num += da * db;
      denA += da * da;
      denB += db * db;
    }
    if (denA === 0 || denB === 0) return null;
    return num / Math.sqrt(denA * denB);
  }

  /** Classify trend based on MA alignment */
  classifyTrend(
    price: number,
    sma20: number,
    sma50: number,
    sma200: number
  ): 'UP' | 'DOWN' | 'SIDEWAYS' {
    if (price > sma20 && sma20 > sma50 && sma50 > sma200) return 'UP';
    if (price < sma20 && sma20 < sma50 && sma50 < sma200) return 'DOWN';
    return 'SIDEWAYS';
  }

  /**
   * Classify market regime from an index close-price series (e.g. Nifty 50).
   * BULLISH: price above 50DMA above 200DMA. BEARISH: opposite. SIDEWAYS: otherwise.
   */
  classifyMarketRegime(closes: number[]): 'BULLISH' | 'BEARISH' | 'SIDEWAYS' {
    if (closes.length < 200) return 'SIDEWAYS';
    const price = closes[closes.length - 1];
    const sma50 = closes.slice(-50).reduce((s, v) => s + v, 0) / 50;
    const sma200 = closes.slice(-200).reduce((s, v) => s + v, 0) / 200;
    if (price > sma50 && sma50 > sma200) return 'BULLISH';
    if (price < sma50 && sma50 < sma200) return 'BEARISH';
    return 'SIDEWAYS';
  }

  /** Compute all indicators at once */
  computeAll(
    closes: number[],
    highs: number[],
    volumes: number[]
  ): Omit<Indicators, 'bollingerMiddle'> & { bollingerMiddle?: number } {
    const sma20Arr = this.calcSMA(closes, 20);
    const sma50Arr = this.calcSMA(closes, 50);
    const sma200Arr = this.calcSMA(closes, 200);
    const ema20Arr = this.calcEMA(closes, 20);
    const rsiArr = this.calcRSI(closes, 14);
    const macd = this.calcMACD(closes);
    const bb = this.calcBollingerBands(closes, 20);
    const avgVol = this.calcAvgVolume(volumes, 20);
    const currentVolume = volumes[volumes.length - 1] || 0;
    const breakout = this.detectBreakout(closes, highs, volumes);

    const last = (arr: number[]) => arr[arr.length - 1] || 0;
    const price = closes[closes.length - 1] || 0;

    return {
      sma20: last(sma20Arr),
      sma50: last(sma50Arr),
      sma200: last(sma200Arr),
      ema20: last(ema20Arr),
      rsi14: last(rsiArr),
      macdLine: last(macd.line),
      macdSignal: last(macd.signal),
      macdHistogram: last(macd.histogram),
      bollingerUpper: last(bb.upper),
      bollingerMiddle: last(bb.middle),
      bollingerLower: last(bb.lower),
      avgVolume20: avgVol,
      volumeRatio: avgVol > 0 ? currentVolume / avgVol : 1,
      ...breakout,
      trendDirection: this.classifyTrend(price, last(sma20Arr), last(sma50Arr), last(sma200Arr)),
    };
  }
}
