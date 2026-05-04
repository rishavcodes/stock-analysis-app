# Deploy: frontend to Vercel, backend to Render

This is a from-scratch deployment guide. By the end you'll have:

- The Next.js frontend live on a `*.vercel.app` URL.
- The Node/Express backend live on a `*.onrender.com` URL.
- The Supabase Postgres + Mongo Atlas you already use, accessed by the deployed backend.
- A cron-job.org schedule that keeps the (free, sleepy) Render dyno awake during the four daily data-pipeline windows.

It assumes the codebase already runs locally and that the `.env` you use locally has working values for every variable in `backend/src/config/env.ts`.

---

## 0. Pre-flight

### 0.1 Commit and push everything

Render and Vercel deploy from git. They cannot see uncommitted changes.

```bash
cd /Users/rishav.codes/Developer/stock-analysis-app
git status                # confirm nothing critical is missing
git add -A
git commit -m "..."       # whatever message reflects current state
git push origin master
```

If the repo isn't on GitHub yet, create a private repo on github.com and push it there first — both Render and Vercel connect via the GitHub OAuth integration.

### 0.2 Confirm the local server is healthy

```bash
curl http://localhost:3001/api/health
curl http://localhost:3001/api/health/deep
```

Both should return `{"success": true, ...}`. If `/api/health/deep` returns 503, fix the failing DB connection locally before deploying — you'll hit the same problem on Render with less visibility.

### 0.3 Have these credentials ready

You'll be pasting them into Render's environment-variable UI:

- `MONGODB_URI` (Mongo Atlas connection string)
- `DATABASE_URL` and `DIRECT_URL` (Supabase, from `backend/.env`)
- `SMARTAPI_API_KEY`, `SMARTAPI_CLIENT_CODE`, `SMARTAPI_PASSWORD`, `SMARTAPI_TOTP_SECRET`
- `ALPHA_VANTAGE_API_KEY`
- `ANTHROPIC_API_KEY`

Open `backend/.env` in another tab so you can copy as you go.

---

## 1. Architecture — what's going where

```
[ Browser ]
    │ HTTPS + Server-Sent Events
    ▼
[ Vercel ]                                [ Render (Free) ]
   Next.js frontend  ──── /api calls ────▶  Node/Express backend
                                              │
                            ┌─────────────────┼──────────────────┐
                            ▼                 ▼                  ▼
                      Supabase Postgres   Mongo Atlas      Angel One WSS,
                      (Prisma)            (AnalysisLog)    Yahoo, Anthropic, AV
                                              ▲
                                              │ pings every few minutes
                                       [ cron-job.org ]
                                       (keeps the free dyno warm
                                        before each cron window)
```

Two important constraints to keep in mind throughout:

1. **The backend cannot horizontally scale.** It holds the Angel WebSocket connection, ref-counted token subscriptions, the SmartAPI session JWT, and the in-memory rate-limiter all in process memory. Render must run exactly one instance — never enable auto-scaling.
2. **Render's free tier sleeps after ~15 min of inactivity.** Cold start is 30-60s. The cron-job.org pinger wakes it up before each scheduled job; if a wake-up is missed, the in-app startup catch-up (in `backend/src/jobs/scheduler.ts`) will backfill on the next boot.

---

## 2. Deploy the backend to Render

### 2.1 Create the Render account and connect GitHub

