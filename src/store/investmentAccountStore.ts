import { create } from 'zustand';
import type { InvestmentAccount } from '@/types';

interface InvestmentAccountState {
  accounts: InvestmentAccount[];
  isLoading: boolean;
  setAccounts: (accounts: InvestmentAccount[]) => void;
  addAccount: (account: InvestmentAccount) => void;
  updateAccount: (id: string, updates: Partial<InvestmentAccount>) => void;
  removeAccount: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

function sortAccounts(accounts: InvestmentAccount[]) {
  return [...accounts].sort((left, right) => {
    const nameComparison = left.name.localeCompare(right.name, 'pt-PT');

    if (nameComparison !== 0) {
      return nameComparison;
    }

    return left.created_at.localeCompare(right.created_at);
  });
}

export const useInvestmentAccountStore = create<InvestmentAccountState>((set) => ({
  accounts: [],
  isLoading: false,
  setAccounts: (accounts) => set({ accounts: sortAccounts(accounts) }),
  addAccount: (account) =>
    set((state) => ({
      accounts: sortAccounts([...state.accounts, account]),
    })),
  updateAccount: (id, updates) =>
    set((state) => ({
      accounts: sortAccounts(
        state.accounts.map((account) =>
          account.id === id ? { ...account, ...updates } : account
        )
      ),
    })),
  removeAccount: (id) =>
    set((state) => ({
      accounts: state.accounts.filter((account) => account.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));
