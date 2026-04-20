'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStockStore } from '@/stores/stock.store';
import { useLiveLtp } from '@/hooks/useLiveLtp';
import PriceChart from '@/components/stock/PriceChart';
import IndicatorPanel from '@/components/stock/IndicatorPanel';
import FundamentalsTable from '@/components/stock/FundamentalsTable';
import AIAnalysis from '@/components/stock/AIAnalysis';
import ScoreGauge from '@/components/stock/ScoreGauge';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function StockDetailPage() {
  const params = useParams();
  const symbol = (params.symbol as string).toUpperCase();
  const { stockDetail, isLoading, fetchStockDetail } = useStockStore();
  const live = useLiveLtp(symbol);

  useEffect(() => {
    fetchStockDetail(symbol);
  }, [symbol, fetchStockDetail]);

  if (isLoading || !stockDetail) {
    return (
      <div className="py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const { stock, metrics, candles, analysis } = stockDetail;
  // Live socket values take precedence over REST-sourced ones once a tick arrives.
  const lastPrice = live.lastPrice ?? stockDetail.lastPrice;
  const change = live.change ?? stockDetail.change;
  const changePercent = live.changePercent ?? stockDetail.changePercent;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Link href="/screener" className="text-gray-500 hover:text-gray-300">
              Screener
            </Link>
            <span className="text-gray-600">/</span>
            <h1 className="text-2xl font-bold">{stock.symbol}</h1>
          </div>
          <p className="text-sm text-gray-400">
            {stock.name} &middot; {stock.sector} &middot; {stock.exchange}
          </p>
        </div>
        <div className="flex items-center gap-6">
          {lastPrice != null && (
            <div className="text-right">
              <p className="text-3xl font-bold">
                {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(lastPrice)}
              </p>
              {change != null && changePercent != null && (
                <p className={`text-sm font-medium ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {change >= 0 ? '+' : ''}{change.toFixed(2)} ({changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%)
                </p>
              )}
              <p className="mt-1 flex items-center justify-end gap-1 text-[10px] uppercase tracking-wide text-gray-500">
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    live.connected ? 'bg-green-500 animate-pulse' : 'bg-gray-600'
                  }`}
                />
                {live.connected ? `live · ${live.tickCount} ticks` : 'static'}
              </p>
            </div>
          )}
          {metrics && <ScoreGauge score={metrics.finalScore} />}
        </div>
      </div>

      {/* Chart */}
      {candles.length > 0 && <PriceChart candles={candles} lastPrice={lastPrice} />}

      {/* Metrics & Analysis */}
      {metrics && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <IndicatorPanel metrics={metrics} />
          <FundamentalsTable metrics={metrics} />
        </div>
      )}

      {/* AI Analysis */}
      <AIAnalysis analysis={analysis} symbol={symbol} />

      {/* Score Breakdown */}
      {metrics && (
        <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-400">Score Breakdown</h3>
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <ScoreItem label="Market" score={metrics.marketScore} weight="20%" />
            <ScoreItem label="Sector" score={metrics.sectorScore} weight="20%" />
            <ScoreItem label="Fundamental" score={metrics.fundamentalScore} weight="30%" />
            <ScoreItem label="Technical" score={metrics.technicalScore} weight="30%" />
          </div>
        </div>
      )}
    </div>
  );
}

function ScoreItem({ label, score, weight }: { label: string; score: number; weight: string }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-gray-400">
          {label} <span className="text-gray-600">({weight})</span>
        </span>
        <span className="font-medium">{score}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
