import { useEffect, useMemo, useState } from 'react';
import { endOfMonth, format } from 'date-fns';
import { useMonthlyPlanData } from '@/features/planning/useMonthlyPlanData';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import type { Budget, Transaction } from '@/types';

interface PlanningScreenProps {
  userId: string | null | undefined;
}

interface ComparisonRowProps {
  label: string;
  plannedLabel: string;
  plannedValue: number;
  actualLabel: string;
  actualValue: number;
  varianceValue: number;
  varianceTone: 'positive' | 'negative' | 'neutral';
}

interface SummaryCardProps {
  label: string;
  value: string;
  tone?: 'default' | 'positive' | 'negative';
}

const TOAST_HIDE_DELAY_MS = 2_500;

function formatBudgetDisplayValue(cents: number) {
  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function formatBudgetEditableValue(cents: number) {
  return new Intl.NumberFormat('pt-PT', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
    useGrouping: false,
  }).format(cents / 100);
}

function parseBudgetInputToCents(value: string) {
  const compactValue = value.replace(/\s|€/g, '');
  if (!compactValue) return null;

  const separators = [...compactValue.matchAll(/[,.]/g)];
  const lastSeparator = separators[separators.length - 1];
  let wholePart = compactValue;
  let decimalPart = '';

  if (lastSeparator?.index !== undefined) {
    const decimalLength = compactValue.length - lastSeparator.index - 1;
    if (decimalLength <= 2) {
      wholePart = compactValue.slice(0, lastSeparator.index);
      decimalPart = compactValue.slice(lastSeparator.index + 1);
    }
  }

  const normalizedWholePart = wholePart.replace(/\D/g, '');
  const normalizedDecimalPart = decimalPart.replace(/\D/g, '');
  if (!normalizedWholePart && !normalizedDecimalPart) return null;

  const cents =
    Number(normalizedWholePart || '0') * 100 +
    Number((normalizedDecimalPart + '00').slice(0, 2));

  return Number.isSafeInteger(cents) ? cents : null;
}

function formatSignedCents(cents: number) {
  if (cents === 0) {
    return formatCents(0);
  }

  if (cents > 0) {
    return `+${formatCents(cents)}`;
  }

  return `-${formatCents(Math.abs(cents))}`;
}

function getToneClass(tone: 'default' | 'positive' | 'negative') {
  if (tone === 'positive') {
    return 'text-[var(--color-success)]';
  }

  if (tone === 'negative') {
    return 'text-[var(--color-danger)]';
  }

  return 'text-[var(--color-text)]';
}

function getVarianceToneClass(tone: 'positive' | 'negative' | 'neutral') {
  if (tone === 'positive') {
    return 'text-[var(--color-success)]';
  }

  if (tone === 'negative') {
    return 'text-[var(--color-danger)]';
  }

  return 'text-[var(--color-text-secondary)]';
}

function SummaryCard({ label, value, tone = 'default' }: SummaryCardProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
        {label}
      </p>
      <p className={`mt-2 text-lg font-semibold ${getToneClass(tone)}`}>{value}</p>
    </div>
  );
}

