import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest';

// Capture WebSocketV2 mock references so each test can drive ticks/connect.
type TickHandler = (frame: unknown) => void;

interface FakeWs {
  fetchData: Mock;
  on: Mock;
  connect: Mock;
  close: Mock;
  reconnection: Mock;
  _readyState: number;
  _tickHandlers: TickHandler[];
}

const wsInstances: FakeWs[] = [];

vi.mock('smartapi-javascript', () => {
  const WebSocketV2 = vi.fn().mockImplementation(function (this: FakeWs) {
    this._tickHandlers = [];
    this._readyState = 1;
    this.fetchData = vi.fn();
    this.on = vi.fn((evt: string, cb: TickHandler) => {
      if (evt === 'tick') this._tickHandlers.push(cb);
    });
    this.connect = vi.fn().mockResolvedValue(undefined);
    this.close = vi.fn();
    this.reconnection = vi.fn();
    wsInstances.push(this);
  });
  return { WebSocketV2 };
});

vi.mock('../smartapi.service', () => {
  return {
    SmartAPIService: vi.fn().mockImplementation(() => ({
      ensureSessionReady: vi.fn().mockResolvedValue(undefined),
      getJwtToken: vi.fn().mockReturnValue('jwt-test'),
      getFeedToken: vi.fn().mockReturnValue('feed-test'),
    })),
  };
});

// Import after mocks so the module resolves them.
import { MarketStreamService, Tick } from '../market-stream.service';
import { SmartAPIService } from '../smartapi.service';

function emitTick(ws: FakeWs, frame: Record<string, unknown>): void {
  for (const h of ws._tickHandlers) h(frame);
}

/**
 * Build a frame that matches the REAL shape Angel's binary-parser emits:
 *   - All numeric fields are STRINGS (int64 precision preservation).
 *   - `token` is the plain token wrapped in literal quote characters.
 * Unit tests previously used clean numeric values and silently masked the
 * string-vs-number bug — every field here is a string on purpose.
 */
function makeFrame(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    subscription_mode: '2',
    exchange_type: '1',
    token: '"2885"',
    sequence_number: '1',
    exchange_timestamp: '1700000000000',
    last_traded_price: '250000', // 2500 rupees in paise
    open_price_day: '245000',
    high_price_day: '252000',
    low_price_day: '244000',
    close_price: '246000', // 2460 rupees (prior-day close)
    vol_traded: '1000000',
    ...overrides,
  };
}

