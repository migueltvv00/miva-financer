import { useCallback, useEffect, useMemo, useState } from 'react';
import { addMonths, format, startOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import { supabase } from '@/lib/supabase';
import { useBudgetStore } from '@/store/budgetStore';
import type { Budget } from '@/types';

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
}

function getMonthStart(date: Date) {
  return startOfMonth(date);
}

function getMonthKey(date: Date) {
  return format(getMonthStart(date), 'yyyy-MM-dd');
}

function getMonthLabel(date: Date) {
  const label = format(getMonthStart(date), 'LLLL yyyy', { locale: pt });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
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

  const [selectedMonth, setSelectedMonth] = useState(() => getMonthStart(new Date()));
  const [error, setError] = useState<string | null>(null);

  const monthKey = useMemo(() => getMonthKey(selectedMonth), [selectedMonth]);
  const monthLabel = useMemo(() => getMonthLabel(selectedMonth), [selectedMonth]);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setBudgets([]);
      setLoading(false);
      setError(null);
      return;
    }

    const loadBudgets = async () => {
      // Only show loading spinner on first load (no cached data)
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
    setSelectedMonth((currentMonth) => getMonthStart(addMonths(currentMonth, -1)));
  }, []);

  const goToNextMonth = useCallback(() => {
    setSelectedMonth((currentMonth) => getMonthStart(addMonths(currentMonth, 1)));
  }, []);

  const saveBudgetLimit = useCallback(
    async (categoryId: string, limitCents: number | null) => {
      if (!userId) {
        throw new Error('Sessão indisponível.');
      }

      setError(null);

      const existingBudget = budgets.find(
        (budget) => budget.category_id === categoryId
      );
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
    [
      addBudget,
      budgets,
      monthKey,
      removeBudget,
      setBudgets,
      updateBudget,
      userId,
    ]
  );

  const copyFromPreviousMonth = useCallback(async () => {
    if (!userId) {
      throw new Error('Sessão indisponível.');
    }

    setError(null);
    const previousBudgets = budgets;
    const previousMonthKey = getMonthKey(addMonths(selectedMonth, -1));

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

      const existingCategoryIds = new Set(
        previousBudgets.map((budget) => budget.category_id)
      );
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
  }, [budgets, monthKey, selectedMonth, setBudgets, userId]);

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
  };
}
