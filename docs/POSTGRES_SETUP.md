# Postgres + Prisma — zero to first query

This is a step-by-step onboarding for a Postgres-beginner. Once you finish you'll have:

- A running Postgres database (local Docker **or** Supabase — your choice)
- TimescaleDB enabled (for the `Candle` table later)
- `DATABASE_URL` / `DIRECT_URL` in your backend `.env`
- A working `npx prisma` toolchain locally
- One empty migration applied — proving the pipe end-to-end

No code is migrated yet. That happens in `docs/POSTGRES_MIGRATION.md`, phase by phase.

## Pick a deployment target

You can do all of Phases 1–7 against a Postgres running on your own laptop. Switching to Supabase (or any other hosted Postgres) later is just a `.env` change — Prisma migrations and code don't care where Postgres lives.

| Option | When to pick it |
|---|---|
| **Local Postgres via Docker** (Section 2A) | You're learning, you don't have a Supabase account, you don't want to depend on the internet, you want fastest queries. **Recommended for development.** |
| **Supabase** (Section 2B) | You want a web dashboard for poking at data, you want backups out of the box, you're about to deploy to a server. |

Both lead to the same Section 3 (`.env`) onward.

---

## 1. Mental model — why three tools

| Tool | Role |
|---|---|
| **PostgreSQL** | The database itself. Relational (tables with columns, foreign keys, joins). |
| **Supabase** | A hosted Postgres (like MongoDB Atlas is hosted Mongo). Free tier covers dev; a web dashboard; can enable extensions like TimescaleDB. |
| **Prisma** | An ORM for Node.js. You describe your tables in `schema.prisma`; Prisma generates a typed client and manages SQL migrations. |

### How they interact

```
  your code  ──►  prisma client (typed)  ──►  Supabase (Postgres server)
                        │
                 schema.prisma + migrations ──► Supabase
                 (you control the shape via Prisma CLI)
```

You only ever *write* Postgres tables through Prisma; you *read* them either through Prisma or directly in the Supabase web UI (handy for debugging).

---

## 2A. Run Postgres locally via Docker (recommended for development)

This gets you Postgres **and** TimescaleDB in one container. Total time: ~5 minutes. Zero internet dependency once the image is pulled. Free, fast, and you can throw it away and restart anytime.

### One-time prereq: Docker Desktop

If you don't have Docker yet, install **Docker Desktop for Mac** from <https://www.docker.com/products/docker-desktop/>. After install, run `docker --version` to confirm.

### Start the database

```bash
# Run from anywhere; the container is independent of the project.
docker run -d \
  --name stockdb \
  -e POSTGRES_USER=stockapp \
  -e POSTGRES_PASSWORD=stockapp \
  -e POSTGRES_DB=stockdb \
  -p 5432:5432 \
  -v stockdb-data:/var/lib/postgresql/data \
  timescale/timescaledb:latest-pg16
```

What this does:
- Pulls the official **TimescaleDB image** (Postgres 16 + TimescaleDB extension preinstalled).
- Creates a database `stockdb` with user `stockapp` / password `stockapp`.
- Maps host port 5432 → container port 5432, so you can connect at `localhost:5432`.
- Persists data to a Docker volume `stockdb-data`, so restarts don't wipe your data.

Verify it's up:

```bash
docker ps --filter name=stockdb
# Should show STATUS "Up X seconds"
```

### Daily lifecycle

```bash
docker stop stockdb     # stop (data preserved)
docker start stockdb    # restart
docker logs -f stockdb  # watch the Postgres log
```

### Connection strings for `.env`

For local Docker, both URLs are the same — there's no pooler, you just connect directly:

```
DATABASE_URL="postgresql://stockapp:stockapp@localhost:5432/stockdb"
DIRECT_URL="postgresql://stockapp:stockapp@localhost:5432/stockdb"
```

### Enable the TimescaleDB extension (one-time)

