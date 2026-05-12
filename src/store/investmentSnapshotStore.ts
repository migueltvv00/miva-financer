import { create } from 'zustand';
import type { InvestmentSnapshot } from '@/types';

interface InvestmentSnapshotState {
  snapshots: InvestmentSnapshot[];
  isLoading: boolean;
  setSnapshots: (snapshots: InvestmentSnapshot[]) => void;
  addSnapshot: (snapshot: InvestmentSnapshot) => void;
  updateSnapshot: (id: string, updates: Partial<InvestmentSnapshot>) => void;
  removeSnapshot: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

function sortSnapshots(snapshots: InvestmentSnapshot[]) {
  return [...snapshots].sort((left, right) => {
    if (left.month !== right.month) {
      return left.month.localeCompare(right.month);
    }

    if (left.account_id !== right.account_id) {
      return left.account_id.localeCompare(right.account_id);
    }

    return left.created_at.localeCompare(right.created_at);
  });
}

export const useInvestmentSnapshotStore = create<InvestmentSnapshotState>((set) => ({
  snapshots: [],
  isLoading: false,
  setSnapshots: (snapshots) => set({ snapshots: sortSnapshots(snapshots) }),
  addSnapshot: (snapshot) =>
    set((state) => ({
      snapshots: sortSnapshots([...state.snapshots, snapshot]),
    })),
  updateSnapshot: (id, updates) =>
    set((state) => ({
      snapshots: sortSnapshots(
        state.snapshots.map((snapshot) =>
          snapshot.id === id ? { ...snapshot, ...updates } : snapshot
        )
      ),
    })),
  removeSnapshot: (id) =>
    set((state) => ({
      snapshots: state.snapshots.filter((snapshot) => snapshot.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
