'use client';

import { useEffect } from 'react';
import { useMarketStore } from '@/stores/market.store';
import { formatINR, formatPercent, getChangeColor } from '@/lib/format';

export default function MarketStatusBar() {
  const { marketStatus, fetchMarketStatus } = useMarketStore();

  useEffect(() => {
    fetchMarketStatus();
    const interval = setInterval(fetchMarketStatus, 60000); // Refresh every minute
    return () => clearInterval(interval);
  }, [fetchMarketStatus]);

  if (!marketStatus) return null;

  const { nifty, bankNifty, isOpen } = marketStatus;

  return (
    <div className="border-b border-gray-800 bg-gray-900/50 px-4 py-1.5">
      <div className="mx-auto flex max-w-7xl items-center justify-between text-xs">
        <div className="flex items-center gap-6">
          <IndexTicker name={nifty.name} ltp={nifty.ltp} change={nifty.change} changePercent={nifty.changePercent} />
          <IndexTicker name={bankNifty.name} ltp={bankNifty.ltp} change={bankNifty.change} changePercent={bankNifty.changePercent} />
        </div>
        <div className="flex items-center gap-2">
          <div className={`h-2 w-2 rounded-full ${isOpen ? 'bg-green-500' : 'bg-red-500'}`} />
          <span className="text-gray-400">{isOpen ? 'Market Open' : 'Market Closed'}</span>
        </div>
      </div>
    </div>
  );
}

function IndexTicker({
  name,
  ltp,
  change,
  changePercent,
}: {
  name: string;
  ltp: number;
  change: number;
  changePercent: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="font-medium text-gray-300">{name}</span>
      <span className="text-white">{formatINR(ltp)}</span>
      <span className={getChangeColor(change)}>{formatPercent(changePercent)}</span>
    </div>
  );
}