describe('MarketStreamService', () => {
  let svc: MarketStreamService;

  beforeEach(() => {
    wsInstances.length = 0;
    svc = new MarketStreamService(new SmartAPIService());
  });

  afterEach(async () => {
    await svc.close();
  });

  it('subscribes upstream only once for repeat subscribers on the same token', async () => {
    const unsub1 = await svc.subscribeQuote('NSE', '2885');
    const unsub2 = await svc.subscribeQuote('NSE', '2885');
    expect(wsInstances).toHaveLength(1);
    const ws = wsInstances[0];
    // fetchData called once on first subscribe, not a second time.
    expect(ws.fetchData).toHaveBeenCalledTimes(1);
    expect(ws.fetchData.mock.calls[0][0]).toMatchObject({ action: 1, mode: 2, tokens: ['2885'] });
    unsub1();
    unsub2();
  });

  it('sends unsubscribe only when the last ref releases', async () => {
    const unsub1 = await svc.subscribeQuote('NSE', '2885');
    const unsub2 = await svc.subscribeQuote('NSE', '2885');
    const ws = wsInstances[0];
    unsub1();
    // Still 1 fetchData (the initial subscribe). No unsubscribe yet.
    expect(ws.fetchData).toHaveBeenCalledTimes(1);
    unsub2();
    // Now the last ref drops → unsubscribe fired.
    expect(ws.fetchData).toHaveBeenCalledTimes(2);
    expect(ws.fetchData.mock.calls[1][0]).toMatchObject({ action: 0, tokens: ['2885'] });
  });

  it('emits parsed ticks in rupees and caches the latest', async () => {
    const ticks: Tick[] = [];
    svc.on('tick', (t) => ticks.push(t));
    await svc.subscribeQuote('NSE', '2885');
    const ws = wsInstances[0];
    emitTick(ws, makeFrame());
    expect(ticks).toHaveLength(1);
    const t = ticks[0];
    expect(t.token).toBe('2885');
    expect(t.exchange).toBe('NSE');
    expect(t.ltp).toBeCloseTo(2500, 5);
    expect(t.close).toBeCloseTo(2460, 5);
    expect(t.open).toBeCloseTo(2450, 5);
    expect(svc.getLatestTick('2885')).toEqual(t);
  });

  it('strips surrounding quote characters and null padding from token', async () => {
    // Angel's binary parser JSON.stringify()s the token bytes, so real frames
    // arrive with literal quote chars and sometimes trailing NUL padding.
    const ticks: Tick[] = [];
    svc.on('tick', (t) => ticks.push(t));
    await svc.subscribeQuote('NSE', '2885');
    const ws = wsInstances[0];
    emitTick(ws, makeFrame({ token: '"2885"' }));
    emitTick(ws, makeFrame({ token: '"2885\u0000\u0000"' }));
    expect(ticks).toHaveLength(2);
    expect(ticks[0].token).toBe('2885');
    expect(ticks[1].token).toBe('2885');
    expect(svc.getLatestTick('2885')).toBeDefined();
  });

  it('coerces string-typed numeric fields from the binary parser to numbers', async () => {
    // Real Angel frames arrive with every numeric field as a string (to keep
    // int64 precision). Regression guard for the bug found via diagnose-live.ts:
    // `typeof "136620" !== 'number'` was causing every tick to be dropped.
    const ticks: Tick[] = [];
    svc.on('tick', (t) => ticks.push(t));
    await svc.subscribeQuote('NSE', '2885');
    const ws = wsInstances[0];
    emitTick(
      ws,
      makeFrame({
        last_traded_price: '136620',
        close_price: '136500',
        open_price_day: '136320',
        high_price_day: '137300',
        low_price_day: '135280',
        vol_traded: '9291799',
        exchange_timestamp: '1776674677000',
      })
    );
    expect(ticks).toHaveLength(1);
    const t = ticks[0];
    expect(t.ltp).toBeCloseTo(1366.2, 4);
    expect(t.close).toBeCloseTo(1365, 4);
    expect(t.open).toBeCloseTo(1363.2, 4);
    expect(t.volume).toBe(9291799);
    expect(t.exchangeTimestamp).toBe(1776674677000);
  });

  it('drops malformed ticks that have undefined numeric fields (Angel occasionally ships these)', async () => {
    const ticks: Tick[] = [];
    svc.on('tick', (t) => ticks.push(t));
    await svc.subscribeQuote('NSE', '2885');
    const ws = wsInstances[0];
    // Matches the tick#50 "undefined" line we saw in the live diagnostic.
    emitTick(ws, {
      subscription_mode: undefined,
      exchange_type: undefined,
      token: undefined,
      last_traded_price: undefined,
      close_price: undefined,
    } as any);
    expect(ticks).toHaveLength(0);
  });

  it('ignores malformed frames', async () => {
    const ticks: Tick[] = [];
    svc.on('tick', (t) => ticks.push(t));
    await svc.subscribeQuote('NSE', '2885');
    const ws = wsInstances[0];
    emitTick(ws, { not: 'a tick' } as any);
    emitTick(ws, null as any);
    emitTick(ws, Buffer.from([1, 2, 3]) as any); // raw buffer fallthrough
    expect(ticks).toHaveLength(0);
  });

  it('multiple distinct tokens share one socket but fire separate subscriptions', async () => {
    const u1 = await svc.subscribeQuote('NSE', '2885');
    const u2 = await svc.subscribeQuote('NSE', '11536');
    expect(wsInstances).toHaveLength(1);
    const ws = wsInstances[0];
    expect(ws.fetchData).toHaveBeenCalledTimes(2);
    const tokens = ws.fetchData.mock.calls.map((c: any[]) => c[0].tokens[0]);
    expect(tokens).toEqual(expect.arrayContaining(['2885', '11536']));
    u1();
    u2();
  });

  it('close() clears state and closes the underlying socket', async () => {
    await svc.subscribeQuote('NSE', '2885');
    const ws = wsInstances[0];
    await svc.close();
    expect(ws.close).toHaveBeenCalled();
    expect(svc.getLatestTick('2885')).toBeUndefined();
  });
});
