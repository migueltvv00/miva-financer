import { create } from 'zustand';
import type { MonthlyPlan } from '@/types';

interface MonthlyPlanState {
  plan: MonthlyPlan | null;
  isLoading: boolean;
  setPlan: (plan: MonthlyPlan | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useMonthlyPlanStore = create<MonthlyPlanState>((set) => ({
  plan: null,
  isLoading: false,
  setPlan: (plan) => set({ plan }),
  setLoading: (isLoading) => set({ isLoading }),
}));
