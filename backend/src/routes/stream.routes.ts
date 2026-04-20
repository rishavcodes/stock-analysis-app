import { Router, Request, Response, NextFunction } from 'express';
import { Stock } from '../models/Stock';
import { getMarketStream } from '../services/market-stream.singleton';
import { Tick } from '../services/market-stream.service';
import { logger } from '../utils/logger';

const router = Router();

/**
 * GET /api/stream/ltp/:symbol
 * Server-sent events: one `tick` event per upstream Angel update for the given
 * symbol. On connect the last cached tick (if any) is replayed immediately so
 * the client never has to wait for the next trade to paint. Idle connections
 * get a heartbeat comment every 25s to keep intermediaries from closing them.
 */
router.get('/ltp/:symbol', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const symbol = (req.params.symbol as string).toUpperCase();
    const stock = await Stock.findOne({ symbol }).lean();
    if (!stock) {
      res.status(404).json({ success: false, error: `Stock ${symbol} not found` });
      return;
    }

    // SSE headers
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable proxy buffering if any
    res.flushHeaders?.();

    const stream = getMarketStream();
    logger.info(`SSE: client connected for ${symbol} (token=${stock.token}, exchange=${stock.exchange})`);

    let writes = 0;
    let mismatches = 0;
    const writeTick = (t: Tick) => {
      if (t.token !== stock.token) {
        // Log the first mismatch so we can spot token-format issues quickly;
        // then only every 50th to avoid flooding logs when another symbol's
        // ticks share the emitter.
        mismatches++;
        if (mismatches === 1 || mismatches % 50 === 0) {
          logger.warn(
            `SSE ${symbol}: token mismatch #${mismatches} got=${JSON.stringify(t.token)} want=${JSON.stringify(stock.token)}`
          );
        }
        return;
      }
      writes++;
      if (writes === 1 || writes % 20 === 0) {
        logger.info(`SSE ${symbol}: write#${writes} ltp=${t.ltp}`);
      }
      res.write(`event: tick\ndata: ${JSON.stringify(t)}\n\n`);
    };

    let unsubscribe: (() => void) | null = null;
    try {
      unsubscribe = await stream.subscribeQuote(stock.exchange, stock.token);
    } catch (err) {
      logger.warn(`Stream subscribe failed for ${symbol}: ${err instanceof Error ? err.message : err}`);
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'upstream unavailable' })}\n\n`);
      // Keep the connection open; client can retry by reloading.
    }

    // Replay cached tick if we already have one.
    const cached = stream.getLatestTick(stock.token);
    if (cached) {
      logger.info(`SSE ${symbol}: replaying cached tick ltp=${cached.ltp}`);
      writeTick(cached);
    }

    stream.on('tick', writeTick);

    // Heartbeat every 25s to keep proxies / load balancers happy.
    const heartbeat = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 25_000);

    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(heartbeat);
      stream.off('tick', writeTick);
      unsubscribe?.();
      logger.info(`SSE ${symbol}: client disconnected (writes=${writes}, mismatches=${mismatches})`);
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
  } catch (error) {
    next(error);
  }
});

export default router;
