'use client';

import { useEffect, useState } from 'react';
import { API_URL } from '@/lib/api';

export interface LiveTick {
  token: string;
  exchange: string;
  ltp: number;
  close: number;          // prior-day close
  open: number;
  high: number;
  low: number;
  volume?: number;
  exchangeTimestamp: number;
}

export interface LiveLtpState {
  tick: LiveTick | null;
  connected: boolean;
  tickCount: number;
  /** null when we haven't received any tick yet (fall back to REST-sourced values). */
  lastPrice: number | null;
  prevClose: number | null;
  change: number | null;
  changePercent: number | null;
}

/**
 * Subscribes to the backend SSE stream for a single symbol's live quote.
 * Closes the EventSource on unmount or symbol change. Native `EventSource`
 * auto-reconnects on transient disconnects, so no custom retry logic needed.
 */
export function useLiveLtp(symbol: string | null | undefined): LiveLtpState {
  const [tick, setTick] = useState<LiveTick | null>(null);
  const [connected, setConnected] = useState(false);
  const [tickCount, setTickCount] = useState(0);

  useEffect(() => {
    if (!symbol) return;
    setTick(null);
    setConnected(false);
    setTickCount(0);

    const url = `${API_URL}/stream/ltp/${encodeURIComponent(symbol)}`;
    // eslint-disable-next-line no-console
    console.log('[useLiveLtp] opening', url);
    const es = new EventSource(url);

    es.addEventListener('open', () => {
      // eslint-disable-next-line no-console
      console.log('[useLiveLtp] open', symbol);
      setConnected(true);
    });

    es.addEventListener('tick', (e) => {
      try {
        const data = JSON.parse((e as MessageEvent).data) as LiveTick;
        // eslint-disable-next-line no-console
        console.log('[useLiveLtp] tick', symbol, data.ltp);
        setTick(data);
        setTickCount((n) => n + 1);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[useLiveLtp] parse error', err);
      }
    });

    es.onerror = (err) => {
      // eslint-disable-next-line no-console
      console.warn('[useLiveLtp] error', symbol, es.readyState, err);
      setConnected(false);
      // EventSource handles reconnection; don't close.
    };

    return () => {
      // eslint-disable-next-line no-console
      console.log('[useLiveLtp] closing', symbol);
      es.close();
    };
  }, [symbol]);

  const lastPrice = tick?.ltp ?? null;
  const prevClose = tick && tick.close > 0 ? tick.close : null;
  const change = lastPrice != null && prevClose != null ? lastPrice - prevClose : null;
  const changePercent =
    lastPrice != null && prevClose != null && prevClose > 0
      ? ((lastPrice - prevClose) / prevClose) * 100
      : null;

  return { tick, connected, tickCount, lastPrice, prevClose, change, changePercent };
}
