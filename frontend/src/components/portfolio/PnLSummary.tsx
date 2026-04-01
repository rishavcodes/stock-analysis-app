import { PortfolioSummary } from '@/types';
import { formatINR, formatPercent, getChangeColor } from '@/lib/format';

export default function PnLSummary({ summary }: { summary: PortfolioSummary }) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      <StatCard label="Total Invested" value={formatINR(summary.totalInvested)} />
      <StatCard label="Current Value" value={formatINR(summary.currentValue)} />
      <StatCard
        label="Total P&L"
        value={formatINR(summary.totalPnl)}
        colorClass={getChangeColor(summary.totalPnl)}
      />
      <StatCard
        label="Returns"
        value={formatPercent(summary.totalPnlPercent)}
        colorClass={getChangeColor(summary.totalPnlPercent)}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  colorClass = 'text-white',
}: {
  label: string;
  value: string;
  colorClass?: string;
}) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`mt-1 text-xl font-bold ${colorClass}`}>{value}</div>
    </div>
  );
}
