'use client';

import { create } from 'zustand';
import api from '@/lib/api';
import { MarketStatus, SectorRanking, StockMetric } from '@/types';

interface MarketStore {
  marketStatus: MarketStatus | null;
  sectors: SectorRanking[];
  topPicks: StockMetric[];
  isLoading: boolean;
  error: string | null;
  fetchMarketStatus: () => Promise<void>;
  fetchSectors: () => Promise<void>;
  fetchTopPicks: () => Promise<void>;
}

export const useMarketStore = create<MarketStore>((set) => ({
  marketStatus: null,
  sectors: [],
  topPicks: [],
  isLoading: false,
  error: null,

  fetchMarketStatus: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get('/market/status');
      set({ marketStatus: data.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchSectors: async () => {
    try {
      const { data } = await api.get('/market/sectors');
      set({ sectors: data.data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  fetchTopPicks: async () => {
    try {
      const { data } = await api.get('/stocks/screener', {
        params: { sortBy: 'finalScore', sortOrder: 'desc', limit: 5 },
      });
      set({ topPicks: data.data });
    } catch (error: any) {
      set({ error: error.message });
    }
  },
}));
