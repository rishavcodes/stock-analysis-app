import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { connectDatabase } from './config/database';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error-handler';
import { apiLimiter } from './middleware/rate-limiter';
import routes from './routes';
import { initScheduler } from './jobs/scheduler';
import { closeMarketStream } from './services/market-stream.singleton';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use('/api', apiLimiter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ success: true, data: { status: 'ok', timestamp: new Date().toISOString() } });
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
