import { create } from 'zustand';
import type { NetWorthItem } from '@/types';

interface NetWorthItemState {
  items: NetWorthItem[];
  isLoading: boolean;
  setItems: (items: NetWorthItem[]) => void;
  addItem: (item: NetWorthItem) => void;
  updateItem: (id: string, updates: Partial<NetWorthItem>) => void;
  removeItem: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useNetWorthItemStore = create<NetWorthItemState>((set) => ({
  items: [],
  isLoading: false,
  setItems: (items) => set({ items }),
  addItem: (item) =>
    set((state) => ({
      items: [...state.items, item],
    })),
  updateItem: (id, updates) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),
  removeItem: (id) =>
    set((state) => ({
      items: state.items.filter((item) => item.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
