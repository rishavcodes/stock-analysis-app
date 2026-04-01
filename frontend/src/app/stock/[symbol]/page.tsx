'use client';

import { useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { useStockStore } from '@/stores/stock.store';
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
        {metrics && <ScoreGauge score={metrics.finalScore} />}
      </div>

      {/* Chart */}
      {candles.length > 0 && <PriceChart candles={candles} />}

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
