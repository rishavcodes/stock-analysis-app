import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { env } from './config/env';
import { connectDatabase, disconnectDatabase } from './config/database';
import { prisma } from './config/prisma';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error-handler';
import { apiLimiter } from './middleware/rate-limiter';
import routes from './routes';
import { initScheduler } from './jobs/scheduler';
import { closeMarketStream } from './services/market-stream.singleton';

const app = express();

// Middleware
// CORS: in dev (no ALLOWED_ORIGINS set) reflect any origin so localhost ports
// work without configuration. In prod the env var must be set to the Vercel
// URL(s); anything else is rejected.
const allowedOrigins = (env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
  })
);
app.use(express.json());
app.use('/api', apiLimiter);

// Liveness: process is responding. Cheap by design — Render's Health Check
// Path polls this, and we don't want a transient Supabase/Atlas hiccup to
// trigger a dyno restart loop (which would also re-fire the startup
// catch-up jobs, hammering the broker API).
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
});

// Deep health: pings both databases. For operator/monitoring use, not for
// Render's auto-restart hook. Returns 503 when either DB is unreachable so
// uptime checks (cron-job.org's "expect status 200") will alert.
app.get('/api/health/deep', async (_req, res) => {
  const checks: Record<string, { ok: boolean; error?: string }> = {};

  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.postgres = { ok: true };
  } catch (err) {
    checks.postgres = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  try {
    if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
      throw new Error(`mongoose readyState=${mongoose.connection.readyState}`);
    }
    await mongoose.connection.db.admin().ping();
    checks.mongo = { ok: true };
  } catch (err) {
    checks.mongo = { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const allOk = Object.values(checks).every((c) => c.ok);
  res.status(allOk ? 200 : 503).json({
    success: allOk,
    data: { status: allOk ? 'ok' : 'degraded', checks, timestamp: new Date().toISOString() },
  });
});

// Routes
app.use('/api', routes);

// Error handler (must be last)
app.use(errorHandler);

// Start server
async function start() {
  await connectDatabase();
  initScheduler();

  const server = app.listen(Number(env.PORT), () => {
    logger.info(`Server running on port ${env.PORT} in ${env.NODE_ENV} mode`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    await closeMarketStream();
    await disconnectDatabase();
    server.close(() => process.exit(0));
    // Hard cap if existing connections refuse to close.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

start().catch((error) => {
  logger.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
