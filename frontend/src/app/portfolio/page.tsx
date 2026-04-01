'use client';

import { useEffect, useState } from 'react';
import { usePortfolioStore } from '@/stores/portfolio.store';
import HoldingsTable from '@/components/portfolio/HoldingsTable';
import PnLSummary from '@/components/portfolio/PnLSummary';
import AddHoldingModal from '@/components/portfolio/AddHoldingModal';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function PortfolioPage() {
  const { holdings, summary, isLoading, fetchPortfolio } = usePortfolioStore();
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolio</h1>
        <button
          onClick={() => setShowAddModal(true)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + Add Holding
        </button>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <>
          {summary && <PnLSummary summary={summary} />}
          <HoldingsTable holdings={holdings} />
        </>
      )}

      <AddHoldingModal isOpen={showAddModal} onClose={() => setShowAddModal(false)} />
    </div>
  );
}
