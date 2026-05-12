import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { endOfMonth, format, startOfYear } from 'date-fns';
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { useBudgetData } from '@/features/budgets/useBudgetData';
import { useCategoryData } from '@/features/categories/useCategoryData';
import { useSavingsGoalData } from '@/features/goals/useSavingsGoalData';
import { INCOME_SOURCE_TYPE_LABELS } from '@/features/income-sources/constants';
import { useIncomeSourceData } from '@/features/income-sources/useIncomeSourceData';
import type { MonthlyReportProps } from '@/features/reports/MonthlyReport';
import { computeCategoryTrends } from '@/features/trends/trendUtils';
import { useTrendTransactionData } from '@/features/trends/useTrendTransactionData';
import { useTransactionData } from '@/features/transactions/useTransactionData';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/lib/utils';
import { useBudgetStore } from '@/store/budgetStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useTransactionStore } from '@/store/transactionStore';
import type { Category, Transaction } from '@/types';

interface SummaryCardProps {
  title: string;
  amount: string;
  toneClassName: string;
}

interface SectionCardProps {
  title: string;
  description: string;
  children: ReactNode;
}

interface ExpenseProgressItem {
  category: Category;
  spentCents: number;
  limitCents: number | null;
  percentageUsed: number | null;
}

interface ExpenseDonutItem {
  categoryId: string;
  emoji: string;
  name: string;
  amountCents: number;
  percentage: number;
  color: string;
}

interface IncomeCategoryBreakdownItem {
  categoryId: string;
  emoji: string;
  name: string;
  amountCents: number;
  color: string;
}

interface IncomeSourceBreakdownItem {
  sourceKey: string;
  sourceId: string | null;
  name: string;
  amountCents: number;
  typeLabel: string | null;
  isArchived: boolean;
}

const NO_SOURCE_KEY = '__no_source__';

const DashboardPdfExport = lazy(async () => {
  const module = await import('@/features/dashboard/DashboardPdfExport');
  return { default: module.DashboardPdfExport };
});

const percentageFormatter = new Intl.NumberFormat('pt-PT', {
  style: 'percent',
  maximumFractionDigits: 0,
});

function isDefined<T>(value: T | null): value is T {
  return value !== null;
}

function getValueToneClass(value: number) {
  if (value > 0) {
    return 'text-[var(--color-success)]';
  }

  if (value < 0) {
    return 'text-[var(--color-danger)]';
  }

  return 'text-[var(--color-text)]';
}

function getProgressColor(percentageUsed: number | null) {
  if (percentageUsed === null) {
    return 'var(--color-border)';
  }

  if (percentageUsed >= 1) {
    return 'var(--color-danger)';
  }

  if (percentageUsed >= 0.75) {
    return 'var(--color-warning)';
  }

  return 'var(--color-success)';
}

function getInsightTextClass(insight: 'above' | 'below' | 'normal') {
  if (insight === 'above') {
    return 'text-[var(--color-danger)]';
  }

  if (insight === 'below') {
    return 'text-[var(--color-success)]';
  }

  return 'text-[var(--color-text-tertiary)]';
}

function SummaryCard({ title, amount, toneClassName }: SummaryCardProps) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
        {title}
      </p>
      <p className={`mt-2 text-base font-semibold sm:text-lg ${toneClassName}`}>
        {amount}
      </p>
    </div>
  );
}

