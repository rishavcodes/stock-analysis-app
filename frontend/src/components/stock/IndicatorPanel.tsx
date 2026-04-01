import { StockMetric } from '@/types';
import { formatINR } from '@/lib/format';

export default function IndicatorPanel({ metrics }: { metrics: StockMetric }) {
  const rsiColor =
    metrics.rsi14 > 70 ? 'text-red-400' : metrics.rsi14 < 30 ? 'text-green-400' : 'text-yellow-400';

  const macdSignal =
    metrics.macdHistogram > 0 ? 'text-green-400' : 'text-red-400';

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-400">Technical Indicators</h3>
      <div className="grid grid-cols-2 gap-3">
        {/* RSI */}
        <div className="rounded-md bg-gray-800/50 p-3">
          <span className="text-xs text-gray-500">RSI (14)</span>
          <div className={`text-xl font-bold ${rsiColor}`}>{metrics.rsi14.toFixed(1)}</div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-700">
            <div
              className={`h-full rounded-full ${
                metrics.rsi14 > 70 ? 'bg-red-500' : metrics.rsi14 < 30 ? 'bg-green-500' : 'bg-yellow-500'
              }`}
              style={{ width: `${metrics.rsi14}%` }}
            />
          </div>
          <div className="mt-1 flex justify-between text-xs text-gray-600">
            <span>Oversold</span>
            <span>Overbought</span>
          </div>
        </div>

        {/* MACD */}
        <div className="rounded-md bg-gray-800/50 p-3">
          <span className="text-xs text-gray-500">MACD</span>
          <div className={`text-xl font-bold ${macdSignal}`}>
            {metrics.macdHistogram > 0 ? 'Bullish' : 'Bearish'}
          </div>
          <div className="mt-1 space-y-0.5 text-xs text-gray-500">
            <div>Line: {metrics.macdLine.toFixed(2)}</div>
            <div>Signal: {metrics.macdSignal.toFixed(2)}</div>
          </div>
        </div>

        {/* Moving Averages */}
        <div className="rounded-md bg-gray-800/50 p-3">
          <span className="text-xs text-gray-500">Moving Averages</span>
          <div className="mt-1 space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-500">SMA 20</span>
              <span>{formatINR(metrics.sma20)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">SMA 50</span>
              <span>{formatINR(metrics.sma50)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">SMA 200</span>
              <span>{formatINR(metrics.sma200)}</span>
            </div>
          </div>
        </div>

        {/* Volume */}
        <div className="rounded-md bg-gray-800/50 p-3">
          <span className="text-xs text-gray-500">Volume Analysis</span>
          <div className="mt-1 text-xl font-bold">
            {metrics.volumeRatio.toFixed(1)}x
          </div>
          <span className="text-xs text-gray-500">vs 20-day avg</span>
          <div className="mt-1 text-xs">
            {metrics.isBreakout && (
              <span className="rounded bg-purple-500/20 px-1.5 py-0.5 text-purple-400">
                {metrics.breakoutType} Breakout
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
