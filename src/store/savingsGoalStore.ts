import { create } from 'zustand';
import type { SavingsGoal } from '@/types';

interface SavingsGoalState {
  goals: SavingsGoal[];
  isLoading: boolean;
  setGoals: (goals: SavingsGoal[]) => void;
  addGoal: (goal: SavingsGoal) => void;
  updateGoal: (id: string, updates: Partial<SavingsGoal>) => void;
  removeGoal: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useSavingsGoalStore = create<SavingsGoalState>((set) => ({
  goals: [],
  isLoading: false,
  setGoals: (goals) => set({ goals }),
  addGoal: (goal) =>
    set((state) => ({ goals: [...state.goals, goal] })),
  updateGoal: (id, updates) =>
    set((state) => ({
      goals: state.goals.map((g) =>
        g.id === id ? { ...g, ...updates } : g
      ),
    })),
  removeGoal: (id) =>
    set((state) => ({
      goals: state.goals.filter((g) => g.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
