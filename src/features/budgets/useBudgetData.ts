import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  getPeriodStart,
  getPeriodKey,
  getPeriodLabel,
  getNextPeriod,
  getPeriodRange,
  getPreviousPeriod,
} from '@/lib/periodUtils';
import { supabase } from '@/lib/supabase';
import { useBudgetStore } from '@/store/budgetStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Budget, Transaction } from '@/types';

interface UseBudgetDataResult {
  budgets: Budget[];
  isLoading: boolean;
  error: string | null;
  selectedMonth: Date;
  monthLabel: string;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  saveBudgetLimit: (categoryId: string, limitCents: number | null) => Promise<void>;
  copyFromPreviousMonth: () => Promise<number>;
  rolloverBudgets: () => Promise<number>;
}

export function useBudgetData(
  userId: string | null | undefined
): UseBudgetDataResult {
  const budgets = useBudgetStore((state) => state.budgets);
  const isLoading = useBudgetStore((state) => state.isLoading);
  const setBudgets = useBudgetStore((state) => state.setBudgets);
  const addBudget = useBudgetStore((state) => state.addBudget);
  const updateBudget = useBudgetStore((state) => state.updateBudget);
  const removeBudget = useBudgetStore((state) => state.removeBudget);
  const setLoading = useBudgetStore((state) => state.setLoading);
  const monthStartDay = useSettingsStore((state) => state.settings.monthStartDay);

  const [selectedMonth, setSelectedMonth] = useState(() =>
    getPeriodStart(new Date(), monthStartDay)
  );
  const [error, setError] = useState<string | null>(null);

  const monthKey = useMemo(
    () => getPeriodKey(selectedMonth, monthStartDay),
    [selectedMonth, monthStartDay]
  );
  const monthLabel = useMemo(
    () => getPeriodLabel(selectedMonth, monthStartDay),
    [selectedMonth, monthStartDay]
  );

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setBudgets([]);
      setLoading(false);
      setError(null);
      return;
    }

    const loadBudgets = async () => {
      const store = useBudgetStore.getState();
      if (store.budgets.length === 0) setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('budgets')
          .select('*')
          .eq('user_id', userId)
          .eq('month', monthKey)
          .order('created_at', { ascending: true });

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive) {
          return;
        }

        setBudgets((data ?? []) as Budget[]);
      } catch (err) {
        console.error('Erro ao carregar orçamentos:', err);

        if (!isActive) {
          return;
        }

        setBudgets([]);
        setError('Não foi possível carregar os orçamentos.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadBudgets();

    return () => {
      isActive = false;
    };
  }, [monthKey, setBudgets, setLoading, userId]);

  const goToPreviousMonth = useCallback(() => {
    setSelectedMonth((currentMonth) => getPreviousPeriod(currentMonth, monthStartDay));
  }, [monthStartDay]);

  const goToNextMonth = useCallback(() => {
    setSelectedMonth((currentMonth) => getNextPeriod(currentMonth, monthStartDay));
  }, [monthStartDay]);

  const saveBudgetLimit = useCallback(
    async (categoryId: string, limitCents: number | null) => {
      if (!userId) {
        throw new Error('Sessão indisponível.');
      }

      setError(null);

      const existingBudget = budgets.find((budget) => budget.category_id === categoryId);
      const previousBudgets = budgets;

      if (limitCents === null) {
        if (!existingBudget) {
          return;
        }

        removeBudget(existingBudget.id);

        try {
          const { error: deleteError } = await supabase
            .from('budgets')
            .delete()
            .eq('id', existingBudget.id)
            .eq('user_id', userId);

          if (deleteError) {
            throw deleteError;
          }
        } catch (err) {
          console.error('Erro ao eliminar orçamento:', err);
          setBudgets(previousBudgets);
          setError('Não foi possível eliminar o orçamento.');
          throw err;
        }

        return;
      }

      if (existingBudget) {
        updateBudget(existingBudget.id, { limit_cents: limitCents });

        try {
          const { error: updateError } = await supabase
            .from('budgets')
            .update({ limit_cents: limitCents })
            .eq('id', existingBudget.id)
            .eq('user_id', userId);

          if (updateError) {
            throw updateError;
          }
        } catch (err) {
          console.error('Erro ao atualizar orçamento:', err);
          setBudgets(previousBudgets);
          setError('Não foi possível atualizar o orçamento.');
          throw err;
        }

        return;
      }

      const optimisticBudget: Budget = {
        id: crypto.randomUUID(),
        user_id: userId,
        category_id: categoryId,
        month: monthKey,
        limit_cents: limitCents,
        rollover_cents: 0,
        created_at: new Date().toISOString(),
      };

      addBudget(optimisticBudget);

      try {
        const { data, error: insertError } = await supabase
          .from('budgets')
          .insert({
            id: optimisticBudget.id,
            user_id: optimisticBudget.user_id,
            category_id: optimisticBudget.category_id,
            month: optimisticBudget.month,
            limit_cents: optimisticBudget.limit_cents,
            rollover_cents: optimisticBudget.rollover_cents,
          })
          .select()
          .single();

        if (insertError) {
          throw insertError;
        }

        updateBudget(optimisticBudget.id, data as Budget);
      } catch (err) {
        console.error('Erro ao criar orçamento:', err);
        setBudgets(previousBudgets);
        setError('Não foi possível criar o orçamento.');
        throw err;
      }
    },
    [addBudget, budgets, monthKey, removeBudget, setBudgets, updateBudget, userId]
  );

  const copyFromPreviousMonth = useCallback(async () => {
    if (!userId) {
      throw new Error('Sessão indisponível.');
    }

    setError(null);
    const previousBudgets = budgets;
    const previousMonthKey = getPeriodKey(
      getPreviousPeriod(selectedMonth, monthStartDay),
      monthStartDay
    );

    try {
      const { data: sourceBudgets, error: fetchError } = await supabase
        .from('budgets')
        .select('*')
        .eq('user_id', userId)
        .eq('month', previousMonthKey)
        .order('created_at', { ascending: true });

      if (fetchError) {
        throw fetchError;
      }

      const existingCategoryIds = new Set(previousBudgets.map((budget) => budget.category_id));
      const budgetsToCopy = ((sourceBudgets ?? []) as Budget[]).filter(
        (budget) => !existingCategoryIds.has(budget.category_id)
      );

      if (budgetsToCopy.length === 0) {
        return 0;
      }

      const optimisticBudgets: Budget[] = budgetsToCopy.map((budget) => ({
        ...budget,
        id: crypto.randomUUID(),
        user_id: userId,
        month: monthKey,
        rollover_cents: 0,
        created_at: new Date().toISOString(),
      }));

      setBudgets([...previousBudgets, ...optimisticBudgets]);

      const { data: insertedBudgets, error: insertError } = await supabase
        .from('budgets')
        .insert(
          optimisticBudgets.map((budget) => ({
            id: budget.id,
            user_id: budget.user_id,
            category_id: budget.category_id,
            month: budget.month,
            limit_cents: budget.limit_cents,
            rollover_cents: budget.rollover_cents,
          }))
        )
        .select();

      if (insertError) {
        throw insertError;
      }

      setBudgets([...previousBudgets, ...((insertedBudgets ?? []) as Budget[])]);

      return insertedBudgets?.length ?? budgetsToCopy.length;
    } catch (err) {
      console.error('Erro ao copiar orçamentos:', err);
      setBudgets(previousBudgets);
      setError('Não foi possível copiar os orçamentos.');
      throw err;
    }
  }, [budgets, monthKey, monthStartDay, selectedMonth, setBudgets, userId]);

  const rolloverBudgets = useCallback(async () => {
    if (!userId) {
      throw new Error('Sessão indisponível.');
    }

    if (budgets.length === 0) {
      return 0;
    }

    setError(null);
    const previousBudgets = budgets;
    const previousPeriodDate = getPreviousPeriod(selectedMonth, monthStartDay);
    const previousMonthKey = getPeriodKey(previousPeriodDate, monthStartDay);
    const { periodStart: previousPeriodStart, periodEnd: previousPeriodEnd } = getPeriodRange(
      previousPeriodDate,
      monthStartDay
    );

    try {
      const [{ data: sourceBudgets, error: sourceError }, { data: spentTransactions, error: spentError }] =
        await Promise.all([
          supabase
            .from('budgets')
            .select('category_id, limit_cents')
            .eq('user_id', userId)
            .eq('month', previousMonthKey),
          supabase
            .from('transactions')
            .select('category_id, amount_cents')
            .eq('user_id', userId)
            .eq('type', 'expense')
            .gte('date', previousPeriodStart)
            .lt('date', previousPeriodEnd),
        ]);

      if (sourceError) {
        throw sourceError;
      }

      if (spentError) {
        throw spentError;
      }

      const previousBudgetMap = new Map(
        ((sourceBudgets ?? []) as Array<Pick<Budget, 'category_id' | 'limit_cents'>>).map(
          (budget) => [budget.category_id, budget.limit_cents]
        )
      );
      const spentByCategory = new Map<string, number>();

      ((spentTransactions ?? []) as Array<Pick<Transaction, 'category_id' | 'amount_cents'>>).forEach(
        (transaction) => {
          spentByCategory.set(
            transaction.category_id,
            (spentByCategory.get(transaction.category_id) ?? 0) + transaction.amount_cents
          );
        }
      );

      const optimisticBudgets = previousBudgets.map((budget) => {
        const previousLimitCents = previousBudgetMap.get(budget.category_id);
        const previousSpentCents = spentByCategory.get(budget.category_id) ?? 0;
        const rolloverCents =
          typeof previousLimitCents === 'number' ? previousLimitCents - previousSpentCents : 0;

        return {
          ...budget,
          rollover_cents: rolloverCents,
        } satisfies Budget;
      });

      setBudgets(optimisticBudgets);

      const { data: updatedBudgets, error: upsertError } = await supabase
        .from('budgets')
        .upsert(
          optimisticBudgets.map((budget) => ({
            id: budget.id,
            user_id: budget.user_id,
            category_id: budget.category_id,
            month: budget.month,
            limit_cents: budget.limit_cents,
            rollover_cents: budget.rollover_cents,
          })),
          { onConflict: 'id' }
        )
        .select();

      if (upsertError) {
        throw upsertError;
      }

      setBudgets((updatedBudgets ?? optimisticBudgets) as Budget[]);
      return optimisticBudgets.length;
    } catch (err) {
      console.error('Erro ao importar rollover:', err);
      setBudgets(previousBudgets);
      setError('Não foi possível importar o rollover.');
      throw err;
    }
  }, [budgets, monthStartDay, selectedMonth, setBudgets, userId]);

  return {
    budgets,
    isLoading,
    error,
    selectedMonth,
    monthLabel,
    goToPreviousMonth,
    goToNextMonth,
    saveBudgetLimit,
    copyFromPreviousMonth,
    rolloverBudgets,
  };
}
