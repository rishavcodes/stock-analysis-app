import { MARKET_HOURS } from '../config/constants';

/** Get current time in IST */
export function getISTDate(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000; // UTC+5:30
  return new Date(now.getTime() + istOffset + now.getTimezoneOffset() * 60 * 1000);
}

/** Check if Indian stock market is currently open */
export function isMarketOpen(): boolean {
  const ist = getISTDate();
  const day = ist.getDay();

  // Weekends
  if (day === 0 || day === 6) return false;

  const hours = ist.getHours();
  const minutes = ist.getMinutes();
  const currentMinutes = hours * 60 + minutes;
  const openMinutes = MARKET_HOURS.OPEN_HOUR * 60 + MARKET_HOURS.OPEN_MINUTE;
  const closeMinutes = MARKET_HOURS.CLOSE_HOUR * 60 + MARKET_HOURS.CLOSE_MINUTE;

  return currentMinutes >= openMinutes && currentMinutes <= closeMinutes;
}

/** Format date for Angel One API (yyyy-MM-dd HH:mm) */
export function formatSmartAPIDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d} ${h}:${min}`;
}

/** Get date N days ago */
export function daysAgo(n: number): Date {
  const date = new Date();
  date.setDate(date.getDate() - n);
  return date;
}

/** Get today's date string (YYYY-MM-DD) */
export function todayIST(): string {
  const ist = getISTDate();
  return ist.toISOString().split('T')[0];
}

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/**
 * True if `date` (interpreted in IST) is a Monday-through-Friday trading day.
 * Does NOT account for NSE holidays — those pass through and simply yield no
 * candle from the broker, which is fine (we just skip storing nothing).
 */
export function isTradingDayIST(date: Date): boolean {
  // Shift the UTC instant forward by 5.5h, then read UTC components — this
  // gives the calendar date/weekday as seen in IST without depending on the
  // server's local timezone.
  const istShifted = new Date(date.getTime() + IST_OFFSET_MS);
  const day = istShifted.getUTCDay();
  return day !== 0 && day !== 6;
}

/**
 * Most recent trading day at 00:00 IST expressed as a UTC Date.
 * If today (IST) is a weekday, returns today 00:00 IST. If Sat, returns Fri.
 * If Sun, returns Fri. Pre-market Monday still returns today (the cron
 * runs at 16:00 IST after close, so by scheduled run time today is valid).
 */
export function mostRecentTradingDayIST(now: Date = new Date()): Date {
  const istShifted = new Date(now.getTime() + IST_OFFSET_MS);
  while (istShifted.getUTCDay() === 0 || istShifted.getUTCDay() === 6) {
    istShifted.setUTCDate(istShifted.getUTCDate() - 1);
  }
  // 00:00 IST of that date, expressed as the equivalent UTC instant.
  const istMidnightUtc = Date.UTC(
    istShifted.getUTCFullYear(),
    istShifted.getUTCMonth(),
    istShifted.getUTCDate(),
    0,
    0,
    0
  );
  return new Date(istMidnightUtc - IST_OFFSET_MS);
}
