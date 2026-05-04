# MongoDB → PostgreSQL migration plan

> ## ✅ Migration complete
>
> All 7 phases shipped. The app now reads and writes to Postgres for every
> model except `AnalysisLog`, which stays in Mongo as designed.
>
> **What's in Postgres:** `Stock`, `Candle` (TimescaleDB hypertable),
> `StockMetric`, `SectorData`, `MarketState`, `Portfolio`, `Alert`, `User`,
> `BacktestRun`, `BacktestTrade`.
>
> **Where the code lives:**
> - Prisma schema → `backend/prisma/schema.prisma`
> - Repositories → `backend/src/repositories/*.repo.ts`
> - Shared types → `backend/src/types/backtest.types.ts`
>
> **Mongo collections that can be dropped now** (these are no longer read or
> written by the app — the data was ETL'd into Postgres). Run when you're
> confident Postgres is the source of truth:
>
> ```js
> // mongosh, against the cluster's database
> db.stocks.drop()
> db.candles.drop()
> db.stockmetrics.drop()
> db.sectordatas.drop()
> db.marketstates.drop()
> db.portfolios.drop()
> db.alerts.drop()
> db.users.drop()
> db.backtestruns.drop()
> db.backtesttrades.drop()
> ```
>
> Don't drop `analysislogs` — that one's still live.
>
> The phase-by-phase plans below are preserved as historical reference for
> how each model was migrated.

---

**Target architecture** (final state, after all phases):

| Storage | Data |
|---|---|
| **PostgreSQL** (Supabase + Prisma) | `Stock`, `Candle` (TimescaleDB hypertable), `StockMetric`, `SectorData`, `MarketState`, `Portfolio`, `Alert`, `User`, `BacktestRun`, `BacktestTrade` |
| **MongoDB** | `AnalysisLog` only — keeps the flexible `inputData` / `decisionTrace` JSON plus the partial TTL that expires only unevaluated rows |

**Why this split:** Relational data with well-known shapes, time-series volume, and critical integrity constraints (backtest trades referencing runs, portfolio referencing stocks) belong in Postgres. Claude's free-form analysis output + audit trail fits Mongo's document model better and already relies on Mongo's partial TTL.

**Migration style:** Phased, one model (or small cluster) at a time. After each phase the app is in a consistent state and fully tested — no multi-week half-built state. Mongoose stays installed until Phase 7 so un-migrated models continue to work.

> **Prerequisite:** Finish [POSTGRES_SETUP.md](./POSTGRES_SETUP.md) before starting Phase 1.

---

## Phase inventory at a glance

| Phase | Model(s) | Why this order | Est. complexity | Status |
|---|---|---|---|---|
| **0** | (setup — Prisma / Supabase / `.env` / dual connect) | Foundation. | ★ | ✅ Done |
| **1** | `Stock` | Master data, no time-series, nearly every other model references it. Best to get the pattern right here. | ★ | ✅ Done — 2,527 rows |
| **2** | `Candle` | The biggest table and the most interesting migration (TimescaleDB hypertable). | ★★★ | ✅ Done — 593,073 rows |
| **3** | `StockMetric` | Depends on `Stock`. Time-series with many fields incl. a JSON subdocument (`weightsUsed`). | ★★ | ✅ Done — 2,417 rows |
| **4** | `SectorData` + `MarketState` | Small time-series, few consumers. Quick win. | ★ | ✅ Done — 20 + 0 rows |
| **5** | `Portfolio` + `Alert` + `User` | Small relational models. Alert and Portfolio both reference `Stock`. | ★★ | ✅ Done — empty in Mongo |
| **6** | `BacktestRun` + `BacktestTrade` | Internal FK between them (trade.runId → run.id). Last because backtest is self-contained. | ★★ | ✅ Done — empty in Mongo |
| **7** | Cleanup | Remove Mongoose for all migrated models; keep only `AnalysisLog`. | ★ | ✅ Done |

**Rule per phase:**
1. Add the model(s) to `prisma/schema.prisma`.
2. `npx prisma migrate dev --name phase<N>-<description>`.
3. Write an ETL script under `backend/src/scripts/migrations/` that reads from Mongo and writes to Postgres. Idempotent, gated by an env flag.
4. Introduce a new repository layer in `backend/src/repositories/` that exposes the same method signatures the Mongoose model used. Switch one service at a time to the Postgres repo.
5. Run tests, smoke the app end-to-end.
6. Delete the Mongoose model only when zero code imports it. `grep -rn "from '.*/models/Stock'" src/` must return nothing.

---

## Phase 1 — `Stock` (master data)

### Prisma schema

```prisma
model Stock {
  id           Int      @id @default(autoincrement())
  symbol       String   @unique
  token        String   @unique
  name         String
  exchange     String   @default("NSE")
  segment      String   @default("EQ")
  sector       String   @default("Unknown")
  isin         String   @default("")
  lotSize      Int      @default(1)
  isIndex      Boolean  @default(false)
  isActive     Boolean  @default(true)
  lastUpdated  DateTime @default(now())
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@index([sector])
}
```

**Design notes for beginners:**
- Surrogate `id` (auto-increment int) + unique `symbol` / `token`. This is the Prisma idiom. Relations internally use `id`, but your queries can still `where: { symbol }`.
- `@default(now())` sets the value on insert; `@updatedAt` auto-updates on every write (no manual `updatedAt: new Date()` needed).
- `@@index` declares a non-unique index; `@unique` on a column also creates an index.

### Files to touch

- `backend/prisma/schema.prisma` — add the model.
- NEW `backend/src/scripts/migrations/01-migrate-stocks.ts` — reads `Stock` collection from Mongo, writes to Postgres via `prisma.stock.createMany({ data: [...], skipDuplicates: true })`.
- NEW `backend/src/repositories/stock.repo.ts` — thin wrapper exposing `findBySymbol`, `findByToken`, `findActive`, `listBySector`, `upsert`, `bulkUpsert`. Same return shapes as existing code expects.
- Refactor callers one file at a time to import from the repo:
  - `backend/src/services/market-data.service.ts`
  - `backend/src/services/portfolio.service.ts`
  - `backend/src/services/alert.service.ts`
  - `backend/src/services/prediction-evaluator.service.ts`
  - `backend/src/services/backtest.service.ts`
  - `backend/src/services/ai-analysis.service.ts`
  - `backend/src/routes/stock.routes.ts`
- Keep `backend/src/models/Stock.ts` on disk but stop importing it.

### Verification

```bash
cd backend
npx prisma migrate dev --name phase1-stock
MIGRATE_STOCKS=1 npx ts-node src/scripts/migrations/01-migrate-stocks.ts
npx prisma studio  # eyeball: Stock table has your ~2000 rows
npm run test
npm run dev        # hit /api/stocks/screener or /api/stocks/RELIANCE
```

Rollback: `git revert` the code changes. `prisma migrate resolve --rolled-back <migration-name>` to mark the migration reverted; the table stays but nothing reads from it.

---

## Phase 2 — `Candle` (TimescaleDB hypertable)

### Prisma schema

```prisma
model Candle {
  id         BigInt   @id @default(autoincrement())
  stockToken String
  interval   String
  timestamp  DateTime
  open       Decimal  @db.Decimal(14, 4)
  high       Decimal  @db.Decimal(14, 4)
  low        Decimal  @db.Decimal(14, 4)
  close      Decimal  @db.Decimal(14, 4)
  volume     BigInt
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([stockToken, interval, timestamp])
  @@index([stockToken, interval, timestamp(sort: Desc)])
}
```

**Design notes:**
- `BigInt id` because we'll have millions of rows — 32-bit overflows at ~2B.
- `Decimal(14,4)` for OHLC to avoid float rounding bugs in scoring math. 14 digits with 4 after the decimal handles prices up to 99,999,999.9999.
- Unique on `(stockToken, interval, timestamp)` mirrors the Mongoose compound unique.
- Extra descending-timestamp index because the app nearly always asks "latest N candles for this token".

### TimescaleDB hypertable

After `prisma migrate dev --name phase2-candle` generates the table, **add a follow-up raw SQL migration** to convert it to a hypertable:

```bash
# Create a new migration folder manually (Prisma supports custom SQL via this pattern)
mkdir -p backend/prisma/migrations/phase2b_candle_hypertable
```

Create `backend/prisma/migrations/phase2b_candle_hypertable/migration.sql`:

```sql
-- Convert the Candle table to a TimescaleDB hypertable partitioned by timestamp.
-- `migrate_data => true` moves the existing rows into the correct chunks.
-- `if_not_exists => true` makes this migration idempotent.
SELECT create_hypertable(
  '"Candle"',
  'timestamp',
  chunk_time_interval => INTERVAL '7 days',
  if_not_exists => true,
  migrate_data => true
);

-- Per-token + time index is what every lookup actually uses; create it on the
-- hypertable (TimescaleDB propagates it to each chunk).
CREATE INDEX IF NOT EXISTS "Candle_token_interval_timestamp_desc_idx"
  ON "Candle" ("stockToken", "interval", "timestamp" DESC);
```

Then apply: `npx prisma migrate dev --name phase2b-candle-hypertable --create-only` (edit the generated file to paste the SQL above) and `npx prisma migrate dev` again to apply.

> Note: Prisma itself doesn't know about hypertables, but everything still works because hypertables look like regular tables to the client. Just don't run `prisma db push` or Prisma will try to "fix" the structure.

### ETL script

- NEW `backend/src/scripts/migrations/02-migrate-candles.ts`:
  - Stream Mongo cursor (`Candle.find({}).cursor()`) in batches of 5,000.
  - Batch-insert via `prisma.candle.createMany({ data: batch, skipDuplicates: true })`.
  - Log progress every 100k rows.
  - Time the full migration — with 10M rows expect 30–60 min on a free-tier Supabase.
  - Gated by `MIGRATE_CANDLES=1` env flag. Idempotent due to `skipDuplicates`.

### Repo + service refactor

- NEW `backend/src/repositories/candle.repo.ts` — `findRange(token, interval, from, to)`, `findLatest(token, n)`, `bulkUpsert`, `distinctTokens`.
- Refactor `backend/src/services/market-data.service.ts`, `backend/src/services/ai-analysis.service.ts`, `backend/src/services/prediction-evaluator.service.ts`, `backend/src/services/backtest.service.ts`, `backend/src/routes/stock.routes.ts`, `backend/src/routes/market.routes.ts`, `backend/src/scripts/cleanup-weekend-candles.ts`.

### Verification

```bash
# Confirm hypertable chunks exist
psql "$DIRECT_URL" -c "SELECT count(*) FROM _timescaledb_catalog.chunk WHERE hypertable_id = (SELECT id FROM _timescaledb_catalog.hypertable WHERE table_name = 'Candle');"

# Benchmark a hot query: "last 365 days of RELIANCE daily candles"
psql "$DIRECT_URL" -c "EXPLAIN ANALYZE SELECT * FROM \"Candle\" WHERE \"stockToken\" = '2885' AND \"interval\" = 'ONE_DAY' ORDER BY \"timestamp\" DESC LIMIT 365;"
# Should use the per-token index and touch only a few chunks.

npm run test
npm run dev  # open /stock/RELIANCE; chart should render
```

---

## Phase 3 — `StockMetric`

### Prisma schema

```prisma
model StockMetric {
  id                        BigInt   @id @default(autoincrement())
  symbol                    String
  date                      DateTime
  // Fundamentals (nullable — not all stocks populated)
  pe                        Decimal? @db.Decimal(10, 4)
  roe                       Decimal? @db.Decimal(8, 6)
  roce                      Decimal? @db.Decimal(8, 6)
  debtToEquity              Decimal? @db.Decimal(10, 6)
  revenueGrowthYoY          Decimal? @db.Decimal(8, 6)
  profitGrowthYoY           Decimal? @db.Decimal(8, 6)
  profitMargin              Decimal? @db.Decimal(8, 6)
  marketCap                 BigInt?
  bookValue                 Decimal? @db.Decimal(14, 4)
  dividendYield             Decimal? @db.Decimal(8, 6)
  promoterHolding           Decimal? @db.Decimal(5, 4)
  quarterlyEpsGrowth        Json     @default("[]")      // number[]
  earningsConsistencyScore  Int?
  // Technicals
  sma20         Decimal @db.Decimal(14, 4) @default(0)
  sma50         Decimal @db.Decimal(14, 4) @default(0)
  sma200        Decimal @db.Decimal(14, 4) @default(0)
  ema20         Decimal @db.Decimal(14, 4) @default(0)
  rsi14         Decimal @db.Decimal(6, 2)  @default(50)
  macdLine      Decimal @db.Decimal(14, 6) @default(0)
  macdSignal    Decimal @db.Decimal(14, 6) @default(0)
  macdHistogram Decimal @db.Decimal(14, 6) @default(0)
  bollingerUpper Decimal @db.Decimal(14, 4) @default(0)
  bollingerLower Decimal @db.Decimal(14, 4) @default(0)
  avgVolume20   BigInt   @default(0)
  volumeRatio   Decimal  @db.Decimal(8, 4) @default(1)
  // Scores 0-100
  fundamentalScore Int @default(0)
  technicalScore   Int @default(0)
  sectorScore      Int @default(0)
  marketScore      Int @default(0)
  finalScore       Int @default(0)
  // Risk
  volatility20d     Decimal @db.Decimal(8, 6) @default(0)
  maxDrawdown90d    Decimal @db.Decimal(8, 6) @default(0)
  atr14             Decimal @db.Decimal(14, 4) @default(0)
  tradedValue20d    BigInt  @default(0)
  riskScore         Int     @default(0)
  adjustedFinalScore Int    @default(0)
  // Signals
  isBreakout      Boolean     @default(false)
  breakoutType    BreakoutType?
  trendDirection  TrendDirection @default(SIDEWAYS)
  // Regime / weights (Json keeps the subdocument shape)
  marketRegime    MarketRegime?
  weightsUsed     Json?           // { market, sector, fundamental, technical }
  // Metadata
  fundamentalsUpdatedAt DateTime?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([symbol, date])
  @@index([finalScore(sort: Desc)])
  @@index([adjustedFinalScore(sort: Desc)])
}

enum BreakoutType { PRICE  VOLUME }
enum TrendDirection { UP  DOWN  SIDEWAYS }
enum MarketRegime { BULLISH  BEARISH  SIDEWAYS }
```

**Design notes:**
- `Decimal` everywhere prices/ratios live. Float-based money math will bite you eventually.
- `Json` fields (`quarterlyEpsGrowth`, `weightsUsed`) are Postgres `jsonb` — flexible like Mongo subdocs but queryable.
- Enums replace the free-string MongoDB enums — Postgres enforces them at the DB level.

### Files to touch

- Schema + migration.
- NEW `backend/src/scripts/migrations/03-migrate-stock-metrics.ts`.
- NEW `backend/src/repositories/stock-metric.repo.ts`.
- Refactor: `market-data.service.ts` (big one — scoring pipeline), `scoring.service.ts` consumers, `stock.routes.ts` (screener aggregation — **rewrite Mongo `.aggregate()` pipeline to Prisma `.findMany({ where, orderBy, take })`**), `alert.service.ts`, `backtest.service.ts`, `portfolio.service.ts`, `ai-analysis.service.ts`.

### Screener aggregation migration

Current Mongo aggregation pipeline in `stock.routes.ts:18-84`:

```ts
StockMetric.aggregate([
  { $sort: { date: -1 } },
  { $group: { _id: '$symbol', doc: { $first: '$$ROOT' } } },
  ...
])
```

Prisma equivalent — simpler because the DB already has the uniqueness constraint:

```ts
// "Latest metric per symbol" = one row per symbol because we upsert daily.
// Sort by the requested column, filter, paginate.
const rows = await prisma.stockMetric.findMany({
  where: { date: { equals: latestDate }, sector, finalScore: { gte: minScore, lte: maxScore } },
  orderBy: { [sortBy]: sortOrder },
  skip: (page - 1) * limit,
  take: limit,
  include: { /* if we add a Stock relation later */ },
});
```

Handle the "latest date" via a `SELECT DISTINCT ON` query or a computed "last run date" cached in `MarketState`.

---

## Phase 4 — `SectorData` + `MarketState`

Low-cardinality time-series, small blast radius.

```prisma
model SectorData {
  id                Int      @id @default(autoincrement())
  sector            String
  date              DateTime
  avgChange         Decimal  @db.Decimal(8, 4) @default(0)
  topGainer         Json     @default("{}")    // { symbol, change }
  topLoser          Json     @default("{}")
  sectorScore       Int      @default(0)
  stockCount        Int      @default(0)
  advanceDecline    Json     @default("{}")    // { advances, declines }
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([sector, date])
}

model MarketState {
  id          Int          @id @default(autoincrement())
  date        DateTime     @unique
  rawRegime   MarketRegime
  regime      MarketRegime
  smoothed    Boolean      @default(false)
  niftyClose  Decimal      @db.Decimal(14, 4)
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt
}
```

(Reuse the `MarketRegime` enum from Phase 3.)

- ETL `04-migrate-sector-and-market-state.ts`.
- Repo + service refactor in `market-data.service.ts`.

---

## Phase 5 — `Portfolio` + `Alert` + `User`

```prisma
enum PortfolioStatus { ACTIVE  EXITED }
enum AlertType { PRICE_ABOVE  PRICE_BELOW  VOLUME_SPIKE  BREAKOUT  STOP_LOSS  TARGET_HIT  SCORE_CHANGE }
enum RiskTolerance { LOW  MEDIUM  HIGH }
enum InvestmentHorizon { SHORT  MEDIUM  LONG }

model Portfolio {
  id           Int              @id @default(autoincrement())
  symbol       String
  quantity     Int
  avgBuyPrice  Decimal          @db.Decimal(14, 4)
  buyDate      DateTime
  currentPrice Decimal          @db.Decimal(14, 4) @default(0)
  pnl          Decimal          @db.Decimal(16, 4) @default(0)
  pnlPercent   Decimal          @db.Decimal(10, 4) @default(0)
  stopLoss     Decimal?         @db.Decimal(14, 4)
  targetPrice  Decimal?         @db.Decimal(14, 4)
  notes        String           @default("")
  status       PortfolioStatus  @default(ACTIVE)
  exitPrice    Decimal?         @db.Decimal(14, 4)
  exitDate     DateTime?
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  @@index([symbol, status])
}

model Alert {
  id          Int       @id @default(autoincrement())
  symbol      String
  type        AlertType
  threshold   Decimal   @db.Decimal(14, 4)
  isActive    Boolean   @default(true)
  isTriggered Boolean   @default(false)
  triggeredAt DateTime?
  message     String    @default("")
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@index([isActive, symbol])
}

model User {
  id          Int      @id @default(autoincrement())
  name        String   @default("Default User")
  email       String   @default("")
  watchlist   String[] // Postgres native text[]
  preferences Json     @default("{\"riskTolerance\": \"MEDIUM\", \"investmentHorizon\": \"SHORT\"}")
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
}
```

- ETL `05-migrate-portfolio-alerts-users.ts`.
- Refactor `portfolio.service.ts`, `alert.service.ts`, `analytics.routes.ts`, `portfolio.routes.ts`, `alert.routes.ts`.

---

## Phase 6 — `BacktestRun` + `BacktestTrade`

```prisma
enum BacktestStatus { PENDING  RUNNING  DONE  FAILED }
enum BacktestExitRule { TECHNICAL  FIXED_HOLD  AI_RULES }
enum TradeExitReason { TARGET_HIT  STOP_LOSS_HIT  TECHNICAL_EXIT  TIME_EXPIRED }

model BacktestRun {
  id           Int             @id @default(autoincrement())
  config       Json            // full BacktestConfig subdocument
  status       BacktestStatus  @default(PENDING)
  startedAt    DateTime?
  completedAt  DateTime?
  results      Json?           // full BacktestResults incl. equityCurve
  error        String?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt
  trades       BacktestTrade[]

  @@index([status, startedAt(sort: Desc)])
}

model BacktestTrade {
  id           BigInt           @id @default(autoincrement())
  runId        Int
  run          BacktestRun      @relation(fields: [runId], references: [id], onDelete: Cascade)
  symbol       String
  sector       String
  entryDate    DateTime
  entryPrice   Decimal          @db.Decimal(14, 4)
  exitDate     DateTime
  exitPrice    Decimal          @db.Decimal(14, 4)
  returnPct    Decimal          @db.Decimal(10, 4)
  exitReason   TradeExitReason
  scoreAtEntry Int
  qty          Int
  createdAt    DateTime         @default(now())
  updatedAt    DateTime         @updatedAt

  @@index([runId, entryDate])
}
```

- This is the first **real relation** in the schema. `run BacktestRun @relation(...)` gives you `prisma.backtestRun.findUnique({ include: { trades: true } })` for free.
- `onDelete: Cascade` mirrors the "delete a run, delete its trades" semantics.

---

## Phase 7 — Cleanup

Once Phases 1–6 land and all tests pass:

1. `grep -rn "from '.*/models/Stock'" src/` — must be empty. Repeat for every migrated model.
2. Delete `backend/src/models/{Alert,BacktestRun,BacktestTrade,Candle,MarketState,Portfolio,SectorData,Stock,StockMetric,User}.ts`.
3. **Keep `backend/src/models/AnalysisLog.ts`.** It stays in Mongo.
4. In `backend/src/config/database.ts`, `connectMongo()` still runs for AnalysisLog only.
5. Run one last `npm run test` + `npx tsc --noEmit` + end-to-end smoke.
6. Delete the Mongo collections that have been fully migrated using `mongosh` (keep a backup first).

---

## Cross-DB reference policy (AnalysisLog ↔ Stock)

`AnalysisLog.symbol` in Mongo references `Stock.symbol` in Postgres. There's no FK enforcement possible across DBs. Policy:

- **Treat `symbol` as an opaque string** on both sides.
- In the AI analysis flow, always validate the symbol exists in Postgres *before* creating an `AnalysisLog`:
  ```ts
  const stock = await prisma.stock.findUnique({ where: { symbol } });
  if (!stock) throw new AppError(404, `Stock ${symbol} not found`);
  // ... then create AnalysisLog in Mongo.
  ```
- When displaying analysis history, join in app code: fetch `AnalysisLog[]` from Mongo, extract distinct symbols, `prisma.stock.findMany({ where: { symbol: { in: [...] } } })`, stitch together.

## Ops notes

- **Backups**: Supabase takes daily snapshots on free tier; export before each phase just in case.
- **Local dev**: you can run Postgres locally via Docker if Supabase latency hurts, but Prisma works against both identically.
- **Prisma client regeneration**: run `npx prisma generate` after every `git pull` if a teammate added a model. It updates `node_modules/@prisma/client` types.

---

## Current state

- ✅ Phase 0: infrastructure wired (Prisma installed, `schema.prisma` stub, `prisma.ts` singleton, `database.ts` dual-connect, graceful shutdown).
- ⏳ Phase 1+: follow this plan.
