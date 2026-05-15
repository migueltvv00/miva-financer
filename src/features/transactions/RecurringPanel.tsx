import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import type { Transaction } from '@/types';

interface RecurringPanelProps {
  userId: string;
}

type RecurringParentTransaction = Pick<
  Transaction,
  'id' | 'category_id' | 'amount_cents' | 'type' | 'recurrence_rule'
>;

const RECURRENCE_LABELS: Record<NonNullable<Transaction['recurrence_rule']>, string> = {
  weekly: 'Semanal',
  monthly: 'Mensal',
  yearly: 'Anual',
};

export function RecurringPanel({ userId }: RecurringPanelProps) {
  const categories = useCategoryStore((state) => state.categories);
  const [transactions, setTransactions] = useState<RecurringParentTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  useEffect(() => {
    let isActive = true;

    const loadRecurringTransactions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('transactions')
          .select('id, category_id, amount_cents, type, recurrence_rule')
          .eq('user_id', userId)
          .eq('is_recurring', true)
          .is('recurrence_parent_id', null)
          .order('created_at', { ascending: true });

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive) {
          return;
        }

        setTransactions((data ?? []) as RecurringParentTransaction[]);
      } catch (err) {
        console.error('Erro ao carregar transações recorrentes:', err);

        if (!isActive) {
          return;
        }

        setTransactions([]);
        setError('Não foi possível carregar as transações recorrentes.');
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadRecurringTransactions();

    return () => {
      isActive = false;
    };
  }, [userId]);

  const rows = useMemo(
    () =>
      transactions
        .map((transaction) => {
          if (!transaction.recurrence_rule) {
            return null;
          }

          const category = categoryMap.get(transaction.category_id);

          return {
            id: transaction.id,
            emoji: category?.emoji ?? '🏷️',
            name: category?.name ?? 'Categoria removida',
            amountCents: transaction.amount_cents,
            type: transaction.type,
            recurrenceLabel: RECURRENCE_LABELS[transaction.recurrence_rule],
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row))
        .sort((left, right) => left.name.localeCompare(right.name, 'pt-PT')),
    [categoryMap, transactions]
  );

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-4 py-3 text-left transition-colors hover:bg-[var(--color-bg-hover)]"
        aria-expanded={isOpen}
      >
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Séries ativas</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {rows.length === 1 ? '1 recorrência ativa' : `${rows.length} recorrências ativas`}
          </p>
        </div>
        <span
          className={`text-lg text-[var(--color-text-secondary)] transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          aria-hidden="true"
        >
          ▾
        </span>
      </button>

      {isOpen && (
        <div className="space-y-3">
          {isLoading ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              A carregar transações recorrentes…
            </p>
          ) : error ? (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {error}
            </p>
          ) : rows.length === 0 ? (
            <p className="text-sm text-[var(--color-text-secondary)]">
              Não tem transações recorrentes ativas.
            </p>
          ) : (
            <div className="space-y-3">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {row.emoji} {row.name}
                    </p>
                    <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                      {row.recurrenceLabel}
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${
                        row.type === 'income'
                          ? 'text-[var(--color-success)]'
                          : 'text-[var(--color-text)]'
                      }`}
                    >
                      {formatCents(row.amountCents)}
                    </p>
                    <span className="mt-1 inline-flex rounded-full bg-[var(--color-bg)] px-2 py-1 text-[11px] font-semibold text-[var(--color-text-secondary)]">
                      {row.recurrenceLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
