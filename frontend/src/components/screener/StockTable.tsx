'use client';

import Link from 'next/link';
import { StockMetric } from '@/types';
import { getScoreColor, getRecommendationColor } from '@/lib/format';

interface StockTableProps {
  stocks: StockMetric[];
  pagination?: { page: number; total: number; totalPages: number } | null;
  onPageChange?: (page: number) => void;
}

export default function StockTable({ stocks, pagination, onPageChange }: StockTableProps) {
  if (stocks.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-500">
        No stocks found matching your filters. Try adjusting the criteria or run the data pipeline.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-800 bg-gray-800/50 text-xs text-gray-400">
          <tr>
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3">Sector</th>
            <th className="px-4 py-3 text-right">Final Score</th>
            <th className="px-4 py-3 text-right">Technical</th>
            <th className="px-4 py-3 text-right">Fundamental</th>
            <th className="px-4 py-3 text-right">RSI</th>
            <th className="px-4 py-3 text-center">Trend</th>
            <th className="px-4 py-3 text-center">Signal</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {stocks.map((stock) => (
            <tr key={stock.symbol} className="transition-colors hover:bg-gray-800/30">
              <td className="px-4 py-3">
                <Link
                  href={`/stock/${stock.symbol}`}
                  className="font-medium text-blue-400 hover:text-blue-300"
                >
                  {stock.symbol}
                </Link>
              </td>
              <td className="px-4 py-3 text-gray-400">{stock.stockInfo?.sector || '-'}</td>
              <td className="px-4 py-3 text-right">
                <span className="flex items-center justify-end gap-1">
                  <div className={`h-2 w-2 rounded-full ${getScoreColor(stock.finalScore)}`} />
                  <span className="font-medium">{stock.finalScore}</span>
                </span>
              </td>
              <td className="px-4 py-3 text-right text-gray-300">{stock.technicalScore}</td>
              <td className="px-4 py-3 text-right text-gray-300">{stock.fundamentalScore}</td>
              <td className="px-4 py-3 text-right text-gray-300">{stock.rsi14?.toFixed(1)}</td>
              <td className="px-4 py-3 text-center">
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    stock.trendDirection === 'UP'
                      ? 'bg-green-500/20 text-green-400'
                      : stock.trendDirection === 'DOWN'
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {stock.trendDirection}
                </span>
              </td>
              <td className="px-4 py-3 text-center">
                {stock.isBreakout && (
                  <span className="rounded bg-purple-500/20 px-2 py-0.5 text-xs text-purple-400">
                    BREAKOUT
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-gray-800 px-4 py-3">
          <span className="text-xs text-gray-500">
            Showing {stocks.length} of {pagination.total} stocks
          </span>
          <div className="flex gap-1">
            {Array.from({ length: Math.min(pagination.totalPages, 5) }, (_, i) => i + 1).map(
              (page) => (
                <button
                  key={page}
                  onClick={() => onPageChange?.(page)}
                  className={`rounded px-3 py-1 text-xs ${
                    page === pagination.page
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {page}
                </button>
              )
            )}
          </div>
        </div>
      )}
    </div>
  );
}
