import { describe, it, expect } from 'vitest';
import { evaluateCandles, EvaluationInput } from '../prediction-evaluator.service';

const baseInput: EvaluationInput = {
  analysisDate: new Date('2026-01-01T00:00:00Z'),
  timeHorizon: 'SHORT_TERM',
  entryPrice: 1000,
  targetPrice: 1100,
  stopLoss: 950,
};

function makeCandle(daysFromAnalysis: number, o: number, h: number, l: number, c: number) {
  const ts = new Date(baseInput.analysisDate.getTime() + daysFromAnalysis * 24 * 60 * 60 * 1000);
  return { timestamp: ts, open: o, high: h, low: l, close: c };
}

// Now is >= horizon end so evaluation proceeds.
const NOW_AFTER_HORIZON = new Date('2026-03-15T00:00:00Z');

describe('evaluateCandles', () => {
  it('returns WIN / TARGET_HIT when target is reached first', () => {
    const candles = [
      makeCandle(1, 1000, 1020, 990, 1010),
      makeCandle(2, 1010, 1050, 1000, 1045),
      makeCandle(3, 1045, 1105, 1030, 1100), // high crosses target 1100
      makeCandle(4, 1100, 1110, 1080, 1095),
      makeCandle(5, 1095, 1098, 1070, 1080),
    ];
    const outcome = evaluateCandles(baseInput, candles, NOW_AFTER_HORIZON);
    expect(outcome.evaluated).toBe(true);
    expect(outcome.result).toBe('WIN');
    expect(outcome.exitReason).toBe('TARGET_HIT');
    expect(outcome.exitPrice).toBe(1100);
    expect(outcome.returnPct).toBeCloseTo(10, 5);
  });

  it('returns LOSS / STOP_LOSS_HIT when stop is reached first', () => {
    const candles = [
      makeCandle(1, 1000, 1010, 980, 985),
      makeCandle(2, 985, 995, 940, 945), // low crosses 950
      makeCandle(3, 945, 960, 920, 930),
      makeCandle(4, 930, 940, 910, 915),
      makeCandle(5, 915, 925, 900, 910),
    ];
    const outcome = evaluateCandles(baseInput, candles, NOW_AFTER_HORIZON);
    expect(outcome.evaluated).toBe(true);
    expect(outcome.result).toBe('LOSS');
    expect(outcome.exitReason).toBe('STOP_LOSS_HIT');
    expect(outcome.exitPrice).toBe(950);
  });

  it('treats same-candle target+stop as LOSS (pessimistic)', () => {
    const candles = [
      makeCandle(1, 1000, 1105, 940, 1050), // hits both 1100 and 950 on same candle
      makeCandle(2, 1050, 1060, 1030, 1045),
      makeCandle(3, 1045, 1055, 1020, 1030),
      makeCandle(4, 1030, 1040, 1010, 1020),
      makeCandle(5, 1020, 1025, 1000, 1010),
    ];
    const outcome = evaluateCandles(baseInput, candles, NOW_AFTER_HORIZON);
    expect(outcome.evaluated).toBe(true);
    expect(outcome.result).toBe('LOSS');
    expect(outcome.exitReason).toBe('STOP_LOSS_HIT');
    expect(outcome.sameCandleHit).toBe(true);
  });

  it('returns NEUTRAL / TIME_EXPIRED when no hit and small drift', () => {
    const candles = Array.from({ length: 10 }, (_, i) =>
      makeCandle(i + 1, 1000, 1020, 980, 1010) // last close=1010, +1% returnPct
    );
    const outcome = evaluateCandles(baseInput, candles, NOW_AFTER_HORIZON);
    expect(outcome.evaluated).toBe(true);
    expect(outcome.result).toBe('NEUTRAL');
    expect(outcome.exitReason).toBe('TIME_EXPIRED');
    expect(outcome.returnPct).toBeCloseTo(1, 5);
  });

  it('returns WIN / TIME_EXPIRED when drift exceeds threshold', () => {
    const candles = Array.from({ length: 10 }, (_, i) =>
      makeCandle(i + 1, 1000, 1060, 990, 1060) // close at +6%
    );
    const outcome = evaluateCandles(baseInput, candles, NOW_AFTER_HORIZON);
    // 1060 never crosses target 1100, 1000 low 990 never crosses stop 950.
    expect(outcome.result).toBe('WIN');
    expect(outcome.exitReason).toBe('TIME_EXPIRED');
  });

  it('returns UNEVALUABLE / NO_EXIT_RULES when levels are null', () => {
    const input: EvaluationInput = { ...baseInput, entryPrice: null, targetPrice: null, stopLoss: null };
    const candles = Array.from({ length: 10 }, (_, i) => makeCandle(i + 1, 1000, 1020, 990, 1010));
    const outcome = evaluateCandles(input, candles, NOW_AFTER_HORIZON);
    expect(outcome.result).toBe('UNEVALUABLE');
    expect(outcome.exitReason).toBe('NO_EXIT_RULES');
  });

  it('returns UNEVALUABLE / INSUFFICIENT_DATA when < 5 candles in window', () => {
    const candles = [makeCandle(1, 1000, 1010, 990, 1005), makeCandle(2, 1005, 1015, 1000, 1012)];
    const outcome = evaluateCandles(baseInput, candles, NOW_AFTER_HORIZON);
    expect(outcome.result).toBe('UNEVALUABLE');
    expect(outcome.exitReason).toBe('INSUFFICIENT_DATA');
  });

  it('returns evaluated:false when horizon has not elapsed', () => {
    const nowBefore = new Date('2026-01-10T00:00:00Z'); // only 9 days in, horizon=30
    const candles = Array.from({ length: 5 }, (_, i) => makeCandle(i + 1, 1000, 1020, 990, 1010));
    const outcome = evaluateCandles(baseInput, candles, nowBefore);
    expect(outcome.evaluated).toBe(false);
  });

  it('ignores candles outside the (analysisDate, horizonEnd] window', () => {
    const candles = [
      // Before analysis date — should be ignored.
      { timestamp: new Date('2025-12-25T00:00:00Z'), open: 1000, high: 1200, low: 900, close: 1200 },
      makeCandle(1, 1000, 1020, 990, 1010),
      makeCandle(2, 1010, 1025, 1000, 1020),
      makeCandle(3, 1020, 1105, 1010, 1100), // target hit
      makeCandle(4, 1100, 1110, 1090, 1095),
      makeCandle(5, 1095, 1098, 1080, 1090),
    ];
    const outcome = evaluateCandles(baseInput, candles, NOW_AFTER_HORIZON);
    expect(outcome.result).toBe('WIN');
    expect(outcome.exitReason).toBe('TARGET_HIT');
  });
});
