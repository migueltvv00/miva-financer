import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface MealCardWidgetProps {
  userId: string;
}

function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('pt-PT', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
  });
}

export function MealCardWidget({ userId }: MealCardWidgetProps) {
  const [credit, setCredit] = useState<number | null>(null);
  const [spent, setSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isActive = true;

    async function load() {
      try {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        const nextMonthKey = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;

        // Prefer meal_card_budgets, fallback to payslip_imports
        const { data: budgetRow } = await supabase
          .from('meal_card_budgets')
          .select('allowance_cents')
          .eq('user_id', userId)
          .eq('month', monthKey)
          .maybeSingle();

        let allowance = budgetRow?.allowance_cents ?? null;

        if (!allowance) {
          const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
          const { data: payslip } = await supabase
            .from('payslip_imports')
            .select('meal_card_cents')
            .eq('user_id', userId)
            .eq('month', currentMonth)
            .eq('status', 'done')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          allowance = payslip?.meal_card_cents ?? null;
        }

        if (!isActive) return;

        if (!allowance || allowance <= 0) {
          setCredit(null);
          setSpent(0);
          setIsLoading(false);
          return;
        }

        setCredit(allowance);

        const { data: txns, error: txError } = await supabase
          .from('transactions')
          .select('amount_cents')
          .eq('user_id', userId)
          .eq('payment_method', 'cartao_refeicao')
          .eq('type', 'expense')
          .gte('date', monthKey)
          .lt('date', nextMonthKey);

        if (txError) throw txError;
        if (!isActive) return;

        const totalSpent = (txns ?? []).reduce((sum, tx) => sum + (tx.amount_cents ?? 0), 0);
        setSpent(totalSpent);
      } catch (error) {
        console.error('Erro ao carregar cartão refeição:', error);
        if (!isActive) return;
        setCredit(null);
        setSpent(0);
      } finally {
        if (isActive) setIsLoading(false);
      }
    }

    void load();
    return () => { isActive = false; };
  }, [userId]);

  if (isLoading || credit === null || credit <= 0) {
    return null;
  }

  const balance = credit - spent;
  const pct = Math.min(Math.round((spent / credit) * 100), 100);

  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <h4 className="text-sm font-semibold text-[var(--color-text)]">🍽️ Cartão Refeição</h4>
      <div className="mt-3 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-secondary)]">Crédito do mês</span>
          <span className="font-medium">{formatCents(credit)}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-secondary)]">Gasto até agora</span>
          <span className="font-medium">{formatCents(spent)}</span>
        </div>
        <div className="h-2 rounded-full bg-[var(--color-bg-tertiary)]">
          <div
            className={`h-2 rounded-full transition-all ${pct >= 90 ? 'bg-[var(--color-danger)]' : pct >= 70 ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-accent)]'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-[var(--color-text-secondary)]">Saldo estimado</span>
          <span className={`font-semibold ${balance < 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
            {formatCents(balance)}
          </span>
        </div>
      </div>
    </div>
  );
}
