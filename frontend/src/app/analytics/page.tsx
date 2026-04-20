'use client';

import { useEffect, useState } from 'react';
import { AccuracyResponse, useStockStore } from '@/stores/stock.store';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

type GroupBy = 'recommendation' | 'sector' | 'month' | 'timeHorizon';

export default function AnalyticsPage() {
  const { fetchAccuracy } = useStockStore();
  const [data, setData] = useState<AccuracyResponse | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('recommendation');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetchAccuracy({ groupBy }).then((res) => {
      if (!cancelled) {
        setData(res);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [fetchAccuracy, groupBy]);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Prediction Accuracy</h1>

      {loading ? (
        <LoadingSpinner />
      ) : !data ? (
        <p className="text-sm text-gray-500">Failed to load accuracy data.</p>
      ) : data.overall.total === 0 ? (
        <p className="text-sm text-gray-500">
          No evaluated predictions yet. The evaluator runs daily at 6 PM IST and only grades predictions whose time horizon has elapsed.
        </p>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard label="Total graded" value={data.overall.total.toString()} />
            <StatCard label="Win rate" value={`${(data.overall.winRate * 100).toFixed(1)}%`} />
            <StatCard label="Avg return" value={`${data.overall.avgReturnPct.toFixed(2)}%`} />
            <StatCard
              label="W / L / N / U"
              value={`${data.overall.win} / ${data.overall.loss} / ${data.overall.neutral} / ${data.overall.unevaluable}`}
            />
          </section>

          <section>
            <div className="mb-2 flex items-center gap-2">
              <label className="text-sm text-gray-400">Group by:</label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="rounded-md border border-gray-800 bg-gray-900 px-2 py-1 text-sm text-white"
              >
                <option value="recommendation">Recommendation</option>
                <option value="sector">Sector</option>
                <option value="month">Month</option>
                <option value="timeHorizon">Horizon</option>
              </select>
            </div>
            <div className="overflow-hidden rounded-lg border border-gray-800">
              <table className="w-full text-sm">
                <thead className="bg-gray-900 text-xs uppercase text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Bucket</th>
                    <th className="px-3 py-2 text-right">Total</th>
                    <th className="px-3 py-2 text-right">Win</th>
                    <th className="px-3 py-2 text-right">Loss</th>
                    <th className="px-3 py-2 text-right">Win rate</th>
                    <th className="px-3 py-2 text-right">Avg return</th>
                  </tr>
                </thead>
                <tbody>
                  {data.breakdowns.map((b) => (
                    <tr key={b.key} className="border-t border-gray-800 text-gray-300">
                      <td className="px-3 py-2 font-medium">{b.key}</td>
                      <td className="px-3 py-2 text-right">{b.total}</td>
                      <td className="px-3 py-2 text-right text-green-400">{b.win}</td>
                      <td className="px-3 py-2 text-right text-red-400">{b.loss}</td>
                      <td className="px-3 py-2 text-right">{(b.winRate * 100).toFixed(1)}%</td>
                      <td className="px-3 py-2 text-right">{b.avgReturnPct.toFixed(2)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  );
}
