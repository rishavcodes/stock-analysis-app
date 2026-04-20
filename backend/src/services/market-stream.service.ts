import { EventEmitter } from 'events';
import { WebSocketV2 } from 'smartapi-javascript';
import { env } from '../config/env';
import { logger } from '../utils/logger';
import { SmartAPIService } from './smartapi.service';

// Angel WebSocket constants (from smartapi-javascript/config/constant.js).
// Duplicated here rather than reached into the node_modules internals.
const WS_ACTION = { SUBSCRIBE: 1 as const, UNSUBSCRIBE: 0 as const };
const WS_MODE = { LTP: 1, QUOTE: 2, SNAP_QUOTE: 3, DEPTH: 4 } as const;
const WS_EXCHANGE = { NSE_CM: 1, BSE_CM: 3 } as const;

// Angel returns prices in paise (int64). Divide by 100 to get rupees.
const PAISE_PER_RUPEE = 100;

export interface Tick {
  token: string;
  exchange: 'NSE' | 'BSE';
  ltp: number;
  close: number; // prior-day close
  open: number;
  high: number;
  low: number;
  volume?: number;
  exchangeTimestamp: number; // ms since epoch
}

// Angel's binary-parser ships every numeric field as a STRING (to keep full
// precision on int64 values like sequence_number and price-in-paise). Typing
// everything as `unknown` and coercing in `handleTick` makes this explicit.
type RawFrame = Record<string, unknown>;

/** Safely coerce a string|number field to a finite JS number, or undefined. */
function toFinite(v: unknown): number | undefined {
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string' && v.length > 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function exchangeCodeToName(code: number): 'NSE' | 'BSE' {
  return code === WS_EXCHANGE.BSE_CM ? 'BSE' : 'NSE';
}

function exchangeNameToCode(name: string): number {
  return name.toUpperCase() === 'BSE' ? WS_EXCHANGE.BSE_CM : WS_EXCHANGE.NSE_CM;
}

/**
 * Angel One live-quote relay. Owns one upstream `WebSocketV2` connection, ref-counts
 * per-token subscriptions so N SSE clients all share one Angel subscription per
 * token, caches the latest tick per token, and emits a `tick` event for each update.
 *
 * Lifecycle:
 *   const svc = new MarketStreamService(smartApi);
 *   const unsubscribe = await svc.subscribeQuote('NSE', '2885');
 *   svc.on('tick', (t: Tick) => ...);
 *   unsubscribe();     // when the consumer goes away
 *   await svc.close(); // on server shutdown
 */
export class MarketStreamService extends EventEmitter {
  private smartApi: SmartAPIService;
  private ws: WebSocketV2 | null = null;
  private connected = false;
  private connecting: Promise<void> | null = null;
  private refCounts = new Map<string, number>();          // key: `${exchange}:${token}`
  private latestTicks = new Map<string, Tick>();          // keyed by token
  private closed = false;
  private tickCount = 0;

  constructor(smartApi: SmartAPIService) {
    super();
    this.smartApi = smartApi;
    // EventEmitter defaults to 10 listeners; each SSE client adds one. Bump.
    this.setMaxListeners(200);
  }

  /**
   * Subscribe (ref-counted) to real-time Quote-mode updates for a token.
   * Returns an unsubscribe function that MUST be called when the caller leaves.
   */
  async subscribeQuote(exchange: string, token: string): Promise<() => void> {
    if (this.closed) throw new Error('MarketStreamService is closed');
    const key = `${exchange}:${token}`;
    const prev = this.refCounts.get(key) ?? 0;
    this.refCounts.set(key, prev + 1);

    if (prev === 0) {
      await this.ensureConnected();
      this.sendSubscription(exchange, [token], WS_ACTION.SUBSCRIBE);
      logger.info(`MarketStream: subscribed ${key}`);
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.refCounts.get(key) ?? 0;
      if (current <= 1) {
        this.refCounts.delete(key);
        this.latestTicks.delete(token);
        // Best-effort unsubscribe — if socket is down, Angel will drop anyway.
        try {
          this.sendSubscription(exchange, [token], WS_ACTION.UNSUBSCRIBE);
          logger.info(`MarketStream: unsubscribed ${key}`);
        } catch (err) {
          logger.warn(`MarketStream: unsubscribe failed for ${key}: ${err instanceof Error ? err.message : err}`);
        }
      } else {
        this.refCounts.set(key, current - 1);
      }
    };
  }

  /** Last known tick for a token, if any. */
  getLatestTick(token: string): Tick | undefined {
    return this.latestTicks.get(token);
  }