The image bundles TimescaleDB but doesn't activate it until you run `CREATE EXTENSION`. Do this once now so the Phase 2 migration just works:

```bash
docker exec -it stockdb psql -U stockapp -d stockdb -c "CREATE EXTENSION IF NOT EXISTS timescaledb;"
```

You should see `CREATE EXTENSION`. To verify:

```bash
docker exec -it stockdb psql -U stockapp -d stockdb -c "SELECT extname, extversion FROM pg_extension WHERE extname = 'timescaledb';"
```

That's it — local Postgres is ready. **Skip Section 2B and jump to Section 4 (apply baseline migration).**

---

## 2B. Create a Supabase project (alternative — pick this OR 2A, not both)

> Skip this if you set up local Docker in Section 2A.

1. Go to **https://supabase.com**, sign up (GitHub login is fastest).
2. Click **New project**. Pick:
   - **Name**: `stock-analysis-dev`
   - **Database password**: generate a strong one and save it in your password manager — Supabase will not show it again.
   - **Region**: `ap-south-1` (Mumbai) if you're in India, otherwise closest to you. This matters for latency on every query.
   - **Plan**: Free is fine for development. Upgrade later if you run out of space.
3. Wait ~2 minutes while Supabase provisions. The dashboard opens when ready.

### 2B.1 Grab the connection strings

You'll need **two** URLs. Supabase gives you both on the **Project Settings → Database** page.

1. In the Supabase dashboard, click the gear icon (Project Settings) in the left nav, then **Database**.
2. Scroll to **Connection string**. You'll see a dropdown — pick **URI**.
3. There are **two tabs** you need to copy from:

   - **Session** (direct connection at port **5432**) — this is your **`DIRECT_URL`**. Used only by `prisma migrate`.
   - **Transaction** (pgBouncer pooler at port **6543**) — this is your **`DATABASE_URL`**. Used by the app at runtime.

   > If the tabs are labeled differently ("Connection pooling" vs "Direct connection"), grab the connection-pooling URL for `DATABASE_URL` and the direct-connection URL for `DIRECT_URL`.

4. Both strings contain `[YOUR-PASSWORD]`. Replace with the password you set in step 2B.2.

### Why two URLs (Supabase only)?

- App runtime (`DATABASE_URL`) goes through Supabase's **pgBouncer pooler** — it multiplexes thousands of app connections onto a small pool of real Postgres connections. Essential for serverless / autoscaled apps.
- Migrations (`DIRECT_URL`) need a **direct connection** because Prisma issues DDL statements (CREATE TABLE, ALTER, etc.) that pgBouncer's transaction mode can't pipeline safely.

For local Docker (2A) there's no pooler, so both URLs point at the same place.

### 2B.2 Paste into your `.env`

```
# Supabase / Postgres
DATABASE_URL="postgres://postgres.xxxx:<password>@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1"
DIRECT_URL="postgres://postgres.xxxx:<password>@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
```

Notes:
- Quote the values (they contain special characters).
- `?pgbouncer=true&connection_limit=1` on `DATABASE_URL` is a Prisma-recommended pgBouncer flag — it tells Prisma "don't use prepared statements across connections."
- **Never commit `.env`** — it's in `.gitignore` already; keep it that way.

### 2B.3 Enable TimescaleDB

1. In the Supabase dashboard, **Database → Extensions**.
2. Search **`timescaledb`**.
3. Flip it on.

---

## 3. Install Prisma locally

Already done for you in Phase 0:

```bash
cd backend
# (verify)
grep prisma package.json
# "@prisma/client": "^6..."
# "prisma": "^6..."
```

If missing, run:

```bash
cd backend
npm install @prisma/client pg
npm install -D prisma @types/pg
```

---

## 4. Apply the empty baseline migration

This proves your connection strings work before we add any real models.

```bash
cd backend
npx prisma migrate dev --name init
```

