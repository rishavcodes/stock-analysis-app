import { describe, it, expect } from 'vitest';
import { PortfolioService } from '../portfolio.service';

const svc = new PortfolioService();

describe('PortfolioService.computePositionSize', () => {
  it('uses risk-based sizing when below max-position cap', () => {
    // capital=100000, riskPct=1, entry=1000, stop=950
    // riskAmount=1000, perShareLoss=50, rawQty=20, maxPositionValue=10000, maxQty=10 -> capped
    const r = svc.computePositionSize(100_000, 1, 1000, 950);
    expect(r.qty).toBe(10);
    expect(r.cappedByMaxPosition).toBe(true);
    expect(r.riskAmount).toBe(1000);
  });

  it('returns full risk-based qty when within cap', () => {
    // capital=1,000,000, riskPct=1, entry=1000, stop=950
    // riskAmount=10000, perShareLoss=50, rawQty=200, maxPositionValue=100000, maxQty=100 -> still capped
    // Use entry=500, stop=450 -> rawQty=10000/50=200, maxPositionValue=100000, maxQty=200 -> equal
    const r = svc.computePositionSize(1_000_000, 1, 500, 450);
    expect(r.qty).toBeGreaterThan(0);
    expect(r.positionValue).toBeLessThanOrEqual(100_000);
  });

  it('throws when stop >= entry', () => {
    expect(() => svc.computePositionSize(100_000, 1, 1000, 1000)).toThrow();
    expect(() => svc.computePositionSize(100_000, 1, 1000, 1100)).toThrow();
  });

  it('throws when riskPct invalid', () => {
    expect(() => svc.computePositionSize(100_000, 0, 1000, 950)).toThrow();
    expect(() => svc.computePositionSize(100_000, 150, 1000, 950)).toThrow();
  });
});
