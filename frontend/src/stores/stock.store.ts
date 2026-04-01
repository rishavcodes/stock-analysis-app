'use client';

import { create } from 'zustand';
import api from '@/lib/api';
import { StockDetail, StockMetric, Analysis } from '@/types';

interface StockStore {
  stockDetail: StockDetail | null;
  screenerResults: StockMetric[];
  screenerPagination: { page: number; total: number; totalPages: number } | null;
  isLoading: boolean;
  error: string | null;
  fetchStockDetail: (symbol: string) => Promise<void>;
  fetchScreener: (params: Record<string, any>) => Promise<void>;
  triggerAnalysis: (symbol: string, force?: boolean) => Promise<Analysis | null>;
}

export const useStockStore = create<StockStore>((set) => ({
  stockDetail: null,
  screenerResults: [],
  screenerPagination: null,
  isLoading: false,
  error: null,

  fetchStockDetail: async (symbol: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get(`/stocks/${symbol}`);
      set({ stockDetail: data.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  fetchScreener: async (params: Record<string, any>) => {
    set({ isLoading: true, error: null });
    try {
      const { data } = await api.get('/stocks/screener', { params });
      set({
        screenerResults: data.data,
        screenerPagination: data.pagination,
        isLoading: false,
      });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  triggerAnalysis: async (symbol: string, force = false) => {
    try {
      const { data } = await api.get(`/stocks/${symbol}/analysis`, {
        params: { force: force.toString() },
      });
      return data.data;
    } catch (error: any) {
      set({ error: error.message });
      return null;
    }
  },
}));