1. Sign up at [render.com](https://render.com) with the same GitHub account that owns the repo.
2. Authorize Render to read the repository (you can scope it to just this one repo).

### 2.2 Create the Web Service

From the Render dashboard:

1. **New** → **Web Service**.
2. Pick the GitHub repo.
3. Fill in:

| Field | Value |
|---|---|
| Name | `stock-analysis-backend` (or anything — this becomes part of the URL) |
| Region | `Singapore` (closest to NSE for lowest broker latency) |
| Branch | `master` |
| **Root Directory** | `backend` |
| Runtime | `Node` |
| Build Command | `npm ci --include=dev && npx prisma generate && npm run build` |
| Start Command | `npm start` |
| Instance Type | `Free` |
| Health Check Path | `/api/health` |

Do **not** click "Deploy" yet — environment variables come first.

### 2.3 Add environment variables

Scroll to the **Environment** section and add every variable from your `.env`:

```
MONGODB_URI=...
DATABASE_URL=...
DIRECT_URL=...
SMARTAPI_API_KEY=...
SMARTAPI_CLIENT_CODE=...
SMARTAPI_PASSWORD=...
SMARTAPI_TOTP_SECRET=...
ALPHA_VANTAGE_API_KEY=...
ANTHROPIC_API_KEY=...
NODE_ENV=production
ALLOWED_ORIGINS=https://placeholder.vercel.app
```

Notes:

- **Don't set `PORT`** — Render injects it automatically; the app at `src/app.ts` reads `env.PORT`.
- `ALLOWED_ORIGINS` is comma-separated. Use a placeholder for now; you'll update it after the Vercel deploy in section 4.
- For the Supabase URLs, make sure you're using the **pgBouncer (pooled)** URL for `DATABASE_URL` and the **direct** URL for `DIRECT_URL`. See `docs/POSTGRES_SETUP.md` if you're unsure which is which.
- **Why `--include=dev` in the build command?** Setting `NODE_ENV=production` makes plain `npm ci` skip `devDependencies` — which includes TypeScript itself plus every `@types/*` package needed to compile. Without `--include=dev` you'll see a wall of "Cannot find module 'express'" / "Cannot find name 'process'" errors. The runtime image still boots fine because `require('express')` only needs the runtime entry, not the types.

### 2.4 Click Create Web Service

Render will:

1. Clone the repo.
2. Run the build command (TypeScript compile + Prisma client generation).
3. Boot your app.
4. Poll `/api/health` until it returns 200.
5. Mark the service "Live".

First build takes ~5-7 minutes. You can watch the logs in the Render UI.

### 2.5 Verify

Once live, the URL looks like `https://stock-analysis-backend-xxxx.onrender.com`. Test it from your laptop:

```bash
curl https://<your-render-url>/api/health
curl https://<your-render-url>/api/health/deep
```

Both should return 200 with `success: true`. If `/api/health/deep` shows `postgres: { ok: false }` or `mongo: { ok: false }`, double-check the connection-string env vars and whether your DB host allowlists Render's outbound IPs (Mongo Atlas, in particular, sometimes requires `0.0.0.0/0` for free Render dynos since the egress IP isn't pinned).

### 2.6 Watch the startup catch-up run

Open the Render **Logs** tab and look for:

```
Cron scheduler initialized
Startup catch-up: candles stale (newest=..., target=...); running fetch-candles
```

If candles and metrics are already current (because you ran them locally before deploying), you'll see:

```
Startup catch-up: candles and metrics already up to date
```

Either is fine.

---

## 3. Deploy the frontend to Vercel

### 3.1 Create the Vercel project