  /** Close the upstream connection and stop emitting. Idempotent. */
  async close(): Promise<void> {
    if (this.closed) return;
    this.closed = true;
    this.connected = false;
    this.refCounts.clear();
    this.latestTicks.clear();
    try {
      this.ws?.close?.();
    } catch (err) {
      logger.warn(`MarketStream: close error: ${err instanceof Error ? err.message : err}`);
    }
    this.ws = null;
    this.removeAllListeners('tick');
    logger.info('MarketStream: closed');
  }

  /** Lazily (re)open the Angel socket, reusing an in-flight connect. */
  private async ensureConnected(): Promise<void> {
    // `this.ws._readyState` isn't exposed by WebSocketV2 (the underlying ws
    // lives in a closure), so we track connection state ourselves.
    if (this.ws && this.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      await this.smartApi.ensureSessionReady();
      const jwt = this.smartApi.getJwtToken();
      const feed = this.smartApi.getFeedToken();
      if (!jwt || !feed) throw new Error('SmartAPI session missing jwt/feed token');

      logger.info(`MarketStream: connecting to Angel socket (jwt len=${jwt.length}, feed len=${feed.length})`);

      this.ws = new WebSocketV2({
        clientcode: env.SMARTAPI_CLIENT_CODE,
        jwttoken: jwt,
        apikey: env.SMARTAPI_API_KEY,
        feedtype: feed,
      });

      // Auto-reconnect with exponential backoff (2s → 4s → 8s … capped internally).
      this.ws.reconnection?.('exponential', 2000, 2);
      this.ws.on('tick', (frame: unknown) => this.handleTick(frame));
      await this.ws.connect();
      this.connected = true;
      logger.info('MarketStream: connected to Angel socket');
    })().finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  private sendSubscription(exchange: string, tokens: string[], action: 0 | 1): void {
    if (!this.ws) return;
    this.ws.fetchData({
      correlationID: `stream-${Date.now()}`,
      action,
      mode: WS_MODE.QUOTE,
      exchangeType: exchangeNameToCode(exchange),
      tokens,
    });
  }

  private handleTick(frame: unknown): void {
    // WebSocketV2 hands us the parsed object for LTP/QUOTE/SNAP_QUOTE. If it
    // can't parse (e.g. a non-binary text frame from a ping-pong), we get the
    // raw buffer — ignore those.
    if (!frame || typeof frame !== 'object' || Array.isArray(frame) || Buffer.isBuffer(frame)) return;
    const q = frame as RawFrame;

    // Angel's binary-parser emits every numeric field as a *string* so BigInt
    // values don't lose precision. Coerce explicitly rather than trusting the
    // TypeScript types we declared earlier.
    const ltpPaise = toFinite(q.last_traded_price);
    if (ltpPaise == null) return;

    // Angel's binary parser runs token bytes through JSON.stringify, so the
    // value arrives wrapped in literal quote characters (e.g. `"2885"`) with
    // any null padding already stripped by the package's _atos helper.
    const rawToken = q.token;
    if (typeof rawToken !== 'string') return;
    const token = rawToken.replace(/^"+|"+$/g, '').replace(/\u0000+$/g, '').trim();
    if (!token) return;

    const exchangeCode = toFinite(q.exchange_type) ?? WS_EXCHANGE.NSE_CM;
    const closePaise = toFinite(q.close_price) ?? 0;
    const openPaise = toFinite(q.open_price_day) ?? 0;
    const highPaise = toFinite(q.high_price_day) ?? 0;
    const lowPaise = toFinite(q.low_price_day) ?? 0;
    const volume = toFinite(q.vol_traded);
    const exchangeTimestamp = toFinite(q.exchange_timestamp) ?? Date.now();

    const tick: Tick = {
      token,
      exchange: exchangeCodeToName(exchangeCode),
      ltp: ltpPaise / PAISE_PER_RUPEE,
      close: closePaise / PAISE_PER_RUPEE,
      open: openPaise / PAISE_PER_RUPEE,
      high: highPaise / PAISE_PER_RUPEE,
      low: lowPaise / PAISE_PER_RUPEE,
      volume,
      exchangeTimestamp,
    };

    this.latestTicks.set(tick.token, tick);
    this.emit('tick', tick);

    // Lightweight heartbeat log: one line per 20 ticks so we can confirm the
    // pipeline is alive without flooding.
    this.tickCount++;
    if (this.tickCount === 1 || this.tickCount % 20 === 0) {
      logger.info(
        `MarketStream: tick#${this.tickCount} token=${tick.token} ltp=${tick.ltp} close=${tick.close} listeners=${this.listenerCount('tick')}`
      );
    }
  }
}
