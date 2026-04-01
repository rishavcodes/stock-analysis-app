'use client';

import { useEffect } from 'react';
import { useStockStore } from '@/stores/stock.store';
import FilterBar from '@/components/screener/FilterBar';
import StockTable from '@/components/screener/StockTable';
import LoadingSpinner from '@/components/shared/LoadingSpinner';

export default function ScreenerPage() {
  const { screenerResults, screenerPagination, isLoading, fetchScreener } = useStockStore();

  useEffect(() => {
    fetchScreener({ sortBy: 'finalScore', sortOrder: 'desc', limit: 20 });
  }, [fetchScreener]);

  const handleFilter = (params: Record<string, any>) => {
    fetchScreener({ ...params, limit: 20, page: 1 });
  };

  const handlePageChange = (page: number) => {
    fetchScreener({ sortBy: 'finalScore', sortOrder: 'desc', limit: 20, page });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Stock Screener</h1>
      <FilterBar onFilter={handleFilter} />
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <StockTable
          stocks={screenerResults}
          pagination={screenerPagination}
          onPageChange={handlePageChange}
        />
      )}
    </div>
  );
}
