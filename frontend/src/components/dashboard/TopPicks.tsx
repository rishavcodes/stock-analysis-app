'use client';

import Link from 'next/link';
import { useMarketStore } from '@/stores/market.store';
import ScoreBadge from '@/components/shared/ScoreBadge';
import { getRecommendationColor } from '@/lib/format';

export default function TopPicks() {
  const { topPicks } = useMarketStore();

  if (topPicks.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 text-lg font-semibold">Top Stock Picks</h2>
        <p className="text-sm text-gray-500">No scored stocks available yet. Run analysis pipeline first.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-semibold">Top Stock Picks</h2>
        <Link href="/screener" className="text-xs text-blue-400 hover:text-blue-300">
          View All
        </Link>
      </div>
      <div className="space-y-2">
        {topPicks.map((stock, i) => (
          <Link
            key={stock.symbol}
            href={`/stock/${stock.symbol}`}
            className="flex items-center justify-between rounded-md border border-gray-700/50 bg-gray-800/30 p-3 transition-colors hover:border-gray-600 hover:bg-gray-800/50"
          >
            <div className="flex items-center gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-gray-700 text-xs font-bold">
                {i + 1}
              </span>
              <div>
                <div className="font-medium">{stock.symbol}</div>
                <div className="text-xs text-gray-500">{stock.stockInfo?.sector || ''}</div>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <ScoreBadge score={stock.finalScore} />
              {stock.isBreakout && (
                <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">
                  BREAKOUT
                </span>
              )}
              <span className="text-xs text-gray-400">{stock.trendDirection}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
