'use client';

import { create } from 'zustand';
import api from '@/lib/api';
import { Alert } from '@/types';

interface AlertStore {
  alerts: Alert[];
  isLoading: boolean;
  error: string | null;
  fetchAlerts: (activeOnly?: boolean) => Promise<void>;
  createAlert: (data: {
    symbol: string;
    type: string;
    threshold: number;
    message?: string;
  }) => Promise<void>;
  deleteAlert: (id: string) => Promise<void>;
}

export const useAlertStore = create<AlertStore>((set, get) => ({
  alerts: [],
  isLoading: false,
  error: null,

  fetchAlerts: async (activeOnly) => {
    set({ isLoading: true, error: null });
    try {
      const params: Record<string, string> = {};
      if (activeOnly !== undefined) params.active = activeOnly.toString();
      const { data } = await api.get('/alerts', { params });
      set({ alerts: data.data, isLoading: false });
    } catch (error: any) {
      set({ error: error.message, isLoading: false });
    }
  },

  createAlert: async (alertData) => {
    try {
      await api.post('/alerts', alertData);
      await get().fetchAlerts();
    } catch (error: any) {
      set({ error: error.message });
    }
  },

  deleteAlert: async (id) => {
    try {
      await api.delete(`/alerts/${id}`);
      await get().fetchAlerts();
    } catch (error: any) {
      set({ error: error.message });
    }
  },
}));
