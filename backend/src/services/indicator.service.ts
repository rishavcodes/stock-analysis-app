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
