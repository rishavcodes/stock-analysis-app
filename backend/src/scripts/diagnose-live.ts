/**
 * Standalone diagnostic script that exercises the entire live-price pipeline:
 *   1. Angel session generation
 *   2. REST FULL quote
 *   3. Angel WebSocket connect
 *   4. Subscribe (Quote mode) and receive ticks for 30 s
 *
 * Usage:
 *   cd backend
 *   npx ts-node src/scripts/diagnose-live.ts                # RELIANCE by default
 *   DIAG_SYMBOL=INFY npx ts-node src/scripts/diagnose-live.ts
 *   DIAG_SYMBOL=VOLTAMP DIAG_TOKEN=11536 npx ts-node src/scripts/diagnose-live.ts
 *
 * Redirect to file to share:
 *   npx ts-node src/scripts/diagnose-live.ts > diagnostic.log 2>&1
 *
 * All JWT / feed-token values are redacted to "<first 20 chars>… (len=N)".
 */
import 'dotenv/config';
import { WebSocketV2 } from 'smartapi-javascript';
import { SmartAPIService } from '../services/smartapi.service';
import { env } from '../config/env';

// Liquid NSE symbols and their Angel tokens (known-good). User can override.
const KNOWN_TOKENS: Record<string, string> = {
  RELIANCE: '2885',
  INFY: '1594',
  TCS: '11536',
  HDFCBANK: '1333',
  ICICIBANK: '4963',
};

const SYMBOL = (process.env.DIAG_SYMBOL ?? 'RELIANCE').toUpperCase();
const TOKEN = process.env.DIAG_TOKEN ?? KNOWN_TOKENS[SYMBOL];
const EXCHANGE = process.env.DIAG_EXCHANGE ?? 'NSE';
const EXCHANGE_CODE = EXCHANGE.toUpperCase() === 'BSE' ? 3 : 1; // nse_cm=1, bse_cm=3
const SUBSCRIBE_DURATION_MS = Number(process.env.DIAG_SECONDS ?? 30) * 1000;

function redact(s: string | null | undefined): string {
  if (!s) return '<empty>';
  return `${s.slice(0, 20)}… (len=${s.length})`;
}

function stage(n: number, title: string): void {
  // Big visual separator so the user can see stage boundaries in the log.
  console.log(`\n${'━'.repeat(70)}`);
  console.log(`Stage ${n}: ${title}`);
  console.log('━'.repeat(70));
}

function ok(msg: string): void {
  console.log(`  ✓ ${msg}`);
}

function fail(msg: string, err?: unknown): void {
  console.log(`  ✗ ${msg}`);
  if (err) {
    const e = err as { message?: string; stack?: string };
    console.log(`    error: ${e.message ?? String(err)}`);
    if (e.stack) console.log(`    stack: ${e.stack.split('\n').slice(0, 4).join('\n           ')}`);
  }
}

function info(msg: string): void {
  console.log(`  • ${msg}`);
}

