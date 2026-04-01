'use client';

import { useEffect } from 'react';
import { useMarketStore } from '@/stores/market.store';
import MarketOverview from '@/components/dashboard/MarketOverview';
import SectorHeatmap from '@/components/dashboard/SectorHeatmap';
import TopPicks from '@/components/dashboard/TopPicks';

export default function Dashboard() {
  const { fetchMarketStatus, fetchSectors, fetchTopPicks } = useMarketStore();

  useEffect(() => {
    fetchMarketStatus();
    fetchSectors();
    fetchTopPicks();
  }, [fetchMarketStatus, fetchSectors, fetchTopPicks]);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <MarketOverview />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <SectorHeatmap />
        <TopPicks />
      </div>
    </div>
  );
}
