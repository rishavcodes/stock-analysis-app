import { describe, it, expect } from 'vitest';
import { IndicatorService } from '../indicator.service';
import { ScoringService } from '../scoring.service';

const indicators = new IndicatorService();
const scoring = new ScoringService();

describe('IndicatorService risk helpers', () => {
  it('calcVolatility is higher for noisier series', () => {
    const stable = Array.from({ length: 30 }, (_, i) => 1000 + i * 0.1);
    const noisy = Array.from({ length: 30 }, (_, i) => 1000 + (i % 2 === 0 ? 50 : -50));
    const volStable = indicators.calcVolatility(stable, 20);
    const volNoisy = indicators.calcVolatility(noisy, 20);
    expect(volNoisy).toBeGreaterThan(volStable);
  });

  it('calcMaxDrawdown captures peak-to-trough decline', () => {
    const closes = [100, 120, 150, 140, 90, 95, 105]; // peak 150, trough 90 => 40%
    const dd = indicators.calcMaxDrawdown(closes, 90);
    expect(dd).toBeCloseTo(0.4, 3);
  });

  it('calcMaxDrawdown is 0 for monotonic-up series', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + i);
    expect(indicators.calcMaxDrawdown(closes, 50)).toBe(0);
  });

  it('calcATR returns positive value for volatile candles', () => {
    const n = 30;
    const highs = Array.from({ length: n }, (_, i) => 100 + (i % 3));
    const lows = Array.from({ length: n }, (_, i) => 95 - (i % 2));
    const closes = Array.from({ length: n }, () => 98);
    const atr = indicators.calcATR(highs, lows, closes, 14);
    expect(atr).toBeGreaterThan(0);
  });

  it('calcTradedValue multiplies volume by price', () => {
    expect(indicators.calcTradedValue(100_000, 500)).toBe(50_000_000);
  });
});

describe('ScoringService.computeRiskScore', () => {
  it('returns low risk for stable liquid stock', () => {
    const score = scoring.computeRiskScore({
      volatility: 0.005,       // 0.5% daily stdev
      maxDrawdown: 0.05,       // 5%
      atr14: 5,
      price: 1000,             // ATR ~0.5%
      tradedValue: 500_000_000, // 50 Cr — well above HIGH anchor
    });
    expect(score).toBeLessThanOrEqual(15);
  });

  it('returns high risk for volatile illiquid stock', () => {
    const score = scoring.computeRiskScore({
      volatility: 0.04,        // 4% daily stdev
      maxDrawdown: 0.40,       // 40%
      atr14: 60,
      price: 1000,             // ATR 6%
      tradedValue: 1_000_000,  // 10 L — below LOW anchor
    });
    expect(score).toBeGreaterThanOrEqual(80);
  });

  it('illiquid stock alone pushes risk up meaningfully', () => {
    const liquid = scoring.computeRiskScore({
      volatility: 0.01, maxDrawdown: 0.10, atr14: 10, price: 1000, tradedValue: 500_000_000,
    });
    const illiquid = scoring.computeRiskScore({
      volatility: 0.01, maxDrawdown: 0.10, atr14: 10, price: 1000, tradedValue: 500_000,
    });
    expect(illiquid).toBeGreaterThan(liquid + 15);
  });

  it('clamps between 0 and 100', () => {
    const min = scoring.computeRiskScore({ volatility: 0, maxDrawdown: 0, atr14: 0, price: 1000, tradedValue: 1_000_000_000 });
    const max = scoring.computeRiskScore({ volatility: 1, maxDrawdown: 1, atr14: 1000, price: 1000, tradedValue: 0 });
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(100);
  });
});

describe('ScoringService.computeAdjustedFinalScore', () => {
  it('subtracts RISK_PENALTY * riskScore from finalScore', () => {
    // finalScore=80, riskScore=50, penalty=0.2 -> 80 - 10 = 70
    expect(scoring.computeAdjustedFinalScore(80, 50)).toBe(70);
  });

  it('clamps at 0', () => {
    expect(scoring.computeAdjustedFinalScore(10, 100)).toBe(0);
  });

  it('is identical to finalScore when riskScore=0', () => {
    expect(scoring.computeAdjustedFinalScore(75, 0)).toBe(75);
  });
});
