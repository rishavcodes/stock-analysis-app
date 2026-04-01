'use client';

import { Holding } from '@/types';
import { formatINR, formatPercent, getChangeColor, formatDate } from '@/lib/format';
import { usePortfolioStore } from '@/stores/portfolio.store';

export default function HoldingsTable({ holdings }: { holdings: Holding[] }) {
  const { removeHolding, exitHolding } = usePortfolioStore();

  if (holdings.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-8 text-center text-sm text-gray-500">
        No holdings yet. Add your first stock to start tracking.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-gray-800 bg-gray-900">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-gray-800 bg-gray-800/50 text-xs text-gray-400">
          <tr>
            <th className="px-4 py-3">Symbol</th>
            <th className="px-4 py-3 text-right">Qty</th>
            <th className="px-4 py-3 text-right">Avg Price</th>
            <th className="px-4 py-3 text-right">Current</th>
            <th className="px-4 py-3 text-right">P&L</th>
            <th className="px-4 py-3 text-right">P&L %</th>
            <th className="px-4 py-3 text-right">Stop Loss</th>
            <th className="px-4 py-3 text-right">Target</th>
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-800/50">
          {holdings.map((h) => (
            <tr key={h._id} className="hover:bg-gray-800/30">
              <td className="px-4 py-3 font-medium">{h.symbol}</td>
              <td className="px-4 py-3 text-right text-gray-300">{h.quantity}</td>
              <td className="px-4 py-3 text-right">{formatINR(h.avgBuyPrice)}</td>
              <td className="px-4 py-3 text-right">{formatINR(h.currentPrice)}</td>
              <td className={`px-4 py-3 text-right font-medium ${getChangeColor(h.pnl)}`}>
                {formatINR(h.pnl)}
              </td>
              <td className={`px-4 py-3 text-right ${getChangeColor(h.pnlPercent)}`}>
                {formatPercent(h.pnlPercent)}
              </td>
              <td className="px-4 py-3 text-right text-gray-400">
                {h.stopLoss ? formatINR(h.stopLoss) : '-'}
              </td>
              <td className="px-4 py-3 text-right text-gray-400">
                {h.targetPrice ? formatINR(h.targetPrice) : '-'}
              </td>
              <td className="px-4 py-3 text-center">
                <div className="flex justify-center gap-1">
                  <button
                    onClick={() => {
                      const price = prompt('Enter exit price:');
                      if (price) exitHolding(h._id, Number(price));
                    }}
                    className="rounded px-2 py-1 text-xs text-yellow-400 hover:bg-gray-800"
                  >
                    Exit
                  </button>
                  <button
                    onClick={() => removeHolding(h._id)}
                    className="rounded px-2 py-1 text-xs text-red-400 hover:bg-gray-800"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