function SectionCard({ title, description, children }: SectionCardProps) {
  return (
    <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
      <div className="border-b border-[var(--color-divider)] pb-4">
        <h2 className="text-base font-semibold text-[var(--color-text)]">{title}</h2>
        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">{description}</p>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function DashboardScreen() {
  const { user } = useAuth();
  const categories = useCategoryStore((state) => state.categories);
  const isLoadingCategories = useCategoryStore((state) => state.isLoading);
  const transactions = useTransactionStore((state) => state.transactions);
  const trendTransactions = useTransactionStore((state) => state.trendTransactions);
  const isLoadingTransactions = useTransactionStore((state) => state.isLoading);
  const isLoadingTrendTransactions = useTransactionStore(
    (state) => state.isLoadingTrendTransactions
  );
  const isLoadingBudgets = useBudgetStore((state) => state.isLoading);

  const { error: categoryError } = useCategoryData(user?.id);
  const {
    budgets,
    error: budgetError,
    monthLabel,
    selectedMonth,
    goToNextMonth,
    goToPreviousMonth,
  } = useBudgetData(user?.id);
  const {
    sources,
    error: incomeSourceError,
    isLoading: isLoadingSources,
  } = useIncomeSourceData(user?.id, { includeArchived: true });
  const {
    goals,
    error: savingsGoalError,
    isLoading: isLoadingGoals,
  } = useSavingsGoalData(user?.id);
  const { error: transactionError } = useTransactionData(user?.id, selectedMonth);
  const { error: trendError } = useTrendTransactionData(user?.id, selectedMonth);

  useRealtimeSync(user?.id, selectedMonth);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const sourceMap = useMemo(
    () => new Map(sources.map((source) => [source.id, source])),
    [sources]
  );
  const categoryTrendMap = useMemo(
    () =>
      new Map(
        computeCategoryTrends(trendTransactions, categories, selectedMonth).map(
          (trend) => [trend.categoryId, trend]
        )
      ),
    [categories, selectedMonth, trendTransactions]
  );
  const freelanceSourceIds = useMemo(
    () =>
      sources
        .filter((source) => source.type === 'freelance')
        .map((source) => source.id),
    [sources]
  );

  const budgetMap = useMemo(
    () => new Map(budgets.map((budget) => [budget.category_id, budget])),
    [budgets]
  );
  const reportMonth = useMemo(() => format(selectedMonth, 'yyyy-MM'), [selectedMonth]);
  const activeSavingsGoals = useMemo(
    () => goals.filter((goal) => !goal.is_complete),
    [goals]
  );

  const {
    expenseItems,
    incomeCategoryItems,
    incomeSourceItems,
    expenseChartData,
    totalExpenses,
    totalIncome,
  } = useMemo(() => {
    let incomeCents = 0;
    let expenseCents = 0;
    const expenseTotals = new Map<string, number>();
    const incomeCategoryTotals = new Map<string, number>();
    const incomeSourceTotals = new Map<string, number>();

    transactions.forEach((transaction) => {
      if (transaction.type === 'income') {
        incomeCents += transaction.amount_cents;
        incomeCategoryTotals.set(
          transaction.category_id,
          (incomeCategoryTotals.get(transaction.category_id) ?? 0) +
            transaction.amount_cents
        );

        const sourceKey = transaction.source_id ?? NO_SOURCE_KEY;
        incomeSourceTotals.set(
          sourceKey,
          (incomeSourceTotals.get(sourceKey) ?? 0) + transaction.amount_cents
        );
        return;
      }

      expenseCents += transaction.amount_cents;
      expenseTotals.set(
        transaction.category_id,
        (expenseTotals.get(transaction.category_id) ?? 0) + transaction.amount_cents
      );
    });

    const nextExpenseItems = Array.from(expenseTotals.entries())
      .map(([categoryId, spentCents]) => {
        const category = categoryMap.get(categoryId);

        if (!category || category.type !== 'expense') {
          return null;
        }

        const limitCents = budgetMap.get(categoryId)?.limit_cents ?? null;
        const percentageUsed =
          typeof limitCents === 'number' && limitCents > 0
            ? spentCents / limitCents
            : null;

        return {
          category,
          spentCents,
          limitCents,
          percentageUsed,
        } satisfies ExpenseProgressItem;
      })
      .filter(isDefined)
      .sort((left, right) => {
        const leftPercentage = left.percentageUsed ?? -1;
        const rightPercentage = right.percentageUsed ?? -1;

        if (rightPercentage !== leftPercentage) {
          return rightPercentage - leftPercentage;
        }

        if (right.spentCents !== left.spentCents) {
          return right.spentCents - left.spentCents;
        }

        return left.category.name.localeCompare(right.category.name, 'pt-PT');
      });

    const nextExpenseChartData = nextExpenseItems.map((item) => ({
      categoryId: item.category.id,
      emoji: item.category.emoji,
      name: item.category.name,
      amountCents: item.spentCents,
      percentage: expenseCents > 0 ? item.spentCents / expenseCents : 0,
      color: item.category.color,
    } satisfies ExpenseDonutItem));

    const nextIncomeCategoryItems = Array.from(incomeCategoryTotals.entries())
      .map(([categoryId, amountCents]) => {
        const category = categoryMap.get(categoryId);

        if (!category || category.type !== 'income') {
          return null;
        }

        return {
          categoryId: category.id,
          emoji: category.emoji,
          name: category.name,
          amountCents,
          color: category.color,
        } satisfies IncomeCategoryBreakdownItem;
      })
      .filter(isDefined)
      .sort((left, right) => {
        if (right.amountCents !== left.amountCents) {
          return right.amountCents - left.amountCents;
        }

        return left.name.localeCompare(right.name, 'pt-PT');
      });

    const nextIncomeSourceItems = Array.from(incomeSourceTotals.entries())
      .map(([sourceKey, amountCents]) => {
        if (sourceKey === NO_SOURCE_KEY) {
          return {
            sourceKey,
            sourceId: null,
            name: 'Sem fonte atribuída',
            amountCents,
            typeLabel: null,
            isArchived: false,
          } satisfies IncomeSourceBreakdownItem;
        }

        const source = sourceMap.get(sourceKey);

        return {
          sourceKey,
          sourceId: source?.id ?? sourceKey,
          name: source?.name ?? 'Fonte indisponível',
          amountCents,
          typeLabel: source ? INCOME_SOURCE_TYPE_LABELS[source.type] : null,
          isArchived: source?.is_archived ?? false,
        } satisfies IncomeSourceBreakdownItem;
      })
      .sort((left, right) => {
        if (right.amountCents !== left.amountCents) {
          return right.amountCents - left.amountCents;
        }

        return left.name.localeCompare(right.name, 'pt-PT');
      });

    return {
      expenseItems: nextExpenseItems,
      incomeCategoryItems: nextIncomeCategoryItems,
      incomeSourceItems: nextIncomeSourceItems,
      expenseChartData: nextExpenseChartData,
      totalExpenses: expenseCents,
      totalIncome: incomeCents,
    };
  }, [budgetMap, categoryMap, sourceMap, transactions]);

  const [freelanceYtdAmount, setFreelanceYtdAmount] = useState(0);
  const [freelanceYtdError, setFreelanceYtdError] = useState<string | null>(null);
  const [isLoadingFreelanceYtd, setIsLoadingFreelanceYtd] = useState(false);

  useEffect(() => {
    let isActive = true;

    if (!user?.id || freelanceSourceIds.length === 0) {
      setFreelanceYtdAmount(0);
      setFreelanceYtdError(null);
      setIsLoadingFreelanceYtd(false);
      return;
    }

    const loadFreelanceYtd = async () => {
      setIsLoadingFreelanceYtd(true);
      setFreelanceYtdError(null);

      try {
        const yearStart = format(startOfYear(selectedMonth), 'yyyy-MM-dd');
        const yearToDateEnd = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');
        const freelanceSourceIdSet = new Set(freelanceSourceIds);

        const { data, error } = await supabase
          .from('transactions')
          .select('amount_cents, source_id')
          .eq('user_id', user.id)
          .eq('type', 'income')
          .gte('date', yearStart)
          .lte('date', yearToDateEnd);

        if (error) {
          throw error;
        }

        if (!isActive) {
          return;
        }

        const total = ((data ?? []) as Array<
          Pick<Transaction, 'amount_cents' | 'source_id'>
        >).reduce((sum, transaction) => {
          if (!transaction.source_id || !freelanceSourceIdSet.has(transaction.source_id)) {
            return sum;
          }

          return sum + transaction.amount_cents;
        }, 0);

        setFreelanceYtdAmount(total);
      } catch (error) {
        console.error('Erro ao carregar rendimento anual de categoria B:', error);

        if (!isActive) {
          return;
        }

        setFreelanceYtdAmount(0);
        setFreelanceYtdError(
          'Não foi possível carregar o rendimento anual da categoria B.'
        );
      } finally {
        if (isActive) {
          setIsLoadingFreelanceYtd(false);
        }
      }
    };

    void loadFreelanceYtd();

    return () => {
      isActive = false;
    };
  }, [freelanceSourceIds, selectedMonth, user?.id]);

  const hasFreelanceSources = freelanceSourceIds.length > 0;
  const errorMessages = [
    categoryError,
    transactionError,
    trendError,
    budgetError,
    incomeSourceError,
    savingsGoalError,
  ].filter((message): message is string => Boolean(message));

  const isLoading =
    isLoadingBudgets ||
    isLoadingCategories ||
    isLoadingTransactions ||
    isLoadingTrendTransactions ||
    isLoadingSources ||
    isLoadingGoals;
  const netCents = totalIncome - totalExpenses;
  const monthlyReportProps = useMemo(
    () => {
      const expenseByCategoryMap = new Map<
        string,
        { name: string; budgetedCents: number | null; actualCents: number }
      >();

      budgets.forEach((budget) => {
        const category = categoryMap.get(budget.category_id);

        if (!category || category.type !== 'expense') {
          return;
        }

        expenseByCategoryMap.set(budget.category_id, {
          name: category.name,
          budgetedCents: budget.limit_cents,
          actualCents: expenseByCategoryMap.get(budget.category_id)?.actualCents ?? 0,
        });
      });

      transactions.forEach((transaction) => {
        if (transaction.type !== 'expense') {
          return;
        }

        const category = categoryMap.get(transaction.category_id);

        if (!category || category.type !== 'expense') {
          return;
        }

        const existingItem = expenseByCategoryMap.get(transaction.category_id);

        expenseByCategoryMap.set(transaction.category_id, {
          name: category.name,
          budgetedCents:
            existingItem?.budgetedCents ?? budgetMap.get(transaction.category_id)?.limit_cents ?? null,
          actualCents: (existingItem?.actualCents ?? 0) + transaction.amount_cents,
        });
      });

      return {
        month: reportMonth,
        userEmail: user?.email ?? 'Sem email disponível',
        generatedAt: new Date(),
        totalIncomeCents: totalIncome,
        totalExpenseCents: totalExpenses,
        incomeBySource: incomeSourceItems.map((item) => ({
          name: item.name,
          amountCents: item.amountCents,
        })),
        expenseByCategory: Array.from(expenseByCategoryMap.values()).sort((left, right) => {
          if (right.actualCents !== left.actualCents) {
            return right.actualCents - left.actualCents;
          }

          const leftBudgetedCents = left.budgetedCents ?? -1;
          const rightBudgetedCents = right.budgetedCents ?? -1;

          if (rightBudgetedCents !== leftBudgetedCents) {
            return rightBudgetedCents - leftBudgetedCents;
          }

          return left.name.localeCompare(right.name, 'pt-PT');
        }),
        freelanceYtdCents: freelanceYtdAmount,
        savingsGoals: activeSavingsGoals.map((goal) => ({
          name: goal.name,
          currentCents: goal.current_cents,
          targetCents: goal.target_cents,
        })),
      } satisfies MonthlyReportProps;
    },
    [
      activeSavingsGoals,
      budgetMap,
      budgets,
      categoryMap,
      freelanceYtdAmount,
      incomeSourceItems,
      reportMonth,
      totalExpenses,
      totalIncome,
      transactions,
      user?.email,
    ]
  );
  const pdfFileName = useMemo(() => `fluxo-${reportMonth}.pdf`, [reportMonth]);

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Resumo Mensal
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Acompanhe receitas, despesas e orçamento por categoria em tempo real.
          </p>
        </div>

        {isLoading && (
          <div className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
            A carregar…
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 shadow-[var(--shadow-sm)]">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={goToPreviousMonth}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-xl text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)]"
            aria-label="Mês anterior"
          >
            ←
          </button>

          <div className="flex-1 text-center">
            <p className="text-lg font-semibold text-[var(--color-text)]">{monthLabel}</p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              Atualizado em tempo real
            </p>
          </div>

          <button
            type="button"
            onClick={goToNextMonth}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-xl text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)]"
            aria-label="Mês seguinte"
          >
            →
          </button>
        </div>
      </div>

      {errorMessages.length > 0 && (
        <div className="flex flex-col gap-3">
          {errorMessages.map((message, index) => (
            <p
              key={`${message}-${index}`}
              className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {message}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:items-start">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-3">
            <SummaryCard
              title="Receitas"
              amount={formatCents(totalIncome)}
              toneClassName="text-[var(--color-success)]"
            />
            <SummaryCard
              title="Despesas"
              amount={formatCents(totalExpenses)}
              toneClassName="text-[var(--color-danger)]"
            />
            <SummaryCard
              title="Saldo"
              amount={formatCents(netCents)}
              toneClassName={getValueToneClass(netCents)}
            />
          </div>

          <Suspense
            fallback={
              <div className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-accent)] bg-[var(--color-bg)] px-4 py-2 text-sm font-medium text-[var(--color-accent)]">
                A preparar exportação…
              </div>
            }
          >
            <DashboardPdfExport report={monthlyReportProps} fileName={pdfFileName} />
          </Suspense>

          <SectionCard
            title="Progresso por categoria"
            description="Veja quanto já foi gasto em cada categoria de despesa neste mês."
          >
            {expenseItems.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Ainda não existem despesas registadas neste mês.
              </p>
            ) : (
              <div className="space-y-4">
                {expenseItems.map((item) => {
                  const progressColor = getProgressColor(item.percentageUsed);
                  const progressWidth =
                    item.percentageUsed === null
                      ? 0
                      : Math.min(item.percentageUsed * 100, 100);
                  const hasLimit =
                    typeof item.limitCents === 'number' && item.limitCents > 0;
                  const limitCents = hasLimit ? (item.limitCents ?? 0) : 0;
                  const amountLabel = hasLimit
                    ? `${formatCents(item.spentCents)} / ${formatCents(limitCents)}`
                    : formatCents(item.spentCents);
                  const trend = categoryTrendMap.get(item.category.id);

                  return (
                    <div key={item.category.id} className="space-y-2">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--color-text)]">
                            <span className="mr-2" aria-hidden="true">
                              {item.category.emoji}
                            </span>
                            {item.category.name}
                          </p>
                          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                            {amountLabel}
                          </p>
                        </div>

                        {item.percentageUsed !== null && (
                          <span
                            className="rounded-full border px-2 py-1 text-xs font-semibold"
                            style={{
                              borderColor: progressColor,
                              color: progressColor,
                            }}
                          >
                            {percentageFormatter.format(item.percentageUsed)}
                          </span>
                        )}
                      </div>

                      {item.percentageUsed !== null && (
                        <div className="h-2 overflow-hidden rounded-full bg-[var(--color-bg-secondary)]">
                          <div
                            className="h-full rounded-full transition-[width] duration-300"
                            style={{
                              width: `${progressWidth}%`,
                              backgroundColor: progressColor,
                            }}
                          />
                        </div>
                      )}

                      {trend && (
                        <div className="flex items-center justify-between gap-3">
                          <div className="h-6 w-20 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={trend.monthlyData}>
                                <Area
                                  type="monotone"
                                  dataKey="amount"
                                  stroke={item.category.color}
                                  fill={item.category.color}
                                  fillOpacity={0.2}
                                  strokeWidth={1.5}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>

                          <span
                            className={`text-right text-xs ${getInsightTextClass(
                              trend.insight
                            )}`}
                          >
                            {trend.insightText}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </div>

        <div className="flex flex-col gap-4">
          <SectionCard
            title="Distribuição das despesas"
            description="Perceba rapidamente em que categorias está a gastar mais."
          >
            {expenseChartData.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Sem despesas para apresentar neste mês.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="relative h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={expenseChartData}
                        dataKey="amountCents"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius="62%"
                        outerRadius="92%"
                        paddingAngle={2}
                        stroke="var(--color-bg)"
                        strokeWidth={2}
                      >
                        {expenseChartData.map((item) => (
                          <Cell key={item.categoryId} fill={item.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        content={({ active, payload }) => {
                          const item = payload?.[0]?.payload as ExpenseDonutItem | undefined;

                          if (!active || !item) {
                            return null;
                          }

                          return (
                            <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 shadow-[var(--shadow-md)]">
                              <p className="text-sm font-medium text-[var(--color-text)]">
                                {item.emoji} {item.name}
                              </p>
                              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                                {formatCents(item.amountCents)} ·{' '}
                                {percentageFormatter.format(item.percentage)}
                              </p>
                            </div>
                          );
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-text-secondary)]">
                        Despesas
                      </p>
                      <p className="mt-2 text-sm font-semibold text-[var(--color-text)] sm:text-base">
                        {formatCents(totalExpenses)}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {expenseChartData.map((item) => (
                    <div
                      key={item.categoryId}
                      className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: item.color }}
                          aria-hidden="true"
                        />
                        <p className="truncate text-sm font-medium text-[var(--color-text)]">
                          {item.emoji} {item.name}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {formatCents(item.amountCents)}
                        </p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {percentageFormatter.format(item.percentage)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Receitas por categoria"
            description="Consulte de onde vieram os seus rendimentos no mês selecionado."
          >
            {incomeCategoryItems.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Ainda não existem receitas registadas neste mês.
              </p>
            ) : (
              <div className="space-y-3">
                {incomeCategoryItems.map((item) => (
                  <div
                    key={item.categoryId}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className="h-3 w-3 rounded-full"
                        style={{ backgroundColor: item.color }}
                        aria-hidden="true"
                      />
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {item.emoji} {item.name}
                      </p>
                    </div>

                    <p className="text-sm font-semibold text-[var(--color-success)]">
                      {formatCents(item.amountCents)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Receitas por fonte"
            description="Veja que fontes de rendimento contribuíram para as receitas do mês selecionado."
          >
            {incomeSourceItems.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Ainda não existem receitas registadas neste mês.
              </p>
            ) : (
              <div className="space-y-3">
                {incomeSourceItems.map((item) => (
                  <div
                    key={item.sourceKey}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] px-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {item.name}
                      </p>
                      <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                        {item.typeLabel ?? 'Sem classificação'}
                        {item.isArchived ? ' · Arquivada' : ''}
                      </p>
                    </div>

                    <p className="text-sm font-semibold text-[var(--color-success)]">
                      {formatCents(item.amountCents)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>

          {hasFreelanceSources && (
            <SectionCard
              title="IRS — Categoria B"
              description="Acompanhe o rendimento bruto anual associado a fontes freelance."
            >
              {isLoadingFreelanceYtd ? (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  A carregar rendimento anual…
                </p>
              ) : freelanceYtdError ? (
                <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
                  {freelanceYtdError}
                </p>
              ) : (
                <div className="space-y-3 rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-4">
                  <div>
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Rendimento bruto YTD
                    </p>
                    <p className="mt-1 text-xl font-semibold text-[var(--color-text)]">
                      {formatCents(freelanceYtdAmount)}
                    </p>
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Para IRS categoria B — confirme com o seu contabilista.
                  </p>
                </div>
              )}
            </SectionCard>
          )}
        </div>
      </div>
    </div>
  );
}