1. Sign in at [vercel.com](https://vercel.com) with the same GitHub account.
2. **Add New** → **Project** → import the same repo.

### 3.2 Configure the project

| Field | Value |
|---|---|
| Framework Preset | `Next.js` (auto-detected) |
| **Root Directory** | `frontend` |
| Build / Output / Install commands | leave defaults — Vercel knows Next.js |

### 3.3 Add the one environment variable

Under **Environment Variables**:

| Key | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://<your-render-url>/api` | Production, Preview, Development |

The `/api` suffix matters — `frontend/src/lib/api.ts` builds URLs by appending paths to this prefix.

### 3.4 Deploy

Click **Deploy**. First build takes 1-2 min. The URL will look like `https://<project-name>.vercel.app`.

### 3.5 Verify

Visit `https://<project-name>.vercel.app/screener` in a browser. The screener should populate with stocks. Open DevTools → Network and confirm requests are going to `https://<your-render-url>/api/...` and not localhost.

---

## 4. Wire CORS back to the real Vercel URL

The placeholder in step 2.3 needs to become the real Vercel URL or the browser will block requests with a CORS error.

1. Render dashboard → your service → **Environment** → edit `ALLOWED_ORIGINS`.
2. Set it to your Vercel URL(s), comma-separated:

   ```
   https://<project-name>.vercel.app
   ```

   If you also have preview deployments you want to allow, list them: `https://<project-name>.vercel.app,https://<project-name>-git-master-<your-org>.vercel.app`.

3. **Save Changes**. Render will auto-redeploy with the new value.

Verify: open the Vercel app, screener still loads, network tab shows successful API calls. If you see CORS errors in the browser console, the value in `ALLOWED_ORIGINS` doesn't match the origin the browser is sending — match them exactly (including `https://`, no trailing slash).

---

## 5. Keep the dyno awake — cron-job.org

Free Render dynos sleep after ~15 min idle, which means a cron job scheduled for 4:00 PM IST does nothing if no traffic has hit the service since 3:45 PM. Pre-warming with an external pinger fixes this.

### 5.1 Create the account

[cron-job.org](https://cron-job.org) → sign up (free tier handles all of these on one account).

### 5.2 Add five jobs

For each row below, create one cron job. The URL is always `https://<your-render-url>/api/health`. Set "Notification on failure" → email so you find out before data goes stale.

| Purpose | Cron expression (UTC) |
|---|---|
| Pre-warm fetch-fundamentals (06:00 IST) | `25,28 0 * * 1-5` |
| Pre-warm fetch-candles (16:00 IST) | `25,28 10 * * 1-5` |
| Pre-warm compute-metrics (16:30 IST) | `55,58 10 * * 1-5` |
| Pre-warm evaluate-predictions (18:00 IST) | `25,28 12 * * 1-5` |
| Keep alive during market hours (alerts cron runs every minute) | `*/10 3-10 * * 1-5` |

Two pings per window 3 minutes apart absorbs a single missed wake-up. The market-hours job pings every 10 minutes from 03:30 UTC (09:00 IST) through 10:00 UTC (15:30 IST).

### 5.3 Verify

After 24 hours, check Render's logs for the daily messages:

```
Running scheduled job: fetch daily candles
...
Fetch candles job completed
Running scheduled job: compute metrics
...
Compute metrics job completed
```

If you don't see them, check cron-job.org's execution history — each ping should report HTTP 200.

---

## 6. End-to-end smoke test

After everything is live, walk through this on the deployed app:

1. **Screener loads** — `https://<vercel>/screener` populates with rows. If empty, check Render logs for errors and `/api/health/deep`.
2. **Detail page loads** — click any stock; the page shows price, indicators, fundamentals.
3. **Live ticker animates** — when NSE is open, the LTP and tick counter update on the detail page. This proves the full SSE chain (Vercel → browser → Render → Angel WebSocket) works through Render's proxy.
4. **Run the freshness diagnostic** against the production DB. From your laptop:

   ```bash
   cd backend
   DATABASE_URL="<production_DATABASE_URL>" \
     npx tsx src/scripts/diagnose-overall-freshness.ts
   ```

   The morning after a weekday close, expect:
   - Newest candle: most recent trading day.
   - Newest metric: same day, ~2,500 symbols.

5. **Force a redeploy** to test the startup catch-up: push any small change (or use Render's "Manual Deploy" button). The new dyno should log `Startup catch-up: ... already up to date` if data is fresh. If you deploy mid-week before the daily cron has fired, expect the `running fetch-candles` / `running compute-metrics` lines instead.

---

## 7. Operational caveats — read before relying on this in anger

- **Cold start is visible.** First request after 15 min of idle takes 30-60 seconds — Vercel returns instantly but the API calls hang. Acceptable for personal use; painful if you're showing the app to someone else. Upgrade to Render's $7/month Starter plan to keep the dyno warm 24/7.
- **SmartAPI re-auths on every dyno wake.** Adds 1-2s to the first API call after a cold start. There's no way around this on free tier.
- **Yahoo Finance has no API key.** It rate-limits by IP. Render's free dynos share IP pools; if you start seeing `429`s in the fundamentals job, that's why. The throttle in `MarketDataService` (2 req/s) usually keeps you under the limit.
- **Anthropic billing is on your key.** AI analysis endpoint at `/api/stocks/:symbol/analysis` is rate-limited at the route layer (`analysisLimiter`) but still public. If you put the URL in front of strangers, treat that as exposing your wallet.
- **Mongo Atlas IP allowlist.** Free Render dynos don't have static egress IPs. The simplest workable allowlist is `0.0.0.0/0`. Combine with strong passwords and TLS-only connection strings, which Atlas does by default.
- **Angel One IP restrictions.** SmartAPI may rate-limit or block specific IP ranges. If broker calls fail with auth errors despite valid TOTP, contact Angel about allowlisting Render's region.

---

## 8. What to do when things break

| Symptom | First place to look |
|---|---|
| Screener page is empty | `https://<render>/api/health/deep` — both DBs healthy? |
| Live ticker doesn't update | Render logs for `MarketStream:` lines; check SmartAPI session is active |
| Browser console: CORS error | `ALLOWED_ORIGINS` env var on Render — does it exactly match the page origin? |
| Cron jobs not firing | cron-job.org execution history; Render logs at the cron minute |
| Old data on detail page (the bug we just fixed) | Run `diagnose-overall-freshness.ts` against production DB; if metric date is yesterday's trading day, that's correct on free tier — it'll catch up after market close |
| Backend crashed and won't restart | Render logs for stack trace; common cause is missing env var (Zod parse failure exits 1) |

---

## 9. What this guide deliberately does not cover

- Custom domains. Both Vercel and Render support them; the official docs are clearer than anything I'd write here.
- Observability (Sentry, Datadog). Worth adding before sharing with users; not required to deploy.
- CI/CD beyond Render and Vercel's native auto-deploy on push. Both will redeploy on every push to `master` by default — that's enough for a personal project.
- Migrating AnalysisLog off Mongo. Phase 7 of `docs/POSTGRES_MIGRATION.md` will eventually let you drop the Mongo dependency entirely; until then, both DBs are required.
- Distributed rate-limiting (Redis). Only relevant if you ever scale beyond one instance, which the in-memory singletons in this codebase don't support.
