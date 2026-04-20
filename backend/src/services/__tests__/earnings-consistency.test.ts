import { describe, it, expect } from 'vitest';
import { ScoringService } from '../scoring.service';

const scoring = new ScoringService();

describe('ScoringService.computeEarningsConsistency', () => {
  it('high score for stable positive growth', () => {
    const score = scoring.computeEarningsConsistency([15, 18, 12, 20]);
    // mean ~16.25, stdDev small -> score well above 70
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it('low score for volatile swings', () => {
    const score = scoring.computeEarningsConsistency([50, -20, 40, -10]);
    // mean 15, stdDev ~31 -> 50 + 30 - 46.5 ~= 34
    expect(score).toBeLessThan(50);
  });

  it('negative mean pulls score below 50', () => {
    const score = scoring.computeEarningsConsistency([-10, -15, -12, -8]);
    expect(score).toBeLessThan(40);
  });

  it('returns 50 baseline for empty array', () => {
    expect(scoring.computeEarningsConsistency([])).toBe(50);
  });

  it('clamps between 0 and 100', () => {
    const high = scoring.computeEarningsConsistency([100, 100, 100, 100]);
    const low = scoring.computeEarningsConsistency([-100, -100, -100, -100]);
    expect(high).toBeLessThanOrEqual(100);
    expect(low).toBeGreaterThanOrEqual(0);
  });
});

describe('ScoringService.computeFundamentalScore with quarterlyEpsGrowth', () => {
  it('includes earnings consistency as a 6th factor when >=2 data points', () => {
    // Baseline with strong fundamentals, no consistency
    const baseline = scoring.computeFundamentalScore({
      pe: 14, roe: 0.22, debtToEquity: 0.4, revenueGrowthYoY: 0.16, profitMargin: 0.22,
    });

    // Same fundamentals + weak consistency (high stdev) should pull score down.
    const withWeakConsistency = scoring.computeFundamentalScore({
      pe: 14, roe: 0.22, debtToEquity: 0.4, revenueGrowthYoY: 0.16, profitMargin: 0.22,
      quarterlyEpsGrowth: [50, -30, 40, -20],
    });

    expect(withWeakConsistency).toBeLessThan(baseline);
  });

  it('skips consistency factor when fewer than 2 data points (does not dilute)', () => {
    const baseline = scoring.computeFundamentalScore({
      pe: 14, roe: 0.22, debtToEquity: 0.4, revenueGrowthYoY: 0.16, profitMargin: 0.22,
    });
    const withOne = scoring.computeFundamentalScore({
      pe: 14, roe: 0.22, debtToEquity: 0.4, revenueGrowthYoY: 0.16, profitMargin: 0.22,
      quarterlyEpsGrowth: [15],
    });
    expect(withOne).toBe(baseline);
  });
});
