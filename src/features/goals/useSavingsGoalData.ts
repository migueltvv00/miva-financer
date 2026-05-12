import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCategoryStore } from '@/store/categoryStore';
import { useSavingsGoalStore } from '@/store/savingsGoalStore';
import { useTransactionStore } from '@/store/transactionStore';
import type { SavingsGoal, Transaction } from '@/types';
import type { SavingsGoalFormValues } from './types';
import { getTodayDateValue } from './utils';

interface UseSavingsGoalDataResult {
  goals: SavingsGoal[];
  isLoading: boolean;
  error: string | null;
  createGoal: (values: SavingsGoalFormValues) => Promise<void>;
  updateGoal: (id: string, values: SavingsGoalFormValues) => Promise<void>;
  deleteGoal: (id: string) => Promise<void>;
  addFunds: (goalId: string, amountCents: number) => Promise<boolean>;
}

function getGoalRecordId(
  payload: { new: Record<string, unknown>; old: Record<string, unknown> }
) {
  const nextId = payload.new.id;
  if (typeof nextId === 'string') {
    return nextId;
  }

  const previousId = payload.old.id;
  return typeof previousId === 'string' ? previousId : null;
}

export function useSavingsGoalData(
  userId: string | null | undefined
): UseSavingsGoalDataResult {
  const goals = useSavingsGoalStore((state) => state.goals);
  const isLoading = useSavingsGoalStore((state) => state.isLoading);
  const setGoals = useSavingsGoalStore((state) => state.setGoals);
  const addGoal = useSavingsGoalStore((state) => state.addGoal);
  const updateGoalInStore = useSavingsGoalStore((state) => state.updateGoal);
  const removeGoal = useSavingsGoalStore((state) => state.removeGoal);
  const setLoading = useSavingsGoalStore((state) => state.setLoading);
  const categories = useCategoryStore((state) => state.categories);
  const addTransaction = useTransactionStore((state) => state.addTransaction);
  const removeTransaction = useTransactionStore((state) => state.removeTransaction);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setGoals([]);
      setLoading(false);
      setError(null);
      return;
    }

    const loadGoals = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('savings_goals')
          .select('*')
          .eq('user_id', userId)
          .order('is_complete', { ascending: true })
          .order('created_at', { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive) {
          return;
        }

        setGoals((data ?? []) as SavingsGoal[]);
      } catch (err) {
        console.error('Erro ao carregar objetivos de poupança:', err);

        if (!isActive) {
          return;
        }

        setGoals([]);
        setError('Não foi possível carregar os objetivos de poupança.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadGoals();

    return () => {
      isActive = false;
    };
  }, [setGoals, setLoading, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`savings-goals:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'savings_goals',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const recordId = getGoalRecordId(
            payload as { new: Record<string, unknown>; old: Record<string, unknown> }
          );

          if (!recordId) {
            return;
          }

          if (payload.eventType === 'DELETE') {
            useSavingsGoalStore.getState().removeGoal(recordId);
            return;
          }

          const goal = payload.new as SavingsGoal;
          const existingGoal = useSavingsGoalStore
            .getState()
            .goals.find((entry) => entry.id === recordId);

          if (existingGoal) {
            useSavingsGoalStore.getState().updateGoal(recordId, goal);
            return;
          }

          useSavingsGoalStore.getState().addGoal(goal);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const createGoal = useCallback(
    async (values: SavingsGoalFormValues) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousGoals = goals;
      const optimisticGoal: SavingsGoal = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: values.name.trim(),
        target_cents: values.target_cents,
        current_cents: 0,
        monthly_contribution_cents: values.monthly_contribution_cents,
        deadline: values.deadline,
        color: values.color,
        emoji: values.emoji,
        is_complete: false,
        created_at: new Date().toISOString(),
      };

      setError(null);
      addGoal(optimisticGoal);

      try {
        const { data, error: insertError } = await supabase
          .from('savings_goals')
          .insert({
            id: optimisticGoal.id,
            user_id: optimisticGoal.user_id,
            name: optimisticGoal.name,
            target_cents: optimisticGoal.target_cents,
            current_cents: optimisticGoal.current_cents,
            monthly_contribution_cents: optimisticGoal.monthly_contribution_cents,
            deadline: optimisticGoal.deadline,
            color: optimisticGoal.color,
            emoji: optimisticGoal.emoji,
            is_complete: optimisticGoal.is_complete,
          })
          .select('*')
          .single();

        if (insertError) {
          throw insertError;
        }

        updateGoalInStore(optimisticGoal.id, data as SavingsGoal);
      } catch (err) {
        console.error('Erro ao criar objetivo de poupança:', err);
        setGoals(previousGoals);
        setError('Não foi possível criar o objetivo de poupança.');
        throw err;
      }
    },
    [addGoal, goals, setGoals, updateGoalInStore, userId]
  );

  const updateGoal = useCallback(
    async (id: string, values: SavingsGoalFormValues) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const existingGoal = goals.find((goal) => goal.id === id);
      if (!existingGoal) {
        const missingGoalError = new Error('Objetivo de poupança não encontrado.');
        setError(missingGoalError.message);
        throw missingGoalError;
      }

      const previousGoals = goals;
      const updates = {
        name: values.name.trim(),
        target_cents: values.target_cents,
        monthly_contribution_cents: values.monthly_contribution_cents,
        deadline: values.deadline,
        color: values.color,
        emoji: values.emoji,
        is_complete: existingGoal.current_cents >= values.target_cents,
      } satisfies Partial<SavingsGoal>;

      setError(null);
      updateGoalInStore(id, updates);

      try {
        const { error: updateError } = await supabase
          .from('savings_goals')
          .update(updates)
          .eq('id', id)
          .eq('user_id', userId);

        if (updateError) {
          throw updateError;
        }
      } catch (err) {
        console.error('Erro ao atualizar objetivo de poupança:', err);
        setGoals(previousGoals);
        setError('Não foi possível atualizar o objetivo de poupança.');
        throw err;
      }
    },
    [goals, setGoals, updateGoalInStore, userId]
  );

  const deleteGoal = useCallback(
    async (id: string) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousGoals = goals;

      setError(null);
      removeGoal(id);

      try {
        const { error: deleteError } = await supabase
          .from('savings_goals')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);

        if (deleteError) {
          throw deleteError;
        }
      } catch (err) {
        console.error('Erro ao eliminar objetivo de poupança:', err);
        setGoals(previousGoals);
        setError('Não foi possível eliminar o objetivo de poupança.');
        throw err;
      }
    },
    [goals, removeGoal, setGoals, userId]
  );

  const addFunds = useCallback(
    async (goalId: string, amountCents: number) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const goal = goals.find((entry) => entry.id === goalId);
      if (!goal) {
        const missingGoalError = new Error('Objetivo de poupança não encontrado.');
        setError(missingGoalError.message);
        throw missingGoalError;
      }

      const poupancaCategory = categories.find(
        (category) => category.name === 'Poupança' && category.type === 'expense'
      );

      if (!poupancaCategory) {
        const categoryError = new Error(
          "Categoria 'Poupança' não encontrada. Crie-a em Definições."
        );
        setError(categoryError.message);
        throw categoryError;
      }

      const previousGoals = goals;
      const timestamp = new Date().toISOString();
      const note = `Contribuição para ${goal.name}`;
      const nextCurrentCents = goal.current_cents + amountCents;
      const nextIsComplete = nextCurrentCents >= goal.target_cents;
      const optimisticTransaction: Transaction = {
        id: crypto.randomUUID(),
        user_id: userId,
        amount_cents: amountCents,
        type: 'expense',
        category_id: poupancaCategory.id,
        source_id: null,
        goal_id: goalId,
        note,
        date: getTodayDateValue(),
        is_recurring: false,
        recurrence_rule: null,
        recurrence_parent_id: null,
        created_at: timestamp,
        updated_at: timestamp,
      };

      setError(null);
      addTransaction(optimisticTransaction);
      updateGoalInStore(goalId, {
        current_cents: nextCurrentCents,
        is_complete: nextIsComplete,
      });

      let hasInsertedTransaction = false;

      try {
        const { error: insertError } = await supabase
          .from('transactions')
          .insert(optimisticTransaction);

        if (insertError) {
          throw insertError;
        }

        hasInsertedTransaction = true;

        const { error: updateError } = await supabase
          .from('savings_goals')
          .update({
            current_cents: nextCurrentCents,
            is_complete: nextIsComplete,
          })
          .eq('id', goalId)
          .eq('user_id', userId);

        if (updateError) {
          throw updateError;
        }

        return nextIsComplete && !goal.is_complete;
      } catch (err) {
        console.error('Erro ao adicionar fundos ao objetivo:', err);
        removeTransaction(optimisticTransaction.id);
        setGoals(previousGoals);
        setError('Não foi possível adicionar fundos ao objetivo.');

        if (hasInsertedTransaction) {
          const { error: cleanupError } = await supabase
            .from('transactions')
            .delete()
            .eq('id', optimisticTransaction.id)
            .eq('user_id', userId);

          if (cleanupError) {
            console.error(
              'Erro ao reverter transação de contribuição para objetivo:',
              cleanupError
            );
          }
        }

        throw err;
      }
    },
    [addTransaction, categories, goals, removeTransaction, setGoals, updateGoalInStore, userId]
  );

  return {
    goals,
    isLoading,
    error,
    createGoal,
    updateGoal,
    deleteGoal,
    addFunds,
  };
}
