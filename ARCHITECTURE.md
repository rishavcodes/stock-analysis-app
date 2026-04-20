# Stock Analysis App — Architecture & Flow Documentation

This document describes how the application ingests data, scores Indian (NSE) equities, and generates AI-driven analysis reports. It is written for engineers who need to understand or modify the pipeline end-to-end.

---

## 1. High-Level Overview

The app is a full-stack screener + AI analyst for NSE equities. It does three jobs:

1. **Ingest** raw market data (price candles, fundamentals) from Angel One SmartAPI and Yahoo Finance.
2. **Compute** technical indicators and a 0–100 composite score for every active stock.
3. **Generate** an on-demand AI recommendation (BUY / WATCH / AVOID) for any stock by sending its full context to Claude Sonnet 4.6.

### Tech Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Express + TypeScript |
| Frontend | Next.js 16 + React 19 + Tailwind CSS |
| Database | MongoDB (Mongoose ODM) |
| AI | Anthropic Claude (`claude-sonnet-4-6`) via `@anthropic-ai/sdk` |
| Scheduling | `node-cron` |
| State (FE) | Zustand |
| HTTP (FE) | Axios |
| Validation | Zod |

### External Data Providers

| Provider | Used For | Auth |
|---|---|---|
| Angel One SmartAPI | Instrument master, OHLCV candles, LTP | TOTP-based session (12 h) |
| Yahoo Finance (unofficial) | Company fundamentals (PE, ROE, D/E, etc.) | Cookie + crumb (~1 h) |
| Anthropic Claude | AI recommendation generation | API key |

### Repository Layout

```
backend/
  src/
    app.ts                       # Express bootstrap
    config/
      constants.ts               # Score weights, market hours, index tokens, cache TTLs
      env.ts                     # Zod-validated env loader
      database.ts                # Mongo connection
      sector-map.ts              # Symbol → sector mapping
    jobs/
      scheduler.ts               # node-cron registration
      fetch-candles.job.ts
      compute-metrics.job.ts
      fetch-fundamentals.job.ts
      check-alerts.job.ts
    middleware/
      rate-limiter.ts            # express-rate-limit instances
      error-handler.ts
      validate.ts
    models/                      # Mongoose schemas
      Stock.ts, StockMetric.ts, Candle.ts,
      AnalysisLog.ts, SectorData.ts, Portfolio.ts,
      Alert.ts, User.ts
    routes/
      stock.routes.ts            # /api/stocks/*  (incl. AI analysis)
      market.routes.ts, portfolio.routes.ts, alert.routes.ts
    services/
      smartapi.service.ts        # Angel One client (TOTP, throttled)
      yahoo-finance.service.ts   # Yahoo fundamentals client
      market-data.service.ts     # Orchestrates candles, fundamentals, metrics
      indicator.service.ts       # SMA / EMA / RSI / MACD / BB / breakout
      scoring.service.ts         # 4 sub-scores + final weighted score
      ai-analysis.service.ts     # Claude integration
      alert.service.ts, portfolio.service.ts
    types/
      analysis.types.ts          # Zod schema for Claude output
      market.types.ts, api.types.ts
    utils/
      market-hours.ts, logger.ts
frontend/
  src/
    app/                         # Next.js routes (dashboard, stock detail, screener, alerts, portfolio)
    components/stock/AIAnalysis.tsx
    stores/stock.store.ts        # Zustand
    lib/api.ts                   # Axios instance
```

### Required Environment Variables

Defined in [backend/src/config/env.ts](backend/src/config/env.ts):

| Var | Purpose |
|---|---|
| `MONGODB_URI` | MongoDB Atlas connection |
| `SMARTAPI_API_KEY` | Angel One app key |
| `SMARTAPI_CLIENT_CODE` | Angel One client ID |
| `SMARTAPI_PASSWORD` | Angel One login password |
| `SMARTAPI_TOTP_SECRET` | Seed for time-based OTP |
| `ALPHA_VANTAGE_API_KEY` | Reserved (current fundamentals come from Yahoo) |
| `ANTHROPIC_API_KEY` | Claude API key |
| `PORT`, `NODE_ENV` | Server config |

---

## 2. The Data Pipeline (Scoring Flow)

The scoring pipeline runs as a chain of scheduled jobs. Each stock ends up with one `StockMetric` document per trading day containing all indicators, fundamentals, and a final 0–100 score.

### 2.1 Scheduled Jobs

