import { useEffect, useMemo, useState } from 'react';
import { useBudgetData } from '@/features/budgets/useBudgetData';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';

interface BudgetScreenProps {
  userId: string | null | undefined;
  categoryError?: string | null;
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
  if (!compactValue) {
    return null;
  }

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

  if (!normalizedWholePart && !normalizedDecimalPart) {
    return null;
  }

  const cents =
    Number(normalizedWholePart || '0') * 100 +
    Number((normalizedDecimalPart + '00').slice(0, 2));

  return Number.isSafeInteger(cents) ? cents : null;
}

function removeDraftEntry(
  drafts: Record<string, string>,
  categoryId: string
): Record<string, string> {
  const { [categoryId]: _removed, ...remainingDrafts } = drafts;
  return remainingDrafts;
}

export function BudgetScreen({
  userId,
  categoryError = null,
}: BudgetScreenProps) {
  const categories = useCategoryStore((state) => state.categories);
  const isCategoryLoading = useCategoryStore((state) => state.isLoading);

  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense'),
    [categories]
  );

  const {
    budgets,
    error: budgetError,
    isLoading,
    monthLabel,
    selectedMonth,
    goToPreviousMonth,
    goToNextMonth,
    saveBudgetLimit,
    copyFromPreviousMonth,
  } = useBudgetData(userId);

  const budgetByCategory = useMemo(
    () => new Map(budgets.map((budget) => [budget.category_id, budget])),
    [budgets]
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [activeCategoryId, setActiveCategoryId] = useState<string | null>(null);
  const [pendingCategoryId, setPendingCategoryId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);

  useEffect(() => {
    setDrafts({});
    setActiveCategoryId(null);
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

  const clearDraft = (categoryId: string) => {
    setDrafts((currentDrafts) => removeDraftEntry(currentDrafts, categoryId));
  };

  const handleFocus = (categoryId: string) => {
    setActionError(null);
    setActiveCategoryId(categoryId);

    setDrafts((currentDrafts) => {
      if (categoryId in currentDrafts) {
        return currentDrafts;
      }

      const budget = budgetByCategory.get(categoryId);
      if (!budget) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [categoryId]: formatBudgetEditableValue(budget.limit_cents),
      };
    });
  };

  const handleChange = (categoryId: string, value: string) => {
    setActionError(null);
    setDrafts((currentDrafts) => ({
      ...currentDrafts,
      [categoryId]: value.replace(/[^\d,.\s€]/g, ''),
    }));
  };

  const handleBlur = async (categoryId: string) => {
    if (pendingCategoryId !== null) {
      return;
    }

    const existingBudget = budgetByCategory.get(categoryId);
    const nextValue = (drafts[categoryId] ?? '').trim();
    const nextLimitCents = parseBudgetInputToCents(nextValue);

    if (nextValue && nextLimitCents === null) {
      setActionError('Introduza um valor válido para o limite.');
      clearDraft(categoryId);
      setActiveCategoryId(null);
      return;
    }

    if ((existingBudget?.limit_cents ?? null) === nextLimitCents) {
      clearDraft(categoryId);
      setActiveCategoryId(null);
      return;
    }

    setPendingCategoryId(categoryId);
    setActionError(null);

    try {
      await saveBudgetLimit(categoryId, nextLimitCents);
      clearDraft(categoryId);
    } catch (err) {
      console.error('Erro ao guardar limite:', err);
      setActionError('Não foi possível guardar o limite. Tente novamente.');
      clearDraft(categoryId);
    } finally {
      setPendingCategoryId(null);
      setActiveCategoryId((currentCategoryId) =>
        currentCategoryId === categoryId ? null : currentCategoryId
      );
    }
  };

  const handleCopy = async () => {
    setActionError(null);
    setIsCopying(true);

    try {
      await copyFromPreviousMonth();
      setDrafts({});
      setActiveCategoryId(null);
      setToastMessage('Limites copiados!');
    } catch (err) {
      console.error('Erro ao copiar limites:', err);
      setActionError('Não foi possível copiar os limites do mês anterior.');
    } finally {
      setIsCopying(false);
    }
  };

  const messages = [categoryError, budgetError, actionError].filter(
    (message): message is string => Boolean(message)
  );
  const isBusy = isCopying || pendingCategoryId !== null;

  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-4 border-b border-[var(--color-divider)] pb-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)]">
            Orçamentos
          </h3>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Defina limites mensais por categoria de despesa.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-1">
            <button
              type="button"
              onClick={goToPreviousMonth}
              disabled={!userId || isBusy || isLoading}
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
              disabled={!userId || isBusy || isLoading}
              aria-label="Ver mês seguinte"
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-transparent text-lg text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
            >
              →
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              void handleCopy();
            }}
            disabled={!userId || isBusy || isLoading}
            className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] px-4 py-2.5 text-sm font-medium text-[var(--color-accent)] transition-colors hover:bg-[var(--color-accent-light)] disabled:opacity-40"
          >
            {isCopying ? 'A copiar…' : 'Copiar do mês anterior'}
          </button>
        </div>
      </div>

      {messages.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {messages.map((message) => (
            <p
              key={message}
              className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {message}
            </p>
          ))}
        </div>
      )}

      {isLoading || isCategoryLoading ? (
        <div className="flex min-h-[160px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
          A carregar orçamentos…
        </div>
      ) : expenseCategories.length === 0 ? (
        <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
          Ainda não tem categorias de despesa para definir limites.
        </div>
      ) : (
        <ul className="mt-4 flex flex-col gap-3">
          {expenseCategories.map((category) => {
            const budget = budgetByCategory.get(category.id);
            const inputValue =
              drafts[category.id] ??
              (budget ? formatBudgetDisplayValue(budget.limit_cents) : '');
            const isEditingCategory = activeCategoryId === category.id;
            const isSavingCategory = pendingCategoryId === category.id;

            return (
              <li
                key={category.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xl shadow-[var(--shadow-sm)]">
                        {category.emoji}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-[var(--color-text)]">
                          {category.name}
                        </p>
                        <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                          {isSavingCategory
                            ? 'A guardar…'
                            : isEditingCategory
                              ? 'Prima Enter para guardar.'
                              : budget
                                ? `Atual: ${formatCents(budget.limit_cents)}`
                                : 'Sem limite definido'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="w-full sm:w-44">
                    <label
                      className="mb-1 block text-xs font-medium text-[var(--color-text-secondary)]"
                      htmlFor={`budget-${category.id}`}
                    >
                      Limite mensal
                    </label>
                    <div className="relative">
                      <input
                        id={`budget-${category.id}`}
                        type="text"
                        inputMode="decimal"
                        value={inputValue}
                        placeholder="Sem limite"
                        onFocus={() => handleFocus(category.id)}
                        onChange={(event) => handleChange(category.id, event.target.value)}
                        onBlur={() => {
                          void handleBlur(category.id);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') {
                            event.preventDefault();
                            event.currentTarget.blur();
                          }

                          if (event.key === 'Escape') {
                            setDrafts((currentDrafts) => ({
                              ...currentDrafts,
                              [category.id]: budget
                                ? formatBudgetEditableValue(budget.limit_cents)
                                : '',
                            }));
                            setActiveCategoryId(null);
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
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-success)] px-4 py-3 text-sm font-medium text-[var(--color-text-inverse)] shadow-[var(--shadow-md)] md:bottom-6">
          {toastMessage}
        </div>
      )}
    </section>
  );
}
