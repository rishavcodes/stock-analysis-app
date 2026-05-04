/**
 * Aggregate freshness check across all stocks: how recent is the newest candle
 * and the newest metric across the whole table? Used to decide whether a
 * stock-detail-page staleness report is symbol-specific or pipeline-wide.
 */
import { prisma } from '../config/prisma';

async function main() {
  const totalStocks = await prisma.stock.count({ where: { isActive: true } });

  const newestCandleAny = await prisma.candle.findFirst({
    where: { interval: 'ONE_DAY' },
    orderBy: { timestamp: 'desc' },
    select: { timestamp: true, stockToken: true },
  });
  const newestMetricAny = await prisma.stockMetric.findFirst({
    orderBy: { date: 'desc' },
    select: { date: true, symbol: true },
  });

  console.log(`active stocks: ${totalStocks}`);
  console.log(`newest candle anywhere: ${newestCandleAny?.timestamp.toISOString()} (token=${newestCandleAny?.stockToken})`);
  console.log(`newest metric anywhere: ${newestMetricAny?.date.toISOString()} (symbol=${newestMetricAny?.symbol})`);

  // Distinct most-recent metric date counts — how many stocks have today's metric, yesterday's, etc.
  const distinctDates = await prisma.$queryRaw<Array<{ d: Date; c: bigint }>>`
    SELECT date::date AS d, COUNT(DISTINCT symbol)::bigint AS c
    FROM stock_metrics
    WHERE date >= NOW() - INTERVAL '30 days'
    GROUP BY date::date
    ORDER BY date::date DESC
    LIMIT 10
  `;
  console.log(`metric date distribution (last 30d):`);
  for (const r of distinctDates) {
    console.log(`  ${r.d.toISOString().slice(0, 10)}  ${r.c} symbols`);
  }

  const distinctCandleDates = await prisma.$queryRaw<Array<{ d: Date; c: bigint }>>`
    SELECT timestamp::date AS d, COUNT(DISTINCT "stockToken")::bigint AS c
    FROM candles
    WHERE interval = 'ONE_DAY' AND timestamp >= NOW() - INTERVAL '30 days'
    GROUP BY timestamp::date
    ORDER BY timestamp::date DESC
    LIMIT 10
  `;
  console.log(`candle date distribution (last 30d):`);
  for (const r of distinctCandleDates) {
    console.log(`  ${r.d.toISOString().slice(0, 10)}  ${r.c} tokens`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
