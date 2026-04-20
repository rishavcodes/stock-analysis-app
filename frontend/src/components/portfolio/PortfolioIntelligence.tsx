'use client';

import { useEffect, useState } from 'react';
import api from '@/lib/api';

interface SectorRow {
  sector: string;
  value: number;
  pct: number;
}

interface Intelligence {
  sectorExposure: SectorRow[];
  portfolioRiskScore: number;
}

const MAX_SECTOR_PCT = 30;

export default function PortfolioIntelligence() {
  const [data, setData] = useState<Intelligence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .get('/portfolio/intelligence')
      .then((res) => {
        if (!cancelled) {
          setData(res.data.data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) return null;
  if (!data || data.sectorExposure.length === 0) return null;

  return (
    <div className="rounded-lg border border-gray-800 bg-gray-900 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-400">Portfolio intelligence</h3>
        <div className="text-xs text-gray-500">
          Risk score:{' '}
          <span className={data.portfolioRiskScore > 60 ? 'text-red-400' : data.portfolioRiskScore > 40 ? 'text-yellow-400' : 'text-green-400'}>
            {data.portfolioRiskScore}/100
          </span>
        </div>
      </div>

      <div className="space-y-2">
        {data.sectorExposure.map((row) => {
          const over = row.pct > MAX_SECTOR_PCT;
          return (
            <div key={row.sector}>
              <div className="mb-1 flex justify-between text-xs text-gray-400">
                <span className={over ? 'text-red-400' : ''}>{row.sector}</span>
                <span>{row.pct.toFixed(1)}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded bg-gray-800">
                <div
                  className={`h-full ${over ? 'bg-red-500' : 'bg-blue-500'}`}
                  style={{ width: `${Math.min(100, row.pct)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-gray-500">
        Cap per sector: {MAX_SECTOR_PCT}%. Over-exposed sectors are flagged in red.
      </p>
    </div>
  );
}
