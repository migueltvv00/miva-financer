import { create } from 'zustand';
import type { Instalment } from '@/types';

interface InstalmentState {
  instalments: Instalment[];
  isLoading: boolean;
  setInstalments: (items: Instalment[]) => void;
  addInstalment: (item: Instalment) => void;
  updateInstalment: (id: string, updates: Partial<Instalment>) => void;
  removeInstalment: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

function isActiveInstalment(instalment: Instalment) {
  return instalment.paid_instalments < instalment.num_instalments;
}

function sortInstalments(instalments: Instalment[]) {
  return [...instalments].sort((left, right) => {
    const leftActiveOrder = isActiveInstalment(left) ? 0 : 1;
    const rightActiveOrder = isActiveInstalment(right) ? 0 : 1;

    if (leftActiveOrder !== rightActiveOrder) {
      return leftActiveOrder - rightActiveOrder;
    }

    if (left.start_month !== right.start_month) {
      return left.start_month.localeCompare(right.start_month);
    }

    return right.created_at.localeCompare(left.created_at);
  });
}

function upsertInstalment(instalments: Instalment[], instalment: Instalment) {
  return sortInstalments([
    instalment,
    ...instalments.filter((item) => item.id !== instalment.id),
  ]);
}

export const useInstalmentStore = create<InstalmentState>((set) => ({
  instalments: [],
  isLoading: false,
  setInstalments: (instalments) => set({ instalments: sortInstalments(instalments) }),
  addInstalment: (instalment) =>
    set((state) => ({
      instalments: upsertInstalment(state.instalments, instalment),
    })),
  updateInstalment: (id, updates) =>
    set((state) => {
      const currentInstalment = state.instalments.find((instalment) => instalment.id === id);

      return {
        instalments: currentInstalment
          ? upsertInstalment(state.instalments, { ...currentInstalment, ...updates })
          : state.instalments,
      };
    }),
  removeInstalment: (id) =>
    set((state) => ({
      instalments: state.instalments.filter((instalment) => instalment.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
