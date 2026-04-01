'use client';

import { create } from 'zustand';
import api from '@/lib/api';
import { Holding, PortfolioSummary } from '@/types';

interface PortfolioStore {
  holdings: Holding[];
  summary: PortfolioSummary | null;
  isLoading: boolean;
  error: string | null;
  fetchPortfolio: () => Promise<void>;
  addHolding: (data: {
    symbol: string;
    quantity: number;
    avgBuyPrice: number;
    buyDate: string;
    stopLoss?: number;
    targetPrice?: number;
    notes?: string;
  }) => Promise<void>;
  removeHolding: (id: string) => Promise<void>;
  exitHolding: (id: string, exitPrice: number) => Promise<void>;
}

export const usePortfolioStore = create<PortfolioStore>((set, get) => ({
  holdings: [],
  summary: null,
  isLoading: false,
  error: null,

  fetchPortfolio: async () => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get('/portfolio');
      set({ holdings: data.data.holdings, summary: data.data.summary, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  addHolding: async (holdingData) => {
    try {
      await api.post('/portfolio', holdingData);
      await get().fetchPortfolio();
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  removeHolding: async (id) => {
    try {
      await api.delete(`/portfolio/${id}`);
      await get().fetchPortfolio();
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  exitHolding: async (id, exitPrice) => {
    try {
      await api.post(`/portfolio/${id}/exit`, { exitPrice });
      await get().fetchPortfolio();
    } catch (error: any) {
      set({ error: error.message });
    }
  },
}));