function ComparisonRow({
  label,
  plannedLabel,
  plannedValue,
  actualLabel,
  actualValue,
  varianceValue,
  varianceTone,
}: ComparisonRowProps) {
  return (
    <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-[var(--color-text)]">{label}</p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {plannedLabel}: {formatCents(plannedValue)}
          </p>
          <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
            {actualLabel}: {formatCents(actualValue)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
            Variação
          </p>
          <p className={`mt-2 text-sm font-semibold ${getVarianceToneClass(varianceTone)}`}>
            {formatSignedCents(varianceValue)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function PlanningScreen({ userId }: PlanningScreenProps) {
  const categories = useCategoryStore((state) => state.categories);
  const isCategoryLoading = useCategoryStore((state) => state.isLoading);
  const {
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
  } = useMonthlyPlanData(userId);

  const [incomeDraft, setIncomeDraft] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [isEditingIncome, setIsEditingIncome] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [isSavingIncome, setIsSavingIncome] = useState(false);
  const [isSavingNotes, setIsSavingNotes] = useState(false);
  const [isCopying, setIsCopying] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  useEffect(() => {
    setIncomeDraft('');
    setNotesDraft('');
    setIsEditingIncome(false);
    setIsEditingNotes(false);
    setActionError(null);
  }, [selectedMonth]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, TOAST_HIDE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setBudgets([]);
      setTransactions([]);
      setDetailsError(null);
      setIsLoadingDetails(false);
      return;
    }

    const loadDetails = async () => {
      setIsLoadingDetails(true);
      setDetailsError(null);

      try {
        const monthEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
        const [budgetResponse, transactionResponse] = await Promise.all([
          supabase
            .from('budgets')
            .select('*')
            .eq('user_id', userId)
            .eq('month', monthKey)
            .order('created_at', { ascending: true }),
          supabase
            .from('transactions')
            .select('*')
            .eq('user_id', userId)
            .gte('date', monthKey)
            .lte('date', monthEnd)
            .order('date', { ascending: false }),
        ]);

        if (budgetResponse.error) {
          throw budgetResponse.error;
        }

        if (transactionResponse.error) {
          throw transactionResponse.error;
        }

        if (!isActive) {
          return;
        }

        setBudgets((budgetResponse.data ?? []) as Budget[]);
        setTransactions((transactionResponse.data ?? []) as Transaction[]);
      } catch (err) {
        console.error('Erro ao carregar dados do planeamento:', err);

        if (!isActive) {
          return;
        }

        setBudgets([]);
        setTransactions([]);
        setDetailsError('Não foi possível carregar o resumo do plano.');
      } finally {
        if (isActive) {
          setIsLoadingDetails(false);
        }
      }
    };

    void loadDetails();

    return () => {
      isActive = false;
    };
  }, [monthKey, selectedMonth, userId]);

  const budgetByCategory = useMemo(
    () => new Map(budgets.map((budget) => [budget.category_id, budget])),
    [budgets]
  );

  const totalBudgetLimit = useMemo(
    () => budgets.reduce((sum, budget) => sum + budget.limit_cents, 0),
    [budgets]
  );

  const { actualIncome, actualExpenses, expenseTotalsByCategory } = useMemo(() => {
    let nextActualIncome = 0;
    let nextActualExpenses = 0;
    const nextExpenseTotalsByCategory = new Map<string, number>();

    transactions.forEach((transaction) => {
      if (transaction.type === 'income') {
        nextActualIncome += transaction.amount_cents;
        return;
      }

      nextActualExpenses += transaction.amount_cents;
      nextExpenseTotalsByCategory.set(
        transaction.category_id,
        (nextExpenseTotalsByCategory.get(transaction.category_id) ?? 0) +
          transaction.amount_cents
      );
    });

    return {
      actualIncome: nextActualIncome,
      actualExpenses: nextActualExpenses,
      expenseTotalsByCategory: nextExpenseTotalsByCategory,
    };
  }, [transactions]);

  const projectedBalance = (plan?.expected_income_cents ?? 0) - totalBudgetLimit;
  const incomeVariance = actualIncome - (plan?.expected_income_cents ?? 0);
  const expenseVariance = totalBudgetLimit - actualExpenses;
  const shouldShowComparison = Boolean(plan) && transactions.length > 0;

  const categoryComparisons = useMemo(
    () =>
      categories
        .filter(
          (category) => category.type === 'expense' && budgetByCategory.has(category.id)
        )
        .map((category) => {
          const limitCents = budgetByCategory.get(category.id)?.limit_cents ?? 0;
          const actualSpendCents = expenseTotalsByCategory.get(category.id) ?? 0;
          const varianceCents = limitCents - actualSpendCents;

          return {
            category,
            limitCents,
            actualSpendCents,
            varianceCents,
          };
        }),
    [budgetByCategory, categories, expenseTotalsByCategory]
  );

  const incomeInputValue = isEditingIncome
    ? incomeDraft
    : plan
      ? formatBudgetDisplayValue(plan.expected_income_cents)
      : '';
  const notesValue = isEditingNotes ? notesDraft : plan?.notes ?? '';

  const messages = Array.from(
    new Set(
      [error, detailsError, actionError].filter(
        (message): message is string => Boolean(message)
      )
    )
  );
  const isBusy = isSavingIncome || isSavingNotes || isCopying;

  const handleIncomeFocus = () => {
    setActionError(null);
    setIsEditingIncome(true);
    setIncomeDraft(
      plan ? formatBudgetEditableValue(plan.expected_income_cents) : incomeDraft
    );
  };

  const handleIncomeBlur = async () => {
    if (isSavingIncome) {
      return;
    }

    const nextValue = incomeDraft.trim();
    const nextIncomeCents = nextValue ? parseBudgetInputToCents(nextValue) : 0;

    if (nextValue && nextIncomeCents === null) {
      setActionError('Introduza um valor válido para o rendimento esperado.');
      setIncomeDraft('');
      setIsEditingIncome(false);
      return;
    }

    if ((plan?.expected_income_cents ?? 0) === nextIncomeCents) {
      setIncomeDraft('');
      setIsEditingIncome(false);
      return;
    }

    setIsSavingIncome(true);
    setActionError(null);

    try {
      await saveExpectedIncome(nextIncomeCents ?? 0);
      setIncomeDraft('');
    } catch (err) {
      console.error('Erro ao guardar rendimento esperado:', err);
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível guardar o rendimento esperado.'
      );
      setIncomeDraft('');
    } finally {
      setIsSavingIncome(false);
      setIsEditingIncome(false);
    }
  };

  const handleNotesFocus = () => {
    setActionError(null);
    setIsEditingNotes(true);
    setNotesDraft(plan?.notes ?? '');
  };

  const handleNotesBlur = async () => {
    if (isSavingNotes) {
      return;
    }

    const trimmedNotes = notesDraft.trim();
    const nextNotes = trimmedNotes ? trimmedNotes : null;

    if ((plan?.notes ?? null) === nextNotes) {
      setNotesDraft('');
      setIsEditingNotes(false);
      return;
    }

    setIsSavingNotes(true);
    setActionError(null);

    try {
      await saveNotes(nextNotes);
      setNotesDraft('');
    } catch (err) {
      console.error('Erro ao guardar notas:', err);
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível guardar as notas do plano.'
      );
      setNotesDraft('');
    } finally {
      setIsSavingNotes(false);
      setIsEditingNotes(false);
    }
  };

  const handleCopyPlan = async () => {
    setActionError(null);
    setIsCopying(true);

    try {
      await copyPlanToNextMonth();
      setToastMessage('Plano copiado!');
    } catch (err) {
      console.error('Erro ao copiar plano:', err);
      setActionError(
        err instanceof Error
          ? err.message
          : 'Não foi possível copiar o plano para o próximo mês.'
      );
    } finally {
      setIsCopying(false);
    }
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-4 border-b border-[var(--color-divider)] pb-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            Planeamento mensal
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Planeie o rendimento esperado, acompanhe limites e compare o plano com o mês real.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1">
            <button
              type="button"
              onClick={goToPreviousMonth}
              disabled={!userId || isBusy || isLoading || isLoadingDetails}
              aria-label="Ver mês anterior"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-transparent text-lg text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
            >
              ←
            </button>
            <p className="min-w-[8.5rem] text-center text-sm font-semibold text-[var(--color-text)]">
              {monthLabel}
            </p>
            <button
              type="button"
              onClick={goToNextMonth}
              disabled={!userId || isBusy || isLoading || isLoadingDetails}
              aria-label="Ver mês seguinte"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-transparent text-lg text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
            >
              →
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleCopyPlan();
            }}
            disabled={!userId || isBusy || isLoading}
            className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-40"
          >
            {isCopying ? 'A copiar…' : 'Copiar plano para o próximo mês'}
          </button>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {messages.map((message, index) => (
            <p
              key={`${message}-${index}`}
              className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {message}
            </p>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
          <div>
            <label
              htmlFor="planning-expected-income"
              className="block text-sm font-medium text-[var(--color-text)]"
            >
              Rendimento esperado
            </label>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Introduza o total previsto de receitas para este mês.
            </p>
          </div>

          <div className="relative">
            <input
              id="planning-expected-income"
              type="text"
              inputMode="decimal"
              value={incomeInputValue}
              placeholder="0,00"
              onFocus={handleIncomeFocus}
              onChange={(event) => {
                setActionError(null);
                setIncomeDraft(event.target.value.replace(/[^\d,.\s€]/g, ''));
              }}
              onBlur={() => {
                void handleIncomeBlur();
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  event.currentTarget.blur();
                }

                if (event.key === 'Escape') {
                  setIncomeDraft('');
                  setIsEditingIncome(false);
                  event.currentTarget.blur();
                }
              }}
              disabled={!userId || isBusy}
              className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 pr-10 text-right text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)] disabled:opacity-50"
            />
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--color-text-secondary)]">
              €
            </span>
          </div>

          <p className="text-xs text-[var(--color-text-secondary)]">
            {isSavingIncome
              ? 'A guardar rendimento esperado…'
              : 'O valor é guardado ao sair do campo.'}
          </p>

          <div>
            <label
              htmlFor="planning-notes"
              className="block text-sm font-medium text-[var(--color-text)]"
            >
              Notas
            </label>
            <textarea
              id="planning-notes"
              value={notesValue}
              placeholder="Adicione observações para este mês."
              onFocus={handleNotesFocus}
              onChange={(event) => {
                setActionError(null);
                setNotesDraft(event.target.value);
              }}
              onBlur={() => {
                void handleNotesBlur();
              }}
              disabled={!userId || isBusy}
              rows={4}
              className="mt-2 min-h-[132px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)] disabled:opacity-50"
            />
            <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
              {isSavingNotes ? 'A guardar notas…' : 'As notas são guardadas ao sair do campo.'}
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h4 className="text-sm font-semibold text-[var(--color-text)]">Resumo do plano</h4>
              <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                Totais previstos para {monthLabel.toLowerCase()}.
              </p>
            </div>
            {(isLoading || isLoadingDetails) && (
              <span className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
                A carregar…
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Rendimento esperado"
              value={formatCents(plan?.expected_income_cents ?? 0)}
            />
            <SummaryCard
              label="Limite total de despesas"
              value={formatCents(totalBudgetLimit)}
            />
            <SummaryCard
              label="Saldo projetado"
              value={formatCents(projectedBalance)}
              tone={
                projectedBalance > 0
                  ? 'positive'
                  : projectedBalance < 0
                    ? 'negative'
                    : 'default'
              }
            />
          </div>
        </div>
      </div>

      {shouldShowComparison && (
        <div className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text)]">Plano vs. real</h4>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              Compare o que planeou com os movimentos registados neste mês.
            </p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <ComparisonRow
              label="Receita"
              plannedLabel="Receita planeada"
              plannedValue={plan?.expected_income_cents ?? 0}
              actualLabel="Receita real"
              actualValue={actualIncome}
              varianceValue={incomeVariance}
              varianceTone={
                incomeVariance > 0 ? 'positive' : incomeVariance < 0 ? 'negative' : 'neutral'
              }
            />
            <ComparisonRow
              label="Despesa"
              plannedLabel="Despesa planeada (total limites)"
              plannedValue={totalBudgetLimit}
              actualLabel="Despesa real"
              actualValue={actualExpenses}
              varianceValue={expenseVariance}
              varianceTone={
                expenseVariance > 0
                  ? 'positive'
                  : expenseVariance < 0
                    ? 'negative'
                    : 'neutral'
              }
            />
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between gap-3">
              <h5 className="text-sm font-semibold text-[var(--color-text)]">
                Despesas por categoria
              </h5>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Limite vs. gasto real
              </p>
            </div>

            {isCategoryLoading ? (
              <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-5 text-sm text-[var(--color-text-secondary)]">
                A carregar categorias…
              </div>
            ) : categoryComparisons.length === 0 ? (
              <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-5 text-sm text-[var(--color-text-secondary)]">
                Ainda não existem limites de despesa para comparar neste mês.
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {categoryComparisons.map((item) => {
                  const varianceTone =
                    item.varianceCents > 0
                      ? 'positive'
                      : item.varianceCents < 0
                        ? 'negative'
                        : 'neutral';

                  return (
                    <li
                      key={item.category.id}
                      className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] text-xl shadow-[var(--shadow-sm)]">
                            {item.category.emoji}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-[var(--color-text)]">
                              {item.category.name}
                            </p>
                            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                              Limite: {formatCents(item.limitCents)} · Real:{' '}
                              {formatCents(item.actualSpendCents)}
                            </p>
                          </div>
                        </div>

                        <div className="text-left sm:text-right">
                          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                            Variação
                          </p>
                          <p
                            className={`mt-1 text-sm font-semibold ${getVarianceToneClass(
                              varianceTone
                            )}`}
                          >
                            {formatSignedCents(item.varianceCents)}
                          </p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-success)] px-4 py-3 text-sm font-medium text-[var(--color-text-inverse)] shadow-[var(--shadow-md)] md:bottom-6">
          {toastMessage}
        </div>
      )}
    </section>
  );
}