Registered in [backend/src/jobs/scheduler.ts](backend/src/jobs/scheduler.ts):

| Job | Cron (UTC) | IST Time | What It Does |
|---|---|---|---|
| Fetch fundamentals | `30 0 * * 1-5` | 06:00 weekdays | Pulls 30 stocks per run from Yahoo Finance |
| Fetch daily candles | `30 10 * * 1-5` | 16:00 weekdays | Pulls last 365 days of daily OHLCV from SmartAPI |
| Compute metrics | `0 11 * * 1-5` | 16:30 weekdays | Computes indicators, sub-scores, final score, sector aggregates |
| Check alerts | `* * * * *` | every minute | Evaluates active alerts, but only when market is open |

### 2.2 Step 1 — Instrument Master Sync

[backend/src/services/market-data.service.ts:36-71](backend/src/services/market-data.service.ts#L36-L71) — `syncInstrumentMaster()`

- Downloads the public file from Angel One: `https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json`.
- Filters to NSE / EQ segment.
- Strips the `-EQ` suffix from each symbol.
- Maps symbol → sector via [backend/src/config/sector-map.ts](backend/src/config/sector-map.ts).
- Upserts into the `Stock` collection (token, name, exchange, sector, ISIN, lot size).

### 2.3 Step 2 — Daily Candle Fetch

[backend/src/services/market-data.service.ts:73-141](backend/src/services/market-data.service.ts#L73-L141) — `fetchAllDailyCandles()`

- For every active stock, calls SmartAPI `getCandleData()` with:
  - `interval: ONE_DAY`
  - `fromDate / toDate`: trailing 365 days (DD-MM-YYYY)
- **Resume support**: skips any stock whose latest stored candle is ≥ 2 days old check.
- Throttles requests via a single-concurrency p-queue (effectively ~1 req/sec) to stay under SmartAPI rate limits.
- Persists rows into the `Candle` collection with a unique compound index `(stockToken, interval, timestamp)`.

### 2.4 Step 3 — Fundamentals Fetch (Yahoo Finance)

[backend/src/services/market-data.service.ts:240-304](backend/src/services/market-data.service.ts#L240-L304) — `fetchFundamentalsBatch(batchSize=30)`
[backend/src/services/yahoo-finance.service.ts:62-126](backend/src/services/yahoo-finance.service.ts#L62-L126) — `getCompanyFundamentals()`

- Endpoint: `https://query2.finance.yahoo.com/v10/finance/quoteSummary/{SYMBOL}.NS`
- Modules requested: `defaultKeyStatistics`, `financialData`, `summaryDetail`.
- Auth: bootstraps a cookie + crumb (refreshed every ~55 min).
- Extracts: PE, Forward PE, ROE, ROCE (proxied via ROA), D/E, Revenue Growth YoY, Profit Growth YoY, Profit Margin, Market Cap, Book Value, Dividend Yield, Promoter Holding.
- Batched at 30 stocks per cron run, with a 500 ms delay between requests, so the full universe is rotated through every few days.
- Cache TTL: **7 days** (`ALPHA_VANTAGE.CACHE_DAYS`).
- Writes back to the latest `StockMetric` row, only touching fundamental fields and bumping `fundamentalsUpdatedAt`.

### 2.5 Step 4 — Indicator Computation

[backend/src/services/indicator.service.ts:162-199](backend/src/services/indicator.service.ts#L162-L199) — `computeAll()` is the entry point invoked once per stock; it returns the bundle below.

| Indicator | Periods | File:Lines |
|---|---|---|
| SMA | 20, 50, 200 | [indicator.service.ts:4-16](backend/src/services/indicator.service.ts#L4-L16) |
| EMA | 20 | [indicator.service.ts:18-39](backend/src/services/indicator.service.ts#L18-L39) |
| RSI | 14 (Wilder smoothing) | [indicator.service.ts:41-72](backend/src/services/indicator.service.ts#L41-L72) |
| MACD | 12 / 26 / 9 | [indicator.service.ts:74-84](backend/src/services/indicator.service.ts#L74-L84) |
| Bollinger Bands | 20, 2σ | [indicator.service.ts:86-112](backend/src/services/indicator.service.ts#L86-L112) |
| Volume avg + ratio | 20-day | [indicator.service.ts:114-121](backend/src/services/indicator.service.ts#L114-L121) |
| Breakout | 20-day high + 1.5× avg vol | [indicator.service.ts:123-148](backend/src/services/indicator.service.ts#L123-L148) |
| Trend classification | UP / DOWN / SIDEWAYS | [indicator.service.ts:150-160](backend/src/services/indicator.service.ts#L150-L160) |

A breakout flag fires when:
- **Price breakout**: `close > max(high of last 20 days)`, OR
- **Volume spike**: `currentVolume > 1.5 × avgVolume20`.

Trend is **UP** only when `price > sma20 > sma50 > sma200`, **DOWN** when the inverse holds, otherwise **SIDEWAYS**.

### 2.6 Step 5 — Scoring

All scoring logic is in [backend/src/services/scoring.service.ts](backend/src/services/scoring.service.ts). Each sub-score is independently bounded to 0–100, then combined via fixed weights in [backend/src/config/constants.ts:31-36](backend/src/config/constants.ts#L31-L36):

```
MARKET:      20%
SECTOR:      20%
FUNDAMENTAL: 30%
TECHNICAL:   30%
```

#### 2.6.1 Fundamental Score — `computeFundamentalScore()` ([scoring.service.ts:6-64](backend/src/services/scoring.service.ts#L6-L64))

Each of five factors contributes up to **20 points**, then total is normalized to 0–100. Default 50 if no data exists.

| Factor | 20 pts | 15 pts | 10 pts | 5 pts | 2 pts |
|---|---|---|---|---|---|
| **PE** | ≤ 15 | ≤ 25 | ≤ 40 | > 40 | — |
| **ROE %** | ≥ 20 | ≥ 15 | ≥ 10 | else | — |
| **D/E** | ≤ 0.5 | ≤ 1.0 | ≤ 2.0 | > 2.0 | — |
| **Revenue Growth YoY %** | ≥ 15 | ≥ 10 | ≥ 5 | ≥ 0 | < 0 |
| **Profit Margin %** | ≥ 20 | ≥ 15 | ≥ 10 | ≥ 5 | else |

Normalization: `(sum / (factorCount × 20)) × 100`.

#### 2.6.2 Technical Score — `computeTechnicalScore()` ([scoring.service.ts:66-120](backend/src/services/scoring.service.ts#L66-L120))

Four factors, each capped at **25 pts** (total 100).

**MA Alignment**
| Condition | Pts |
|---|---|
| `price > sma20 > sma50 > sma200` | 25 |
| `price > sma50 > sma200` | 20 |
| `price > sma200` | 12 |
| `price > sma50` | 8 |
| else | 3 |

**RSI (14)**
| Range | Interpretation | Pts |
|---|---|---|
| 50–70 | Bullish, not overbought | 25 |
| 40–50 | Neutral-bullish | 15 |
| 70–80 | Overbought caution | 12 |
| 30–40 | Oversold bounce setup | 10 |
| < 30 | Deeply oversold | 8 |
| > 80 | Extreme overbought | 5 |

**MACD**
| Condition | Pts |
|---|---|
| `line > signal` AND `histogram > 0` | 25 |
| `line > signal`, weakening | 18 |
| `histogram > 0` | 12 |
| else (bearish) | 5 |

**Volume Ratio (current / avg-20)**
| Ratio | Pts |
|---|---|
| > 2.0× | 25 |
| > 1.5× | 20 |
| > 1.0× | 15 |
| > 0.8× | 10 |
| else | 5 |

#### 2.6.3 Market Score — `computeMarketScore()` ([scoring.service.ts:122-169](backend/src/services/scoring.service.ts#L122-L169))

Computed **once per day** from Nifty 50 candles (last 200 days). All stocks share the same market score for the day.

| Factor | Conditions | Max |
|---|---|---|
| Price vs MAs | `price > sma50 > sma200` → 40, `> sma200` → 25, else 10 | 40 |
| Higher highs | max-of-last-10 < max-of-prior-10 → 20, else 8 | 20 |
| Volatility (stdDev daily %) | < 1% → 20, < 1.5% → 15, < 2% → 10, else 5 | 20 |
| 20-day momentum | > 5% → 20, > 2% → 15, > 0% → 10, else 3 | 20 |

#### 2.6.4 Sector Score — `computeSectorScore()` ([scoring.service.ts:171-200](backend/src/services/scoring.service.ts#L171-L200))

Computed per sector via [market-data.service.ts:401-460](backend/src/services/market-data.service.ts#L401-L460) — `computeSectorData()`. Stored in the `SectorData` collection.

| Component | Weight | Formula |
|---|---|---|
| Avg technical score of sector members | 50% | `mean(technicalScore) × 0.5` |
| Advance/decline ratio | 30% | `(advances / (advances + declines)) × 30` |
| Sector momentum | 20% | avgChange > 3% → 20, > 1% → 15, > 0% → 10, else 5 |

#### 2.6.5 Final Score — `computeFinalScore()` ([scoring.service.ts:202-215](backend/src/services/scoring.service.ts#L202-L215))

```
finalScore = round(
  marketScore       × 0.20 +
  sectorScore       × 0.20 +
  fundamentalScore  × 0.30 +
  technicalScore    × 0.30
)
```

### 2.7 Persistence — `StockMetric`

[backend/src/models/StockMetric.ts](backend/src/models/StockMetric.ts)

Single doc per `(symbol, date)` (compound unique index). Holds **everything** relevant to that day:

- **Fundamentals**: pe, roe, roce, debtToEquity, revenueGrowthYoY, profitGrowthYoY, profitMargin, marketCap, bookValue, dividendYield, promoterHolding.
- **Technicals**: sma20/50/200, ema20, rsi14, macdLine/Signal/Histogram, bollingerUpper/Lower, avgVolume20, volumeRatio.
- **Scores**: fundamentalScore, technicalScore, sectorScore, marketScore, finalScore (each validated 0–100).
- **Signals**: isBreakout, breakoutType (`PRICE` | `VOLUME` | null), trendDirection.
- **Metadata**: `fundamentalsUpdatedAt` (so the metrics job can preserve fundamentals across daily recomputes).

A secondary index on `{ finalScore: -1 }` powers the screener's "top scoring stocks" sort.

### 2.8 Step 6 — Metrics Computation Orchestration

[backend/src/services/market-data.service.ts:143-238](backend/src/services/market-data.service.ts#L143-L238) — `computeAllMetrics()`

The scheduled job runs this once per weekday at 16:30 IST:

1. Fetch Nifty 50 candles (200 days) and compute the **market score** once.
2. For every active `Stock`:
   1. Pull last 200 candles (require ≥ 50 to proceed).
   2. Run `IndicatorService.computeAll()`.
   3. Look up the previous `StockMetric` to inherit fundamentals (defaulting fundamental score to 50 if none exist yet).
   4. Look up the latest `SectorData` for sector score.
   5. Compute `technicalScore`, `fundamentalScore`, `finalScore`.
   6. Upsert `StockMetric` for today's date — preserving the last fundamental fields rather than nulling them.

### 2.9 Reading the Scores Out — Screener Endpoint

[backend/src/routes/stock.routes.ts:18-84](backend/src/routes/stock.routes.ts#L18-L84) — `GET /api/stocks/screener`

Aggregation pipeline:
1. Group `StockMetric` by symbol, take the latest doc.
2. `$lookup` into `Stock` for name/sector metadata.
3. Apply filters: `sector`, `finalScore` range, `breakoutOnly`.
4. Sort by `finalScore` desc (or any field requested).
5. Paginate (default 20/page).

---

## 3. The "Generate AI Analysis" Flow

When a user clicks **Generate AI Analysis** on a stock detail page, the app collects every piece of data it has on that stock, sends it to Claude, parses the response into a structured recommendation, caches it, and renders it.

### 3.1 Click Path Overview

```
[user click] AIAnalysis.tsx button
   ↓
stockStore.triggerAnalysis(symbol, force)
   ↓
GET /api/stocks/:symbol/analysis?force=...
   ↓ (analysisLimiter middleware: 10 req / 5 min)
stock.routes.ts handler
   ↓
AIAnalysisService.analyzeStock(symbol, force)
   ├─ getCachedAnalysis() ── HIT? return cached
   ├─ buildInput(symbol)   ── pulls Stock + StockMetric + Candles + SectorData + Nifty
   ├─ anthropic.messages.create({ model: claude-sonnet-4-6, ... })
   ├─ parse + Zod-validate JSON (fallback to WATCH/50 if no JSON)
   └─ AnalysisLog.create({ ..., expiresAt })
   ↓
res.json({ success: true, data: analysisLog })
   ↓
stockStore returns → setCurrentAnalysis() → render in AIAnalysis.tsx
```

### 3.2 Frontend Trigger

[frontend/src/components/stock/AIAnalysis.tsx:19-24](frontend/src/components/stock/AIAnalysis.tsx#L19-L24)

```tsx
const handleAnalyze = async (force = false) => {
  setLoading(true);
  const result = await triggerAnalysis(symbol, force);
  if (result) setCurrentAnalysis(result);
  setLoading(false);
};
```

The button text is **"Generate AI Analysis"** when no cached analysis exists, and **"Refresh"** (which sets `force=true`) when one is already on screen.

### 3.3 Frontend Store + Axios Call

[frontend/src/stores/stock.store.ts:49-60](frontend/src/stores/stock.store.ts#L49-L60)

```ts
triggerAnalysis: async (symbol, force = false) => {
  const { data } = await api.get(`/stocks/${symbol}/analysis`, {
    params: { force: force.toString() },
    timeout: 120000,   // 2 min — overrides the 30s axios default
  });
  return data.data;
}
```

The 30 s default in [frontend/src/lib/api.ts](frontend/src/lib/api.ts) is overridden here because Claude responses with 4096 max-tokens routinely take 30–60 seconds.

### 3.4 Backend Route + Rate Limit

[backend/src/routes/stock.routes.ts:147-157](backend/src/routes/stock.routes.ts#L147-L157)

```ts
router.get('/:symbol/analysis', analysisLimiter, async (req, res, next) => {
  const symbol = (req.params.symbol as string).toUpperCase();
  const force = req.query.force === 'true';
  const analysis = await aiService.analyzeStock(symbol, force);
  res.json({ success: true, data: analysis });
});
```

`analysisLimiter` ([middleware/rate-limiter.ts:11-17](backend/src/middleware/rate-limiter.ts#L11-L17)) caps at **10 requests per 5-minute window** per IP and returns HTTP 429 on overflow. This keeps Claude spend bounded if a user spams refresh.

### 3.5 Cache Lookup

[backend/src/services/ai-analysis.service.ts:37-45](backend/src/services/ai-analysis.service.ts#L37-L45)

```ts
private async getCachedAnalysis(symbol: string) {
  return AnalysisLog.findOne({
    symbol,
    expiresAt: { $gt: new Date() },
  })
    .sort({ analysisDate: -1 })
    .lean();
}
```

Cache TTL depends on whether the market is open ([constants.ts:69-72](backend/src/config/constants.ts#L69-L72)):

| Condition | TTL |
|---|---|
| Market open (09:15–15:30 IST) | **4 hours** |
| After hours / weekends | **24 hours** |

`force=true` skips the cache. The `AnalysisLog` collection has a MongoDB TTL index on `expiresAt` so expired docs are removed automatically.

### 3.6 Building the Input — `buildInput()`

[backend/src/services/ai-analysis.service.ts:48-117](backend/src/services/ai-analysis.service.ts#L48-L117)

A single `Promise.all` parallelizes four reads:

| Source | Query | Notes |
|---|---|---|
| `StockMetric` (latest) | `findOne({symbol}).sort(date:-1)` | Throws 400 if missing — metrics job must have run |
| `Candle` for stock | last **60 days**, `ONE_DAY` interval | Sliced to last **30 days** before sending to Claude |
| `SectorData` (latest) | latest doc for the stock's sector | Used to compute `sectorStrength` string |
| `Candle` for Nifty 50 | last **5 days**, by `INDEX_TOKENS.NIFTY_50` | Used to derive `niftyTrend` (`Bullish` / `Bearish`) |

The resulting `StockAnalysisInput` ([types/analysis.types.ts](backend/src/types/analysis.types.ts)) bundles:

- **Identity**: `symbol`, `name`, `sector`, `currentPrice`.
- **priceData**: array of 30 daily OHLCV objects with ISO date strings.
- **indicators**: SMAs, RSI, MACD bundle, Bollinger bands, avg-20 volume, volume ratio.
- **fundamentals**: PE, ROE, D/E, revenue growth YoY, profit margin, market cap.
- **scores**: all four sub-scores plus `finalScore`.
- **marketContext**: `niftyTrend` and `sectorStrength` (string like `"IT: Score 72/100"`).

### 3.7 Calling Claude

[backend/src/services/ai-analysis.service.ts:133-143](backend/src/services/ai-analysis.service.ts#L133-L143)

```ts
const response = await this.client.messages.create({
  model: 'claude-sonnet-4-6',
  max_tokens: 4096,
  system: SYSTEM_PROMPT,
  messages: [{
    role: 'user',
    content: `Analyze the following Indian stock for short-term (2-6 months) investing potential:\n\n${JSON.stringify(input, null, 2)}`,
  }],
});
```

#### System Prompt (verbatim, [ai-analysis.service.ts:15-28](backend/src/services/ai-analysis.service.ts#L15-L28))

> You are an expert Indian equity research analyst specializing in short-term investing (2-6 month horizon).
>
> You will receive structured data about a stock including price history, technical indicators, fundamental metrics, and market context. Analyze all inputs to generate an actionable recommendation.
>
> Guidelines:
> - **BUY**: Strong technicals + supportive fundamentals + favorable market/sector. Confidence > 60.
> - **WATCH**: Mixed signals or neutral setup. Wait for confirmation. Confidence 40-60.
> - **AVOID**: Weak technicals, deteriorating fundamentals, or bearish market. Confidence reflects risk.
> - Consider the Indian market context (NSE, regulatory environment, FII/DII activity patterns).
> - For short-term (2-6 months), weight technicals more heavily but don't ignore fundamentals.
> - Entry price should be near support or breakout level.
> - Stop-loss should be below key support (typically 5-8% below entry).
> - Target should be at resistance or based on risk-reward ratio of at least 2:1.
> - Be specific and quantitative in your reasoning.

### 3.8 Parsing Claude's Response

[backend/src/services/ai-analysis.service.ts:145-183](backend/src/services/ai-analysis.service.ts#L145-L183)

1. Pick the first `text` block from `response.content`. Throw if none.
2. Regex out the first `{...}` substring and `JSON.parse` it.
3. Validate against the Zod schema:

```ts
// backend/src/types/analysis.types.ts
AnalysisOutputSchema = z.object({
  recommendation: z.enum(['BUY', 'AVOID', 'WATCH']),
  confidence:    z.number().min(0).max(100),
  summary:       z.string(),
  bullishFactors: z.array(z.string()),
  bearishFactors: z.array(z.string()),
  entryPrice:    z.number().nullable(),
  targetPrice:   z.number().nullable(),
  stopLoss:      z.number().nullable(),
  timeHorizon:   z.enum(['SHORT_TERM', 'MEDIUM_TERM', 'LONG_TERM']),
});
```

4. **Fallback**: if JSON extraction or Zod validation fails, the service still returns a usable record:

```
recommendation: 'WATCH'
confidence:     50
summary:        first 500 chars of Claude's text
bullish/bearish: []
prices:         null
```

This guarantees the UI never breaks on a malformed AI response.

### 3.9 Persisting the Result — `AnalysisLog`

[backend/src/services/ai-analysis.service.ts:189-204](backend/src/services/ai-analysis.service.ts#L189-L204)

```ts
const analysisLog = await AnalysisLog.create({
  symbol,
  analysisDate: new Date(),
  recommendation, confidence, summary,
  bullishFactors, bearishFactors,
  entryPrice, targetPrice, stopLoss,
  timeHorizon,
  inputData: input,            // full audit trail of what we sent
  modelUsed: 'claude-sonnet-4-6',
  expiresAt: new Date(Date.now() + cacheDuration),
});
```

`inputData` stores the entire `StockAnalysisInput` so future debugging can see exactly what context produced a given recommendation. The TTL index on `expiresAt` ([models/AnalysisLog.ts:41](backend/src/models/AnalysisLog.ts#L41)) auto-purges old rows.

### 3.10 Rendering in the UI

[frontend/src/components/stock/AIAnalysis.tsx](frontend/src/components/stock/AIAnalysis.tsx)

States:

| State | UI |
|---|---|
| Loading | Spinner + "Analyzing with Claude AI…" |
| No analysis yet | "Generate AI Analysis" button |
| Analysis present | Recommendation badge (BUY=green, WATCH=yellow, AVOID=red), confidence %, time horizon, summary, Entry/Target/Stop-Loss grid (when present), bullish/bearish factor lists, analysis date, **Refresh** button (`force=true`) |

Color/format helpers live in [frontend/src/lib/format.ts](frontend/src/lib/format.ts) (`getRecommendationColor`, `formatINR`, `formatDate`).

---

## 4. Key Cross-Cutting Concerns

### 4.1 Market Hours

[backend/src/utils/market-hours.ts](backend/src/utils/market-hours.ts) exposes `isMarketOpen()`. NSE hours are 09:15–15:30 IST, configured in [constants.ts:14-19](backend/src/config/constants.ts#L14-L19). This gates:
- AI cache TTL (4 h vs 24 h).
- The per-minute alert checker (no-op outside market hours).

### 4.2 Rate Limits & Throttling

| Surface | Limit | Source |
|---|---|---|
| Public API (default) | `apiLimiter` | [middleware/rate-limiter.ts](backend/src/middleware/rate-limiter.ts) |
| AI analysis | 10 / 5 min per IP | `analysisLimiter` |
| SmartAPI client | ~1 req/sec via p-queue | [smartapi.service.ts:18-19](backend/src/services/smartapi.service.ts#L18-L19) |
| Yahoo Finance | 500 ms between requests | [market-data.service.ts:297](backend/src/services/market-data.service.ts#L297) |

### 4.3 Error Handling

- `AppError` (custom) → `error-handler` middleware translates to JSON `{ success: false, error }`.
- Frontend axios interceptor ([lib/api.ts:12-19](frontend/src/lib/api.ts#L12-L19)) unwraps `error.response.data.error` and rejects with a clean `Error`.

### 4.4 Caching Summary

| What | Where | TTL |
|---|---|---|
| AI analysis | `AnalysisLog.expiresAt` (TTL index) | 4 h (market open) / 24 h (closed) |
| Fundamentals freshness | `StockMetric.fundamentalsUpdatedAt` | 7 days (re-fetch threshold) |
| SmartAPI session | in-memory | 12 h |
| Yahoo crumb/cookie | in-memory | ~55 min |

---

## 5. Quick Reference — Where to Look When…

| Task | File |
|---|---|
| Change scoring weights | [backend/src/config/constants.ts:31-36](backend/src/config/constants.ts#L31-L36) |
| Add a new technical indicator | [backend/src/services/indicator.service.ts](backend/src/services/indicator.service.ts) + extend `StockMetric` schema |
| Tune the Claude system prompt | [backend/src/services/ai-analysis.service.ts:15-28](backend/src/services/ai-analysis.service.ts#L15-L28) |
| Switch Claude model | [backend/src/services/ai-analysis.service.ts:134](backend/src/services/ai-analysis.service.ts#L134) and `:202` |
| Adjust AI cache TTL | [backend/src/config/constants.ts:69-72](backend/src/config/constants.ts#L69-L72) |
| Change cron schedule | [backend/src/jobs/scheduler.ts](backend/src/jobs/scheduler.ts) |
| Add a new fundamentals provider | [backend/src/services/yahoo-finance.service.ts](backend/src/services/yahoo-finance.service.ts) (mirror its interface) |
| Modify AI output schema | [backend/src/types/analysis.types.ts](backend/src/types/analysis.types.ts) — both backend Zod and frontend `Analysis` type |
| Change frontend AI request timeout | [frontend/src/stores/stock.store.ts:49-60](frontend/src/stores/stock.store.ts#L49-L60) |

---

## 6. End-to-End Example: Scoring + Analysis for `RELIANCE`

1. **06:00 IST** — Fundamentals job picks `RELIANCE` in its batch of 30, fetches PE/ROE/D/E from Yahoo, updates the latest `StockMetric` row.
2. **16:00 IST** — Candle job pulls the latest 365 daily candles into the `Candle` collection.
3. **16:30 IST** — Metrics job:
   - Computes Nifty 50 market score (say **65**).
   - For RELIANCE: indicators → technical score **72**; fundamentals from yesterday → **80**; latest sector (`Energy`) → **60**.
   - `finalScore = round(65×0.20 + 60×0.20 + 80×0.30 + 72×0.30) = 70`.
   - Upserts the day's `StockMetric` for RELIANCE.
4. **User clicks "Generate AI Analysis" at 17:00 IST**.
   - Cache miss → `buildInput` reads StockMetric, last 30 candles, latest Energy SectorData, last 5 Nifty candles.
   - Claude returns: `{ recommendation: "BUY", confidence: 72, entryPrice: 2850, targetPrice: 3100, stopLoss: 2720, ... }`.
   - Stored in `AnalysisLog` with `expiresAt = now + 24 h` (market closed).
   - UI renders the green BUY badge and entry/target/stop grid.
5. **User clicks Refresh 30 min later** → cache HIT (24 h TTL still valid) → instant return, no Claude call.
6. **User clicks Refresh** explicitly with `force` → bypasses cache, calls Claude again, writes a new `AnalysisLog` row.
