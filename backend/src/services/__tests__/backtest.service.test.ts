import { describe, it, expect } from 'vitest';
import { CandleRow, computeMetrics, simulateTrade } from '../backtest.service';
import { EquityPoint } from '../../models/BacktestRun';

function makeCandle(day: number, o: number, h: number, l: number, c: number): CandleRow {
  return {
    timestamp: new Date(Date.UTC(2026, 0, day)),
    open: o,
    high: h,
    low: l,
    close: c,
  };
}

const baseConfig = {
  exitRule: 'TECHNICAL' as const,
  technicalExitThreshold: 50,
  maxHoldDays: 30,
  holdDays: 20,
  slippagePct: 0, // set 0 for clean asserts
};

describe('simulateTrade', () => {
  it('exits on TARGET_HIT when target reached first', () => {
    const candles = [
      makeCandle(2, 100, 105, 98, 102),
      makeCandle(3, 102, 110, 100, 108),
      makeCandle(4, 108, 115, 107, 112), // target 112 hit by high
    ];
    const trade = simulateTrade({
      entryPrice: 100,
      stopLoss: 95,
      target: 112,
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      futureCandles: candles,
      config: baseConfig,
    });
    expect(trade).not.toBeNull();
    expect(trade!.exitReason).toBe('TARGET_HIT');
    expect(trade!.exitPrice).toBe(112);
    expect(trade!.returnPct).toBeCloseTo(12, 5);
  });

  it('exits on STOP_LOSS_HIT when stop reached first', () => {
    const candles = [
      makeCandle(2, 100, 102, 94, 96), // low 94 <= stop 95
      makeCandle(3, 96, 98, 90, 92),
    ];
    const trade = simulateTrade({
      entryPrice: 100,
      stopLoss: 95,
      target: 115,
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      futureCandles: candles,
      config: baseConfig,
    });
    expect(trade!.exitReason).toBe('STOP_LOSS_HIT');
    expect(trade!.exitPrice).toBe(95);
    expect(trade!.returnPct).toBeCloseTo(-5, 5);
  });

  it('exits on TECHNICAL_EXIT when technicalScore drops below threshold', () => {
    const candles = [
      makeCandle(2, 100, 102, 97, 101),
      makeCandle(3, 101, 104, 99, 103),
      makeCandle(4, 103, 106, 101, 105), // neither stop nor target; ts<50 triggers exit
    ];
    const tsMap = new Map<string, number>([
      ['2026-01-02', 70],
      ['2026-01-03', 60],
      ['2026-01-04', 45], // below 50
    ]);
    const trade = simulateTrade({
      entryPrice: 100,
      stopLoss: 90,
      target: 120,
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      futureCandles: candles,
      technicalScoreByDate: tsMap,
      config: baseConfig,
    });
    expect(trade!.exitReason).toBe('TECHNICAL_EXIT');
    expect(trade!.exitPrice).toBe(105);
  });

  it('TIME_EXPIRED when no rule fires within window', () => {
    const candles = Array.from({ length: 10 }, (_, i) =>
      makeCandle(2 + i, 100, 104, 96, 101)
    );
    const trade = simulateTrade({
      entryPrice: 100,
      stopLoss: 80,
      target: 150,
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      futureCandles: candles,
      config: { ...baseConfig, maxHoldDays: 10 },
    });
    expect(trade!.exitReason).toBe('TIME_EXPIRED');
    expect(trade!.exitPrice).toBe(101);
  });

  it('FIXED_HOLD ignores technical signal and uses holdDays', () => {
    const candles = Array.from({ length: 25 }, (_, i) =>
      makeCandle(2 + i, 100, 104, 96, 101 + i * 0.5)
    );
    const tsMap = new Map<string, number>([[candles[3].timestamp.toISOString().slice(0, 10), 10]]);
    const trade = simulateTrade({
      entryPrice: 100,
      stopLoss: 80,
      target: 200,
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      futureCandles: candles,
      technicalScoreByDate: tsMap,
      config: { ...baseConfig, exitRule: 'FIXED_HOLD', holdDays: 5 },
    });
    expect(trade!.exitReason).toBe('TIME_EXPIRED');
    // Exit at end of 5-day window -> candles[4].close = 101 + 4*0.5 = 103
    expect(trade!.exitPrice).toBe(103);
  });

  it('returns null for empty future candles', () => {
    const trade = simulateTrade({
      entryPrice: 100,
      stopLoss: 95,
      target: 110,
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      futureCandles: [],
      config: baseConfig,
    });
    expect(trade).toBeNull();
  });

  it('prefers STOP over TARGET when both fire on same candle (pessimistic)', () => {
    const candles = [makeCandle(2, 100, 115, 90, 105)];
    const trade = simulateTrade({
      entryPrice: 100,
      stopLoss: 95,
      target: 110,
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      futureCandles: candles,
      config: baseConfig,
    });
    expect(trade!.exitReason).toBe('STOP_LOSS_HIT');
  });

  it('applies slippage to entry and exit', () => {
    const candles = [makeCandle(2, 100, 112, 98, 110)];
    const trade = simulateTrade({
      entryPrice: 100,
      stopLoss: 90,
      target: 110,
      entryDate: new Date(Date.UTC(2026, 0, 1)),
      futureCandles: candles,
      config: { ...baseConfig, slippagePct: 0.1 },
    });
    // entry = 100 * 1.001 = 100.1, exit = 110 * 0.999 = 109.89, return ~ 9.78%
    expect(trade!.returnPct).toBeLessThan(10);
    expect(trade!.returnPct).toBeGreaterThan(9);
  });
});

describe('computeMetrics', () => {
  it('computes winRate and avgReturnPct', () => {
    const trades: any[] = [
      { returnPct: 10 },
      { returnPct: 5 },
      { returnPct: -3 },
      { returnPct: -2 },
    ];
    const equity: EquityPoint[] = [];
    const m = computeMetrics(trades, equity);
    expect(m.totalTrades).toBe(4);
    expect(m.wins).toBe(2);
    expect(m.losses).toBe(2);
    expect(m.winRate).toBeCloseTo(0.5, 5);
    expect(m.avgReturnPct).toBeCloseTo(2.5, 5);
  });

  it('computes max drawdown from equity curve', () => {
    const equity: EquityPoint[] = [
      { date: new Date(Date.UTC(2026, 0, 1)), equity: 100 },
      { date: new Date(Date.UTC(2026, 0, 2)), equity: 120 },
      { date: new Date(Date.UTC(2026, 0, 3)), equity: 90 }, // peak 120 -> 90 = 25%
      { date: new Date(Date.UTC(2026, 0, 4)), equity: 100 },
    ];
    const m = computeMetrics([], equity);
    expect(m.maxDrawdown).toBeCloseTo(0.25, 5);
  });

  it('returns 0 Sharpe for empty equity curve', () => {
    const m = computeMetrics([], []);
    expect(m.sharpe).toBe(0);
  });
});
