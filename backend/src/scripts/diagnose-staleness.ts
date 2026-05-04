/**
 * Diagnose stale-metric vs live-LTP mismatch reported on the stock detail page.
 * Prints, per high-volume sample symbol:
 *   - latest candle date and close
 *   - latest stockMetric date, sma20/sma50/sma200, fundamentalsUpdatedAt
 * so we can see whether the discrepancy is candle-staleness or compute-staleness.
 */
import { prisma } from '../config/prisma';

async function main() {
  const symbol = process.argv[2];
  if (!symbol) {
    console.error('Usage: tsx src/scripts/diagnose-staleness.ts <SYMBOL>');
    process.exit(1);
  }

  const stock = await prisma.stock.findUnique({ where: { symbol } });
  if (!stock) {
    console.error(`Stock ${symbol} not found`);
    process.exit(1);
  }
  console.log(`stock: symbol=${stock.symbol} token=${stock.token} exchange=${stock.exchange}`);

  const newestCandle = await prisma.candle.findFirst({
    where: { stockToken: stock.token, interval: 'ONE_DAY' },
    orderBy: { timestamp: 'desc' },
  });
  const oldestCandle = await prisma.candle.findFirst({
    where: { stockToken: stock.token, interval: 'ONE_DAY' },
    orderBy: { timestamp: 'asc' },
  });
  const candleCount = await prisma.candle.count({
    where: { stockToken: stock.token, interval: 'ONE_DAY' },
  });
  console.log(`candles: count=${candleCount}`);
  console.log(`  newest: ${newestCandle?.timestamp.toISOString()} close=${newestCandle?.close}`);
  console.log(`  oldest: ${oldestCandle?.timestamp.toISOString()} close=${oldestCandle?.close}`);

  const last5 = await prisma.candle.findMany({
    where: { stockToken: stock.token, interval: 'ONE_DAY' },
    orderBy: { timestamp: 'desc' },
    take: 5,
  });
  console.log(`  last 5:`);
  for (const c of last5) {
    console.log(`    ${c.timestamp.toISOString().slice(0, 10)} close=${c.close}`);
  }

  const newestMetric = await prisma.stockMetric.findFirst({
    where: { symbol },
    orderBy: { date: 'desc' },
  });
  if (newestMetric) {
    console.log(`metric:`);
    console.log(`  date=${newestMetric.date.toISOString().slice(0, 10)}`);
    console.log(`  sma20=${newestMetric.sma20} sma50=${newestMetric.sma50} sma200=${newestMetric.sma200}`);
    console.log(`  pe=${newestMetric.pe} roe=${newestMetric.roe} marketCap=${newestMetric.marketCap}`);
    console.log(`  fundamentalsUpdatedAt=${newestMetric.fundamentalsUpdatedAt?.toISOString() ?? 'null'}`);
    console.log(`  updatedAt=${newestMetric.updatedAt.toISOString()}`);
  } else {
    console.log(`metric: none`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
