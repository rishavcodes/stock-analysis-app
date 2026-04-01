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
