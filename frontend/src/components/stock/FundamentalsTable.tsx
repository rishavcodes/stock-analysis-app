import { StockMetric } from '@/types';
import { formatLargeNumber } from '@/lib/format';

export default function FundamentalsTable({ metrics }: { metrics: StockMetric }) {
  const rows = [
    { label: 'P/E Ratio', value: metrics.pe?.toFixed(2) ?? 'N/A' },
    { label: 'ROE', value: metrics.roe != null ? `${(metrics.roe * 100).toFixed(1)}%` : 'N/A' },
    { label: 'Debt/Equity', value: metrics.debtToEquity?.toFixed(2) ?? 'N/A' },
    { label: 'Revenue Growth (YoY)', value: metrics.revenueGrowthYoY != null ? `${(metrics.revenueGrowthYoY * 100).toFixed(1)}%` : 'N/A' },
    { label: 'Profit Margin', value: metrics.profitMargin != null ? `${(metrics.profitMargin * 100).toFixed(1)}%` : 'N/A' },
    { label: 'Market Cap', value: metrics.marketCap ? formatLargeNumber(metrics.marketCap) : 'N/A' },
  ];

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-400">Fundamentals</h3>
      <div className="space-y-2">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center justify-between border-b border-gray-800/50 pb-2 text-sm">
            <span className="text-gray-400">{row.label}</span>
            <span className="font-medium">{row.value}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex gap-4">
        <ScoreBar label="Fundamental" score={metrics.fundamentalScore} />
        <ScoreBar label="Technical" score={metrics.technicalScore} />
      </div>
    </div>
  );
}

function ScoreBar({ label, score }: { label: string; score: number }) {
  const color = score >= 70 ? 'bg-green-500' : score >= 40 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex-1">
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-gray-500">{label}</span>
        <span className="font-medium">{score}/100</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${score}%` }} />
      </div>
    </div>
  );
}
