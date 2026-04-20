import { describe, it, expect } from 'vitest';
import { isTradingDayIST, mostRecentTradingDayIST } from '../market-hours';

describe('isTradingDayIST', () => {
  it('returns true for an IST weekday midnight', () => {
    // 2026-04-17 00:00 IST = 2026-04-16 18:30 UTC. Friday in IST.
    expect(isTradingDayIST(new Date('2026-04-16T18:30:00Z'))).toBe(true);
  });

  it('returns false for Saturday in IST', () => {
    // 2026-04-18 00:00 IST = 2026-04-17 18:30 UTC.
    expect(isTradingDayIST(new Date('2026-04-17T18:30:00Z'))).toBe(false);
  });

  it('returns false for Sunday in IST', () => {
    // 2026-04-19 00:00 IST.
    expect(isTradingDayIST(new Date('2026-04-18T18:30:00Z'))).toBe(false);
  });

  it('returns true for Monday in IST', () => {
    expect(isTradingDayIST(new Date('2026-04-19T18:30:00Z'))).toBe(true);
  });

  it('correctly classifies a UTC-stamped Friday 23:30 (still Friday in IST? no, it is Saturday 05:00 IST)', () => {
    // 2026-04-17T23:30Z = 2026-04-18 05:00 IST (Saturday).
    expect(isTradingDayIST(new Date('2026-04-17T23:30:00Z'))).toBe(false);
  });
});

describe('mostRecentTradingDayIST', () => {
  it('on a Sunday returns the preceding Friday at 00:00 IST', () => {
    const sunday = new Date('2026-04-19T12:00:00Z'); // Sunday 17:30 IST
    const result = mostRecentTradingDayIST(sunday);
    // 2026-04-17 00:00 IST = 2026-04-16 18:30 UTC
    expect(result.toISOString()).toBe('2026-04-16T18:30:00.000Z');
  });

  it('on a Saturday returns the preceding Friday', () => {
    const saturday = new Date('2026-04-18T10:00:00Z'); // Sat 15:30 IST
    const result = mostRecentTradingDayIST(saturday);
    expect(result.toISOString()).toBe('2026-04-16T18:30:00.000Z');
  });

  it('on a Monday returns the same Monday', () => {
    const monday = new Date('2026-04-20T12:00:00Z'); // Mon 17:30 IST
    const result = mostRecentTradingDayIST(monday);
    // Monday 2026-04-20 00:00 IST = 2026-04-19 18:30 UTC
    expect(result.toISOString()).toBe('2026-04-19T18:30:00.000Z');
  });

  it('result always passes isTradingDayIST', () => {
    for (let offsetDays = 0; offsetDays < 14; offsetDays++) {
      const d = new Date(Date.UTC(2026, 3, 1 + offsetDays, 12, 0, 0));
      expect(isTradingDayIST(mostRecentTradingDayIST(d))).toBe(true);
    }
  });
});
