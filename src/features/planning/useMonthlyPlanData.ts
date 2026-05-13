import { useCallback, useEffect, useMemo, useState } from 'react';
import { getPeriodStart, getPeriodKey, getPeriodLabel, getNextPeriod, getPreviousPeriod } from '@/lib/periodUtils';
import { supabase } from '@/lib/supabase';
import { useMonthlyPlanStore } from '@/store/monthlyPlanStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Budget, MonthlyPlan } from '@/types';

interface UseMonthlyPlanDataResult {
  plan: MonthlyPlan | null;
  isLoading: boolean;
  error: string | null;
  selectedMonth: Date;
  monthLabel: string;
  monthKey: string;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  saveExpectedIncome: (cents: number) => Promise<void>;
  saveNotes: (notes: string | null) => Promise<void>;
  copyPlanToNextMonth: () => Promise<void>;
}

function createOptimisticPlan(
  userId: string,
  monthKey: string,
  currentPlan: MonthlyPlan | null,
  updates: Pick<MonthlyPlan, 'expected_income_cents' | 'notes'>
): MonthlyPlan {
  return {
    id: currentPlan?.id ?? crypto.randomUUID(),
    user_id: userId,
    month: monthKey,
    expected_income_cents: updates.expected_income_cents,
    notes: updates.notes,
    created_at: currentPlan?.created_at ?? new Date().toISOString(),
  };
}

export function useMonthlyPlanData(
  userId: string | null | undefined
): UseMonthlyPlanDataResult {
  const plan = useMonthlyPlanStore((state) => state.plan);
  const isLoading = useMonthlyPlanStore((state) => state.isLoading);
  const setPlan = useMonthlyPlanStore((state) => state.setPlan);
  const setLoading = useMonthlyPlanStore((state) => state.setLoading);
  const monthStartDay = useSettingsStore((state) => state.settings.monthStartDay);

  const [selectedMonth, setSelectedMonth] = useState(() => getPeriodStart(new Date(), monthStartDay));
  const [error, setError] = useState<string | null>(null);

  const monthKey = useMemo(() => getPeriodKey(selectedMonth, monthStartDay), [selectedMonth, monthStartDay]);
  const monthLabel = useMemo(() => getPeriodLabel(selectedMonth, monthStartDay), [selectedMonth, monthStartDay]);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setPlan(null);
      setLoading(false);
      setError(null);
      return;
    }

    const loadPlan = async () => {
      if (!useMonthlyPlanStore.getState().plan) setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('monthly_plans')
          .select('*')
          .eq('user_id', userId)
          .eq('month', monthKey)
          .maybeSingle();

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive) {
          return;
        }

        setPlan((data ?? null) as MonthlyPlan | null);
      } catch (err) {
        console.error('Erro ao carregar plano mensal:', err);

        if (!isActive) {
          return;
        }

        setPlan(null);
        setError('Não foi possível carregar o plano mensal.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadPlan();

    return () => {
      isActive = false;
    };
  }, [monthKey, setLoading, setPlan, userId]);

  const goToPreviousMonth = useCallback(() => {
    setSelectedMonth((currentMonth) => getPreviousPeriod(currentMonth, monthStartDay));
  }, [monthStartDay]);

  const goToNextMonth = useCallback(() => {
    setSelectedMonth((currentMonth) => getNextPeriod(currentMonth, monthStartDay));
  }, [monthStartDay]);

  const saveExpectedIncome = useCallback(
    async (cents: number) => {
      if (!userId) {
        throw new Error('Sessão indisponível.');
      }

      const previousPlan = plan;
      const optimisticPlan = createOptimisticPlan(userId, monthKey, previousPlan, {
        expected_income_cents: cents,
        notes: previousPlan?.notes ?? null,
      });

      setPlan(optimisticPlan);
      setError(null);

      try {
        const { data, error: upsertError } = await supabase
          .from('monthly_plans')
          .upsert(
            {
              user_id: userId,
              month: monthKey,
              expected_income_cents: cents,
              notes: previousPlan?.notes ?? null,
            },
            { onConflict: 'user_id,month' }
          )
          .select()
          .single();

        if (upsertError) {
          throw upsertError;
        }

        setPlan(data as MonthlyPlan);
      } catch (err) {
        console.error('Erro ao guardar rendimento esperado:', err);
        setPlan(previousPlan);
        setError('Não foi possível guardar o rendimento esperado.');
      }
    },
    [monthKey, plan, setPlan, userId]
  );

  const saveNotes = useCallback(
    async (notes: string | null) => {
      if (!userId) {
        throw new Error('Sessão indisponível.');
      }

      const previousPlan = plan;
      const optimisticPlan = createOptimisticPlan(userId, monthKey, previousPlan, {
        expected_income_cents: previousPlan?.expected_income_cents ?? 0,
        notes,
      });

      setPlan(optimisticPlan);
      setError(null);

      try {
        const { data, error: upsertError } = await supabase
          .from('monthly_plans')
          .upsert(
            {
              user_id: userId,
              month: monthKey,
              expected_income_cents: previousPlan?.expected_income_cents ?? 0,
              notes,
            },
            { onConflict: 'user_id,month' }
          )
          .select()
          .single();

        if (upsertError) {
          throw upsertError;
        }

        setPlan(data as MonthlyPlan);
      } catch (err) {
        console.error('Erro ao guardar notas do plano:', err);
        setPlan(previousPlan);
        setError('Não foi possível guardar as notas do plano.');
      }
    },
    [monthKey, plan, setPlan, userId]
  );

  const copyPlanToNextMonth = useCallback(async () => {
    if (!userId) {
      throw new Error('Sessão indisponível.');
    }

    const nextMonthKey = getPeriodKey(getNextPeriod(selectedMonth, monthStartDay), monthStartDay);

    setError(null);

    try {
      const { data: sourceBudgets, error: fetchError } = await supabase
        .from('budgets')
        .select('category_id, limit_cents')
        .eq('user_id', userId)
        .eq('month', monthKey);

      if (fetchError) {
        throw fetchError;
      }

      const { error: planUpsertError } = await supabase
        .from('monthly_plans')
        .upsert(
          {
            user_id: userId,
            month: nextMonthKey,
            expected_income_cents: plan?.expected_income_cents ?? 0,
          },
          { onConflict: 'user_id,month' }
        );

      if (planUpsertError) {
        throw planUpsertError;
      }

      const budgetsToCopy = ((sourceBudgets ?? []) as Array<
        Pick<Budget, 'category_id' | 'limit_cents'>
      >).map((budget) => ({
        user_id: userId,
        category_id: budget.category_id,
        month: nextMonthKey,
        limit_cents: budget.limit_cents,
      }));

      if (budgetsToCopy.length > 0) {
        const { error: budgetUpsertError } = await supabase
          .from('budgets')
          .upsert(budgetsToCopy, { onConflict: 'user_id,category_id,month' });

        if (budgetUpsertError) {
          throw budgetUpsertError;
        }
      }
    } catch (err) {
      console.error('Erro ao copiar plano mensal:', err);
      setError('Não foi possível copiar o plano para o próximo mês.');
    }
  }, [monthKey, plan?.expected_income_cents, selectedMonth, userId]);

  return {
    plan,
    isLoading,
    error,
    selectedMonth,
    monthLabel,
    monthKey,
    goToPreviousMonth,
    goToNextMonth,
    saveExpectedIncome,
    saveNotes,
    copyPlanToNextMonth,
  };
}
