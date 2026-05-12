import { create } from 'zustand';
import type { IncomeSource } from '@/types';

interface IncomeSourceState {
  sources: IncomeSource[];
  isLoading: boolean;
  setSources: (sources: IncomeSource[]) => void;
  addSource: (source: IncomeSource) => void;
  updateSource: (id: string, updates: Partial<IncomeSource>) => void;
  removeSource: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useIncomeSourceStore = create<IncomeSourceState>((set) => ({
  sources: [],
  isLoading: false,
  setSources: (sources) => set({ sources }),
  addSource: (source) =>
    set((state) => ({ sources: [...state.sources, source] })),
  updateSource: (id, updates) =>
    set((state) => ({
      sources: state.sources.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      ),
    })),
  removeSource: (id) =>
    set((state) => ({
      sources: state.sources.filter((s) => s.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