What happens:
1. Prisma reads `prisma/schema.prisma` (currently no models).
2. Compares to the Postgres database (currently empty).
3. Writes `prisma/migrations/<timestamp>_init/migration.sql` — containing nothing because there are no models, but the migration is **recorded** in a `_prisma_migrations` table.
4. Applies the migration (no-op) and regenerates the Prisma client.

Expected output includes: `Your database is now in sync with your schema.`

Later, when we add `Stock` in Phase 1, `migrate dev` will diff the schema, write a SQL file, and apply it. That's the whole workflow.

---

## 5. Prisma Studio — visual DB browser

Prisma ships a web UI for quick inspection. With local Docker, this is your main "what's in the DB?" tool.

```bash
cd backend
npx prisma studio
```

Opens `http://localhost:5555`. Right now it's empty — you'll see tables appear as we migrate in each phase.

---

## 6. Everyday Prisma commands (cheatsheet)

All run from `backend/`.

| Command | What it does |
|---|---|
| `npx prisma migrate dev --name <describe>` | Diff schema → write SQL → apply it → regen client. Dev only. |
| `npx prisma migrate deploy` | Apply **already-existing** migrations. Use in production/CI. |
| `npx prisma generate` | Regenerate the typed client without touching the DB (e.g. after `git pull`). |
| `npx prisma studio` | Open the visual browser. |
| `npx prisma db push` | ⚠️ Sync schema → DB **without** recording a migration. Use only for scratch prototyping; never in prod. |
| `npx prisma migrate reset` | ⚠️ Drop + recreate the DB, rerun all migrations. Destroys data. |

---

## 10. Common Prisma query patterns

Once a model exists (e.g., Stock, after Phase 1), you'll write queries like this:

```ts
import { prisma } from './config/prisma';

// findUnique — by unique column
const stock = await prisma.stock.findUnique({ where: { symbol: 'RELIANCE' } });

// findFirst — no uniqueness required
const bull = await prisma.stockMetric.findFirst({
  where: { symbol: 'RELIANCE', marketRegime: 'BULLISH' },
  orderBy: { date: 'desc' },
});

// findMany with filters, pagination, and ordering
const top = await prisma.stockMetric.findMany({
  where: { finalScore: { gte: 70 }, sector: 'IT' },
  orderBy: { adjustedFinalScore: 'desc' },
  skip: 0,
  take: 20,
});

// create
await prisma.portfolio.create({
  data: { symbol: 'INFY', quantity: 10, avgBuyPrice: 1500, buyDate: new Date() },
});

// update
await prisma.portfolio.update({
  where: { id: 42 },
  data: { status: 'EXITED', exitPrice: 1650, exitDate: new Date() },
});

// upsert (insert-or-update — like Mongo's findOneAndUpdate with upsert:true)
await prisma.stockMetric.upsert({
  where: { symbol_date: { symbol: 'INFY', date: today } }, // compound unique
  create: { symbol: 'INFY', date: today, finalScore: 72 /* ... */ },
  update: { finalScore: 72 },
});

// delete
await prisma.alert.delete({ where: { id: 7 } });

// transactions — all-or-nothing across multiple statements
await prisma.$transaction([
  prisma.portfolio.update({ where: { id: 1 }, data: { status: 'EXITED' } }),
  prisma.alert.create({ data: { /* ... */ } }),
]);

// raw SQL escape hatch (used for TimescaleDB-specific DDL in Phase 2)
await prisma.$executeRaw`SELECT create_hypertable('"Candle"', 'timestamp');`;
```

### Mongo → Prisma translation quick ref