async function main(): Promise<void> {
  console.log('\n════════════════════════════════════════════════════════════════════');
  console.log('  Angel One live-data pipeline diagnostic');
  console.log(`  Symbol: ${SYMBOL}   Token: ${TOKEN}   Exchange: ${EXCHANGE} (code ${EXCHANGE_CODE})`);
  console.log(`  Subscribe window: ${SUBSCRIBE_DURATION_MS / 1000}s`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log('════════════════════════════════════════════════════════════════════');

  if (!TOKEN) {
    fail(`No token known for symbol ${SYMBOL}. Pass DIAG_TOKEN=<token> as well.`);
    process.exit(2);
  }

  const smartApi = new SmartAPIService();

  // ──────────────────────────────────────────────────────────────────
  stage(1, 'Session generation');
  // ──────────────────────────────────────────────────────────────────
  try {
    info(`env.SMARTAPI_API_KEY     = ${redact(env.SMARTAPI_API_KEY)}`);
    info(`env.SMARTAPI_CLIENT_CODE = ${env.SMARTAPI_CLIENT_CODE}`);
    info(`env.SMARTAPI_TOTP_SECRET = ${redact(env.SMARTAPI_TOTP_SECRET)}`);

    const t0 = Date.now();
    await smartApi.initialize();
    const elapsed = Date.now() - t0;
    ok(`initialize() succeeded in ${elapsed}ms`);

    const jwt = smartApi.getJwtToken();
    const feed = smartApi.getFeedToken();
    info(`jwtToken  = ${redact(jwt)}`);
    info(`feedToken = ${redact(feed)}`);
    if (!jwt) fail('jwtToken is empty — session did not populate');
    if (!feed) fail('feedToken is empty — WebSocket auth will fail');
  } catch (err) {
    fail('initialize() threw', err);
    console.log('\nAborting — no session means nothing else will work.');
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────
  stage(2, 'REST FULL quote (used for day-change calc)');
  // ──────────────────────────────────────────────────────────────────
  try {
    const t0 = Date.now();
    const fullQuote = await smartApi.getFullQuote([TOKEN], EXCHANGE);
    const elapsed = Date.now() - t0;
    ok(`getFullQuote returned ${fullQuote.length} row(s) in ${elapsed}ms`);

    if (fullQuote.length === 0) {
      fail('Empty response — Angel rejected the request or token is invalid.');
    } else {
      const row = fullQuote[0];
      console.log('  • raw response (first row):');
      console.log('    ' + JSON.stringify(row, null, 2).replace(/\n/g, '\n    '));

      info(`ltp           = ${row.ltp}`);
      info(`close         = ${row.close}  (prior-day close, used as prevClose)`);
      info(`open          = ${row.open}`);
      info(`netChange     = ${row.netChange}`);
      info(`percentChange = ${row.percentChange}`);

      if (!row.close || row.close === 0) {
        fail('row.close is 0 or missing — this explains a wrong day-change number.');
        info('Possible alt fields seen in response: ' + Object.keys(row).filter((k) => k.toLowerCase().includes('close')).join(', '));
      } else if (row.ltp && row.close) {
        const calcChange = row.ltp - row.close;
        const calcPct = (calcChange / row.close) * 100;
        info(`calc change   = ${calcChange.toFixed(2)}  (${calcPct.toFixed(2)}%)`);
        info(`Compare to Groww. If these match, REST prevClose is correct.`);
      }
    }
  } catch (err) {
    fail('getFullQuote threw', err);
  }

  // ──────────────────────────────────────────────────────────────────
  stage(3, 'WebSocket connect');
  // ──────────────────────────────────────────────────────────────────
  const jwt = smartApi.getJwtToken();
  const feed = smartApi.getFeedToken();
  if (!jwt || !feed) {
    fail('Missing jwt/feed token — cannot attempt WebSocket. Aborting.');
    process.exit(1);
  }

  let ws: WebSocketV2;
  try {
    ws = new WebSocketV2({
      clientcode: env.SMARTAPI_CLIENT_CODE,
      jwttoken: jwt,
      apikey: env.SMARTAPI_API_KEY,
      feedtype: feed,
    });
    ok('WebSocketV2 instance created');
  } catch (err) {
    fail('WebSocketV2 constructor threw', err);
    process.exit(1);
  }

  // Log every tick we receive (with limits to avoid flooding).
  let tickCount = 0;
  const tickSamples: unknown[] = [];
  ws.on('tick', (frame: unknown) => {
    tickCount++;
    if (tickSamples.length < 3) {
      tickSamples.push(frame);
    }
    // Throttle per-tick logging after the first few.
    if (tickCount <= 3 || tickCount % 10 === 0) {
      const t = frame as Record<string, unknown>;
      const tokenField = t?.token;
      const ltp = t?.last_traded_price;
      const close = t?.close_price;
      console.log(
        `  • tick#${tickCount} token=${JSON.stringify(tokenField)} ltp=${ltp} close=${close} mode=${t?.subscription_mode}`
      );
    }
  });

  try {
    const t0 = Date.now();
    await ws.connect();
    const elapsed = Date.now() - t0;
    ok(`ws.connect() resolved in ${elapsed}ms`);
  } catch (err) {
    fail('ws.connect() rejected', err);
    process.exit(1);
  }

  // ──────────────────────────────────────────────────────────────────
  stage(4, `Subscribe (Quote mode) and receive ticks for ${SUBSCRIBE_DURATION_MS / 1000}s`);
  // ──────────────────────────────────────────────────────────────────
  const subscribeReq = {
    correlationID: `diag-${Date.now()}`,
    action: 1 as const, // SUBSCRIBE
    mode: 2 as const, // QUOTE
    exchangeType: EXCHANGE_CODE,
    tokens: [TOKEN],
  };
  info('subscribe request: ' + JSON.stringify(subscribeReq));

  try {
    ws.fetchData(subscribeReq);
    ok('ws.fetchData() returned (subscribe sent)');
  } catch (err) {
    fail('ws.fetchData() threw', err);
  }

  // Wait and measure.
  const startTicks = tickCount;
  const startTime = Date.now();
  await new Promise<void>((resolve) => {
    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      console.log(`  ⋯ ${elapsed}s elapsed, ticks received: ${tickCount - startTicks}`);
    }, 5000);
    setTimeout(() => {
      clearInterval(interval);
      resolve();
    }, SUBSCRIBE_DURATION_MS);
  });

  const received = tickCount - startTicks;
  ok(`Subscribe window closed. Received ${received} ticks in ${SUBSCRIBE_DURATION_MS / 1000}s.`);

  if (tickSamples.length > 0) {
    console.log('\n  First tick samples (raw shape):');
    tickSamples.forEach((sample, i) => {
      console.log(`  ── sample ${i + 1} ──`);
      console.log('    ' + JSON.stringify(sample, null, 2).replace(/\n/g, '\n    '));
    });
  } else {
    fail('No tick samples captured. Possible causes:');
    info('  - Angel feed not active (outside market hours + session just opened)');
    info('  - Subscription message rejected by Angel');
    info('  - Token invalid for this exchange');
    info('  - Feed license missing on your Angel account');
  }

  // ──────────────────────────────────────────────────────────────────
  stage(5, 'Cleanup');
  // ──────────────────────────────────────────────────────────────────
  try {
    ws.close();
    ok('ws.close() called');
  } catch (err) {
    fail('ws.close() threw', err);
  }

  console.log('\nDiagnostic complete. Share the entire output above.');
  // Exit explicitly because the ws library keeps timers alive.
  setTimeout(() => process.exit(0), 500).unref();
}

main().catch((err) => {
  console.error('\nUnhandled error at top level:', err);
  process.exit(1);
});
