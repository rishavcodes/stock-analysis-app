import { PrismaClient } from '@prisma/client';
import { env } from './env';
import { logger } from '../utils/logger';

/**
 * Singleton PrismaClient for the whole backend.
 *
 * Runtime behaviour:
 *   - Constructed lazily on first import.
 *   - Lives for the life of the process; Node handles connection pooling.
 *   - Emits a log line for slow queries (>500ms) so we catch N+1 early.
 *
 * During the Mongo → Postgres migration this client may be idle because the
 * active phase hasn't moved any model over yet. That's fine — PrismaClient
 * doesn't open a connection until the first query.
 */
export const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'warn' },
    { emit: 'event', level: 'error' },
    { emit: 'event', level: 'query' },
  ],
});

// Surface slow queries (>500ms). Prisma logs raw SQL at debug level; we only
// want to see the ones that actually hurt.
const SLOW_QUERY_MS = 500;
prisma.$on('query' as never, (e: { duration: number; query: string; params: string }) => {
  if (e.duration >= SLOW_QUERY_MS) {
    logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
  }
});
prisma.$on('warn' as never, (e: { message: string }) => logger.warn(`Prisma warn: ${e.message}`));
prisma.$on('error' as never, (e: { message: string }) => logger.error(`Prisma error: ${e.message}`));

/**
 * Connect Prisma eagerly so a missing DATABASE_URL fails loud on boot rather
 * than the first query. Skips if DATABASE_URL isn't set — lets the app run
 * on Mongo-only during early migration phases.
 */
export async function connectPrisma(): Promise<void> {
  if (!env.DATABASE_URL) {
    logger.info('Prisma: DATABASE_URL not set, skipping Postgres connect (Mongo-only mode)');
    return;
  }
  try {
    await prisma.$connect();
    logger.info('Prisma: connected to Postgres');
  } catch (error) {
    logger.error('Prisma: connection failed', error);
    throw error;
  }
}

export async function disconnectPrisma(): Promise<void> {
  await prisma.$disconnect();
}
