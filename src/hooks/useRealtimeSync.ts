import { useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { getPeriodKey, getPeriodRange } from '@/lib/periodUtils';
import { useBudgetStore } from '@/store/budgetStore';
import { useTransactionStore } from '@/store/transactionStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Budget, Transaction } from '@/types';

function isTransactionInPeriod(transaction: Partial<Transaction>, periodStart: string, periodEnd: string) {
  return typeof transaction.date === 'string' && transaction.date >= periodStart && transaction.date < periodEnd;
}

function isBudgetInMonth(budget: Partial<Budget>, monthKey: string) {
  return budget.month === monthKey;
}

function handleTransactionChange(
  payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> },
  periodStart: string,
  periodEnd: string
) {
  const { addTransaction, removeTransaction, updateTransaction, transactions } =
    useTransactionStore.getState();

  const nextTransaction = payload.new as Partial<Transaction>;
  const previousTransaction = payload.old as Partial<Transaction>;
  const recordId =
    typeof nextTransaction.id === 'string'
      ? nextTransaction.id
      : typeof previousTransaction.id === 'string'
        ? previousTransaction.id
        : null;

  if (!recordId) {
    return;
  }

  const existingTransaction = transactions.find(
    (transaction) => transaction.id === recordId
  );

  if (payload.eventType === 'DELETE') {
    removeTransaction(recordId);
    return;
  }

  if (!isTransactionInPeriod(nextTransaction, periodStart, periodEnd)) {
    if (existingTransaction) {
      removeTransaction(recordId);
    }
    return;
  }

  const transaction = nextTransaction as Transaction;

  if (existingTransaction) {
    updateTransaction(recordId, transaction);
    return;
  }

  addTransaction(transaction);
}

function handleBudgetChange(
  payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; new: Record<string, unknown>; old: Record<string, unknown> },
  monthKey: string
) {
  const { addBudget, removeBudget, updateBudget, budgets } = useBudgetStore.getState();

  const nextBudget = payload.new as Partial<Budget>;
  const previousBudget = payload.old as Partial<Budget>;
  const recordId =
    typeof nextBudget.id === 'string'
      ? nextBudget.id
      : typeof previousBudget.id === 'string'
        ? previousBudget.id
        : null;

  if (!recordId) {
    return;
  }

  const existingBudget = budgets.find((budget) => budget.id === recordId);

  if (payload.eventType === 'DELETE') {
    removeBudget(recordId);
    return;
  }

  if (!isBudgetInMonth(nextBudget, monthKey)) {
    if (existingBudget) {
      removeBudget(recordId);
    }
    return;
  }

  const budget = nextBudget as Budget;

  if (existingBudget) {
    updateBudget(recordId, budget);
    return;
  }

  addBudget(budget);
}

export function useRealtimeSync(
  userId: string | null | undefined,
  selectedMonth: Date
) {
  // #8: Subscribe to monthStartDay reactively so the channel re-establishes
  // if the user changes their setting (previously read via getState(), which is non-reactive)
  const monthStartDay = useSettingsStore((s) => s.settings.monthStartDay);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const monthKey = getPeriodKey(selectedMonth, monthStartDay);
    const { periodStart, periodEnd } = getPeriodRange(selectedMonth, monthStartDay);

    const channel = supabase
      .channel(`dashboard-sync:${userId}:${monthKey}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'transactions',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          handleTransactionChange(
            payload as {
              eventType: 'INSERT' | 'UPDATE' | 'DELETE';
              new: Record<string, unknown>;
              old: Record<string, unknown>;
            },
            periodStart,
            periodEnd
          );
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'budgets',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          handleBudgetChange(
            payload as {
              eventType: 'INSERT' | 'UPDATE' | 'DELETE';
              new: Record<string, unknown>;
              old: Record<string, unknown>;
            },
            monthKey
          );
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [selectedMonth, userId, monthStartDay]);
}
