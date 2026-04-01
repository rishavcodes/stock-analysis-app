'use client';

import { useMarketStore } from '@/stores/market.store';
import { getScoreColor } from '@/lib/format';

export default function SectorHeatmap() {
  const { sectors } = useMarketStore();

  if (sectors.length === 0) {
    return (
      <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
        <h2 className="mb-3 text-lg font-semibold">Sector Performance</h2>
        <p className="text-sm text-gray-500">No sector data available. Run metric computation to populate.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h2 className="mb-3 text-lg font-semibold">Sector Performance</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sectors.map((s) => (
          <div
            key={s.sector}
            className="rounded-md border border-gray-700/50 bg-gray-800/50 p-3 transition-colors hover:border-gray-600"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-gray-300">{s.sector}</span>
              <div className={`h-2 w-2 rounded-full ${getScoreColor(s.sectorScore)}`} />
            </div>
            <div className="mt-1 text-lg font-bold">{s.sectorScore}</div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{s.stockCount} stocks</span>
              <span>
                {s.advances}A / {s.declines}D
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
