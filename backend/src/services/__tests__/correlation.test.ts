import { describe, it, expect } from 'vitest';
import { IndicatorService } from '../indicator.service';

const indicators = new IndicatorService();

describe('IndicatorService.calcCorrelation', () => {
  it('identical series → correlation near 1', () => {
    const series = [100, 102, 101, 105, 108, 107, 110, 112, 115, 118];
    const r = indicators.calcCorrelation(series, series);
    expect(r).toBeCloseTo(1, 5);
  });

  it('perfectly inverted series → correlation near -1', () => {
    const a = [100, 102, 104, 106, 108, 110, 108, 106];
    // Build b whose daily RETURNS are the negation of a's returns, scaled.
    const b: number[] = [100];
    for (let i = 1; i < a.length; i++) {
      const retA = (a[i] - a[i - 1]) / a[i - 1];
      b.push(b[i - 1] * (1 - retA));
    }
    const r = indicators.calcCorrelation(a, b);
    expect(r).toBeCloseTo(-1, 5);
  });

  it('returns null when insufficient data', () => {
    expect(indicators.calcCorrelation([100], [100])).toBeNull();
  });

  it('roughly 0 for orthogonal random returns', () => {
    // Deterministic "noise": sign-flipping series vs monotonic.
    const a = Array.from({ length: 40 }, (_, i) => 100 + (i % 2 === 0 ? 1 : -1));
    const b = Array.from({ length: 40 }, (_, i) => 100 + i * 0.01);
    const r = indicators.calcCorrelation(a, b);
    expect(Math.abs(r ?? 1)).toBeLessThan(0.5);
  });
});
