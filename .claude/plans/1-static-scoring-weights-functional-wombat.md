# Refresh stale candle + metric data after offline gap

## Context

The user reported that for a stock, the live CMP is ₹12,111 but the SMA20/50/200
read ~₹8,082–₹8,614 — a ~40% gap that doesn't match what they'd expect.

**Diagnosis:** The math is correct. The SMAs reflect the candles in the DB,
which are 18 days behind today's date.

| Source | Latest date in DB | Today |
|---|---|---|
| `candles` (max timestamp) | 2026-04-16 | 2026-05-04 |
| `stock_metrics` (max date) | 2026-04-01 | 2026-05-04 |

The cron schedules in [backend/src/jobs/scheduler.ts](backend/src/jobs/scheduler.ts)
are in-process: `fetch-candles` runs at 4:00 PM IST and `compute-metrics` at
4:30 PM IST, but only while the Node.js process is alive. Between sessions
the dev server has been off, and the laptop's Docker daemon was also down
until just now. The scheduler missed every weekday tick during that gap.

The live LTP works because it's a direct broker call (`SmartAPIService.getLTP`)
that doesn't depend on the DB.

## Fix (one-time backfill)

Two HTTP POSTs to your already-running app, in order. Both already exist in
[backend/src/routes/market.routes.ts](backend/src/routes/market.routes.ts).

### Step 1 — backfill candles
```bash
curl -X POST http://localhost:3001/api/market/fetch-candles
```

Returns immediately ("Candle fetch started in background"). The actual work
runs via `MarketDataService.fetchAllDailyCandles()`
([market-data.service.ts:115-153](backend/src/services/market-data.service.ts#L115)).
Already idempotent — it skips stocks that already have a candle for the most
recent trading day, so only the 12 missed trading days for each stock get
fetched. Expect a few minutes (Angel rate-limits per token).

Watch the server logs for progress: `Candle fetch progress: <N> fetched, <M> skipped`.

### Step 2 — recompute metrics
Once the candle log says `Finished fetching daily candles: …`:

```bash
curl -X POST http://localhost:3001/api/market/compute-metrics
```

This runs `computeSectorData()` then `computeAllMetrics()`
([market-data.service.ts:155-256](backend/src/services/market-data.service.ts#L155))
which recomputes SMA / RSI / MACD / scores using the freshly-extended candle
series and upserts each row in `stock_metrics`. Returns when done (synchronous).

## Going forward

The crons in [scheduler.ts](backend/src/jobs/scheduler.ts) will keep things
fresh **as long as the dev server is up at 4–4:30 PM IST on weekdays**. If the
laptop is closed or the dev server isn't running at those times, the same
staleness recurs.

If you want zero-touch freshness when the laptop is off, the path forward is
deploying the backend to a small always-on host (Render / Fly.io / a tiny VPS).
That's out of scope for this fix — the manual backfill above unblocks the
immediate question.

## Critical files (read-only context)

- [backend/src/jobs/scheduler.ts](backend/src/jobs/scheduler.ts) — the in-process cron schedule
- [backend/src/services/market-data.service.ts](backend/src/services/market-data.service.ts) — `fetchAllDailyCandles`, `computeAllMetrics`
- [backend/src/routes/market.routes.ts](backend/src/routes/market.routes.ts) — the manual-trigger endpoints

## Verification

1. After step 1, check candle freshness:
   ```bash
   docker exec stockdb psql -U stockapp -d stockdb -c \
     "SELECT MAX(timestamp)::date FROM candles;"
   ```
   Expect today (or the most recent completed trading day if today is a holiday/weekend).

2. After step 2, check metric freshness:
   ```bash
   docker exec stockdb psql -U stockapp -d stockdb -c \
     "SELECT MAX(date)::date FROM stock_metrics;"
   ```
   Expect today.

3. Re-load the stock detail page. SMA20 should now be within a few percent
   of the current price for any stock that hasn't moved 40% in 20 days.
   The original ₹12,111 / ₹8,614 disparity should disappear.