| Mongo (Mongoose) | Prisma |
|---|---|
| `Model.findOne({ foo: 'bar' })` | `prisma.model.findFirst({ where: { foo: 'bar' } })` |
| `Model.findById(id)` | `prisma.model.findUnique({ where: { id } })` |
| `Model.find({ foo: 'bar' }).sort({ x: -1 }).limit(20).lean()` | `prisma.model.findMany({ where: { foo: 'bar' }, orderBy: { x: 'desc' }, take: 20 })` |
| `Model.findOneAndUpdate(filter, update, { upsert: true })` | `prisma.model.upsert({ where: filter, create: { ... }, update })` |
| `Model.bulkWrite([{ updateOne: { ... upsert: true } }, ...])` | `prisma.model.createMany({ data: [...], skipDuplicates: true })` (for pure inserts) or loop `upsert` |
| `Model.countDocuments(filter)` | `prisma.model.count({ where: filter })` |
| `Model.aggregate([{ $group: ... }])` | `prisma.model.groupBy({ by: [...], _sum: { ... } })` OR raw SQL |

---

## 7. Troubleshooting

### "Can't reach database server"
- **Local Docker**: `docker ps --filter name=stockdb` — is the container running? If `STATUS` says exited, run `docker start stockdb` and check `docker logs stockdb`.
- **Supabase**: your `DATABASE_URL` password is wrong, or you haven't allowlisted your IP. Go to **Project Settings → Database → Network restrictions** in Supabase. For dev, "Allow all" is fine.

### "prepared statement already exists" (Supabase only)
You used `DIRECT_URL` (port 5432) where `DATABASE_URL` (port 6543) was expected. Prisma client should use the pooler; migrations use direct. Local Docker doesn't have this problem because there's no pooler.

### "P1012: Error parsing schema"
You mis-formatted `schema.prisma`. `npx prisma format` auto-formats. The error always points at a line number.

### Schema drift after manual SQL
Never edit the table editor (Supabase or otherwise) to add/rename columns. Prisma doesn't know and your next `migrate dev` will fight the DB. If you must, run `npx prisma db pull` first to sync the schema file.

### Tests fail with "Environment variable not found: DATABASE_URL"
Tests don't hit a real DB. Make sure `vitest.config.ts` sets a placeholder `DATABASE_URL` under `test.env` (same as we do for `MONGODB_URI`). Or mock the `prisma` import via `vi.mock('../config/prisma', () => ({ prisma: { ... } }))`.

### "Row-level security policy" errors when inserting (Supabase only)
Supabase enables RLS by default on new tables. For this app (single-user backend service) you can disable RLS per table via the Supabase dashboard → **Authentication → Policies**. Or run `ALTER TABLE "TableName" DISABLE ROW LEVEL SECURITY;` in a raw SQL migration. We'll disable RLS per table as part of each phase's migration. Local Docker has no RLS by default — nothing to do.

### Lost the database / want a clean slate (local Docker)
```bash
docker stop stockdb && docker rm stockdb
docker volume rm stockdb-data
# rerun the `docker run` command from Section 2A.
```

---

## 8. You're done with setup when…

- [ ] **Either** Docker container `stockdb` is running (Section 2A) **or** Supabase project exists with password saved (Section 2B).
- [ ] TimescaleDB extension is enabled (`CREATE EXTENSION` for local; flipped on in dashboard for Supabase).
- [ ] `DATABASE_URL` + `DIRECT_URL` in `backend/.env`.
- [ ] `npx prisma migrate dev --name init` completes with `Your database is now in sync`.
- [ ] `npx prisma studio` opens at `localhost:5555` (will be empty until Phase 1).
- [ ] `npm run dev` in `backend/` boots with a new log line: `Prisma: connected to Postgres`.

Once all checkboxes pass, proceed to [POSTGRES_MIGRATION.md](./POSTGRES_MIGRATION.md) for the actual model-by-model migration.

## Switching from local to Supabase later

When you're ready to deploy or want a hosted DB:

1. Create the Supabase project (Section 2B).
2. **Replace** `DATABASE_URL` and `DIRECT_URL` in `.env` with Supabase's URLs.
3. Run `npx prisma migrate deploy` against the new DB. This applies all your local migrations to Supabase in order.
4. ETL data over (or just let crons re-populate, depending on the table).

No code changes — Prisma + Postgres look the same to your app whether the DB is on `localhost` or in AWS Mumbai.
