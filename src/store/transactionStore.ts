import { create } from 'zustand';
import type { Transaction } from '@/types';

interface TransactionState {
  transactions: Transaction[];
  trendTransactions: Transaction[];
  isLoading: boolean;
  isLoadingTrendTransactions: boolean;
  error: string | null; // #10: surface fetch errors instead of silently swallowing them
  setTransactions: (transactions: Transaction[]) => void;
  setTrendTransactions: (transactions: Transaction[]) => void;
  addTransaction: (transaction: Transaction) => void;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  setLoading: (loading: boolean) => void;
  setTrendTransactionsLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

function sortTransactions(transactions: Transaction[]) {
  return [...transactions].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date);
    }

    return right.created_at.localeCompare(left.created_at);
  });
}

function upsertTransaction(transactions: Transaction[], transaction: Transaction) {
  return sortTransactions([
    transaction,
    ...transactions.filter((item) => item.id !== transaction.id),
  ]);
}

export const useTransactionStore = create<TransactionState>((set) => ({
  transactions: [],
  trendTransactions: [],
  isLoading: false,
  isLoadingTrendTransactions: false,
  error: null,
  setTransactions: (transactions) => set({ transactions: sortTransactions(transactions) }),
  setTrendTransactions: (transactions) =>
    set({ trendTransactions: sortTransactions(transactions) }),
  addTransaction: (transaction) =>
    set((state) => ({
      transactions: upsertTransaction(state.transactions, transaction),
      trendTransactions: upsertTransaction(state.trendTransactions, transaction),
    })),
  updateTransaction: (id, updates) =>
    set((state) => {
      const currentTransaction = state.transactions.find((transaction) => transaction.id === id);
      const currentTrendTransaction = state.trendTransactions.find(
        (transaction) => transaction.id === id
      );

      return {
        transactions: currentTransaction
          ? upsertTransaction(state.transactions, { ...currentTransaction, ...updates })
          : state.transactions,
        trendTransactions: currentTrendTransaction
          ? upsertTransaction(state.trendTransactions, {
              ...currentTrendTransaction,
              ...updates,
            })
          : state.trendTransactions,
      };
    }),
  removeTransaction: (id) =>
    set((state) => ({
      transactions: state.transactions.filter((transaction) => transaction.id !== id),
      trendTransactions: state.trendTransactions.filter(
        (transaction) => transaction.id !== id
      ),
    })),
  setLoading: (isLoading) => set({ isLoading }),
  setTrendTransactionsLoading: (isLoadingTrendTransactions) =>
    set({ isLoadingTrendTransactions }),
  setError: (error) => set({ error }),
}));
