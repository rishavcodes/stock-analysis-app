import { describe, it, expect } from 'vitest';
import { IndicatorService } from '../indicator.service';
import { ScoringService } from '../scoring.service';
import { WEIGHT_CONFIG } from '../../config/constants';

const indicators = new IndicatorService();
const scoring = new ScoringService();

/** Deterministic pseudo-random for reproducible SIDEWAYS fixture. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('IndicatorService.classifyMarketRegime', () => {
  it('classifies a clean uptrend as BULLISH', () => {
    // 200 days, monotonic growth: price > sma50 > sma200.
    const closes = Array.from({ length: 200 }, (_, i) => 1000 + i * 5);
    expect(indicators.classifyMarketRegime(closes)).toBe('BULLISH');
  });

  it('classifies a clean downtrend as BEARISH', () => {
    const closes = Array.from({ length: 200 }, (_, i) => 2000 - i * 5);
    expect(indicators.classifyMarketRegime(closes)).toBe('BEARISH');
  });

  it('classifies a random-walk series as SIDEWAYS', () => {
    const rng = mulberry32(42);
    const closes: number[] = [1000];
    for (let i = 1; i < 200; i++) {
      closes.push(closes[i - 1] * (1 + (rng() - 0.5) * 0.02));
    }
    expect(indicators.classifyMarketRegime(closes)).toBe('SIDEWAYS');
  });

  it('returns SIDEWAYS when insufficient data (< 200 closes)', () => {
    expect(indicators.classifyMarketRegime([1, 2, 3])).toBe('SIDEWAYS');
  });
});

describe('ScoringService.computeFinalScore (dynamic weights)', () => {
  it('uses BULLISH weights (technical-heavy) when regime=BULLISH', () => {
    const { finalScore, weightsUsed } = scoring.computeFinalScore(50, 50, 50, 100, 'BULLISH');
    expect(weightsUsed).toEqual(WEIGHT_CONFIG.BULLISH);
    // 50*0.15 + 50*0.20 + 50*0.25 + 100*0.40 = 7.5+10+12.5+40 = 70
    expect(finalScore).toBe(70);
  });

  it('uses BEARISH weights (fundamental-heavy) when regime=BEARISH', () => {
    const { finalScore, weightsUsed } = scoring.computeFinalScore(50, 50, 100, 50, 'BEARISH');
    expect(weightsUsed).toEqual(WEIGHT_CONFIG.BEARISH);
    // 50*0.25 + 50*0.20 + 100*0.35 + 50*0.20 = 12.5+10+35+10 = 67.5 -> 68
    expect(finalScore).toBe(68);
  });

  it('uses SIDEWAYS weights (sector-heavy) when regime=SIDEWAYS', () => {
    const { weightsUsed } = scoring.computeFinalScore(50, 100, 50, 50, 'SIDEWAYS');
    expect(weightsUsed).toEqual(WEIGHT_CONFIG.SIDEWAYS);
  });

  it('falls back to static SCORE_WEIGHTS when regime is undefined', () => {
    const { finalScore, weightsUsed } = scoring.computeFinalScore(50, 50, 50, 50);
    expect(weightsUsed.market + weightsUsed.sector + weightsUsed.fundamental + weightsUsed.technical).toBeCloseTo(1, 5);
    expect(finalScore).toBe(50);
  });

  it('all regime weights sum to 1.0', () => {
    for (const regime of ['BULLISH', 'BEARISH', 'SIDEWAYS'] as const) {
      const w = WEIGHT_CONFIG[regime];
      expect(w.market + w.sector + w.fundamental + w.technical).toBeCloseTo(1, 5);
    }
  });
});
