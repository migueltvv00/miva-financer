import { useEffect, useMemo, useState } from 'react';
import { format, startOfMonth } from 'date-fns';
import { supabase } from '@/lib/supabase';
import type { MealCardBudget } from '@/types';

interface UseMealCardBudgetResult {
  allowance_cents: number;
  spent_cents: number;
  remaining_cents: number;
  percentage: number;
  isLoading: boolean;
  hasBudget: boolean;
}

export function useMealCardBudget(userId: string | null | undefined): UseMealCardBudgetResult {
  const [budget, setBudget] = useState<MealCardBudget | null>(null);
  const [spent, setSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const monthKey = useMemo(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'), []);

  useEffect(() => {
    if (!userId) {
      setBudget(null);
      setSpent(0);
      setIsLoading(false);
      return;
    }

    let active = true;

    const load = async () => {
      setIsLoading(true);
      try {
        const [budgetRes, spentRes] = await Promise.all([
          supabase
            .from('meal_card_budgets')
            .select('*')
            .eq('user_id', userId)
            .eq('month', monthKey)
            .maybeSingle(),
          supabase
            .from('transactions')
            .select('amount_cents')
            .eq('user_id', userId)
            .eq('type', 'expense')
            .eq('payment_method', 'cartao_refeicao')
            .gte('date', monthKey)
            .lt('date', getNextMonth(monthKey)),
        ]);

        if (!active) return;

        if (budgetRes.error) throw budgetRes.error;
        if (spentRes.error) throw spentRes.error;

        setBudget((budgetRes.data as MealCardBudget) ?? null);
        const totalSpent = (spentRes.data ?? []).reduce(
          (sum, tx) => sum + (tx.amount_cents ?? 0),
          0
        );
        setSpent(totalSpent);
      } catch (err) {
        console.error('Erro ao carregar orçamento cartão refeição:', err);
        if (active) {
          setBudget(null);
          setSpent(0);
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [userId, monthKey]);

  const allowance = budget?.allowance_cents ?? 0;
  const remaining = allowance - spent;
  const percentage = allowance > 0 ? Math.min((spent / allowance) * 100, 100) : 0;

  return {
    allowance_cents: allowance,
    spent_cents: spent,
    remaining_cents: remaining,
    percentage,
    isLoading,
    hasBudget: budget !== null,
  };
}

function getNextMonth(monthKey: string): string {
  const date = new Date(monthKey);
  date.setMonth(date.getMonth() + 1);
  return format(startOfMonth(date), 'yyyy-MM-dd');
}
