import mongoose from 'mongoose';
import { env } from './env';
import { logger } from '../utils/logger';
import { connectPrisma, disconnectPrisma } from './prisma';

/**
 * Connect both databases in parallel.
 *
 * MongoDB holds AnalysisLog (AI outputs + flexible inputData) and — during
 * the phased migration — any model that hasn't been moved to Postgres yet.
 *
 * PostgreSQL (via Prisma + Supabase) is the target for everything else. If
 * DATABASE_URL isn't set, the Postgres connect is a no-op so early phases
 * can still boot on Mongo alone.
 */
export async function connectDatabase(): Promise<void> {
  try {
    await Promise.all([connectMongo(), connectPrisma()]);
  } catch (error) {
    logger.error('Database connection failed:', error);
    process.exit(1);
  }
}

async function connectMongo(): Promise<void> {
  await mongoose.connect(env.MONGODB_URI, {
    // Keep connection alive during long operations
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 360000, // 6 min socket timeout
    maxPoolSize: 10,
    heartbeatFrequencyMS: 10000, // Ping every 10s to keep alive
  });
  logger.info('Connected to MongoDB');

  mongoose.connection.on('error', (error) => {
    logger.error('MongoDB connection error:', error);
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected, attempting reconnect...');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected');
  });
}

/** Clean shutdown for both connections. Called from app.ts SIGTERM/SIGINT handlers. */
export async function disconnectDatabase(): Promise<void> {
  await Promise.allSettled([mongoose.disconnect(), disconnectPrisma()]);
}
