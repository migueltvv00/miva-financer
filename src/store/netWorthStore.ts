import { create } from 'zustand';
import type { NetWorthEntry } from '@/types';

interface NetWorthState {
  entries: NetWorthEntry[];
  isLoading: boolean;
  setEntries: (entries: NetWorthEntry[]) => void;
  addEntry: (entry: NetWorthEntry) => void;
  updateEntry: (id: string, updates: Partial<NetWorthEntry>) => void;
  removeEntry: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useNetWorthStore = create<NetWorthState>((set) => ({
  entries: [],
  isLoading: false,
  setEntries: (entries) => set({ entries }),
  addEntry: (entry) =>
    set((state) => ({
      entries: [...state.entries, entry],
    })),
  updateEntry: (id, updates) =>
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, ...updates } : entry
      ),
    })),
  removeEntry: (id) =>
    set((state) => ({
      entries: state.entries.filter((entry) => entry.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
