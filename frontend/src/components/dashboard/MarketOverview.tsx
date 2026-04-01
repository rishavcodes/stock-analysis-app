'use client';

import { useMarketStore } from '@/stores/market.store';
import { formatINR, formatPercent, getChangeColor } from '@/lib/format';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function MarketOverview() {
  const { marketStatus, isLoading } = useMarketStore();

  if (isLoading || !marketStatus) return <LoadingSpinner />;

  const { nifty, bankNifty, marketScore } = marketStatus;

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      <IndexCard index={nifty} />
      <IndexCard index={bankNifty} />
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h3 className="text-sm text-gray-400">Market Health</h3>
        <div className="mt-2 flex items-end gap-2">
          <span className="text-3xl font-bold">{marketScore}</span>
          <span className="text-sm text-gray-400">/100</span>
        </div>
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-gray-800">
          <div
            className={`h-full rounded-full transition-all ${
              marketScore >= 70 ? 'bg-green-500' : marketScore >= 40 ? 'bg-yellow-500' : 'bg-red-500'
            }`}
            style={{ width: `${marketScore}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-gray-500">
          {marketScore >= 70 ? 'Bullish conditions' : marketScore >= 40 ? 'Neutral market' : 'Bearish conditions'}
        </p>
      </div>
    </div>
  );
}

function IndexCard({ index }: { index: { name: string; ltp: number; change: number; changePercent: number; trend: string; sma50: number; sma200: number } }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm text-gray-400">{index.name}</h3>
        <span
          className={`rounded px-2 py-0.5 text-xs font-medium ${
            index.trend === 'BULLISH'
              ? 'bg-green-500/20 text-green-400'
              : index.trend === 'BEARISH'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-yellow-500/20 text-yellow-400'
          }`}
        >
          {index.trend}
        </span>
      </div>
      <div className="mt-2">
        <span className="text-2xl font-bold">{formatINR(index.ltp)}</span>
        <span className={`ml-2 text-sm ${getChangeColor(index.change)}`}>
          {formatPercent(index.changePercent)}
        </span>
      </div>
      <div className="mt-2 flex gap-4 text-xs text-gray-500">
        <span>50 DMA: {formatINR(index.sma50)}</span>
        <span>200 DMA: {formatINR(index.sma200)}</span>
      </div>
    </div>
  );
}
