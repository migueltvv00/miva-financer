import { useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { pt } from 'date-fns/locale';
import { Bar, BarChart, ResponsiveContainer, XAxis } from 'recharts';
import { useCategoryData } from '@/features/categories/useCategoryData';
import {
  computeCategoryTrends,
  type CategoryTrend,
} from '@/features/trends/trendUtils';
import { useTrendTransactionData } from '@/features/trends/useTrendTransactionData';
import { useAuth } from '@/contexts/AuthContext';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import { useTransactionStore } from '@/store/transactionStore';

function getInsightTextClass(insight: CategoryTrend['insight']) {
  switch (insight) {
    case 'above':
      return 'text-[var(--color-danger)]';
    case 'below':
      return 'text-[var(--color-success)]';
    default:
      return 'text-[var(--color-text-secondary)]';
  }
}

function getInsightBadgeStyle(insight: CategoryTrend['insight']) {
  switch (insight) {
    case 'above':
      return {
        backgroundColor: 'var(--color-danger)',
        borderColor: 'var(--color-danger)',
        color: 'var(--color-text-inverse)',
      };
    case 'below':
      return {
        backgroundColor: 'var(--color-success)',
        borderColor: 'var(--color-success)',
        color: 'var(--color-text-inverse)',
      };
    default:
      return {
        backgroundColor: 'var(--color-bg-secondary)',
        borderColor: 'var(--color-border)',
        color: 'var(--color-text-secondary)',
      };
  }
}

function formatMonthLabel(month: string) {
  // month is a period key like "2026-04-01" or "2026-04-23"
  const date = parseISO(month);
  if (isNaN(date.getTime())) return month;
  const label = format(date, 'MMM', { locale: pt }).replace('.', '');
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function TrendsScreen() {
  const { user } = useAuth();
  const categories = useCategoryStore((state) => state.categories);
  const isLoadingCategories = useCategoryStore((state) => state.isLoading);
  const trendTransactions = useTransactionStore((state) => state.trendTransactions);
  const isLoadingTrendTransactions = useTransactionStore(
    (state) => state.isLoadingTrendTransactions
  );
  const referenceDate = useMemo(() => new Date(), []);

  const { error: categoryError } = useCategoryData(user?.id);
  const { error: trendError } = useTrendTransactionData(user?.id, referenceDate);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );
  const trends = useMemo(
    () => computeCategoryTrends(trendTransactions, categories, referenceDate),
    [categories, referenceDate, trendTransactions]
  );

  const errorMessages = [categoryError, trendError].filter(
    (message): message is string => Boolean(message)
  );
  const isLoading = isLoadingCategories || isLoadingTrendTransactions;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Tendências de Despesa
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Análise dos últimos 6 meses por categoria.
          </p>
        </div>

        {isLoading && (
          <div className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
            A carregar…
          </div>
        )}
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

      {trends.length === 0 ? (
        <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-sm)]">
          <p className="text-sm text-[var(--color-text-secondary)]">
            Ainda não existem despesas suficientes para analisar tendências.
          </p>
        </section>
      ) : (
        <div className="grid gap-4">
          {trends.map((trend) => {
            const category = categoryMap.get(trend.categoryId);

            if (!category) {
              return null;
            }

            return (
              <section
                key={trend.categoryId}
                className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-[var(--color-text)]">
                      <span className="mr-2" aria-hidden="true">
                        {category.emoji}
                      </span>
                      {category.name}
                    </h2>
                    <p
                      className={`mt-2 text-sm font-medium ${getInsightTextClass(
                        trend.insight
                      )}`}
                    >
                      {trend.insightText}
                    </p>
                  </div>

                  <span
                    className="inline-flex min-h-[44px] items-center rounded-full border px-3 py-2 text-xs font-semibold"
                    style={getInsightBadgeStyle(trend.insight)}
                  >
                    {trend.insight === 'above'
                      ? 'Acima da média'
                      : trend.insight === 'below'
                        ? 'Abaixo da média'
                        : 'Dentro da média'}
                  </span>
                </div>

                <div className="mt-4 h-[120px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trend.monthlyData}>
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10, fill: 'var(--color-text-secondary)' }}
                        tickFormatter={formatMonthLabel}
                      />
                      <Bar
                        dataKey="amount"
                        fill={category.color}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-4 flex flex-col gap-2 text-sm text-[var(--color-text-secondary)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
                  <span>Média 3M: {formatCents(trend.avg3m)}</span>
                  <span>Média 6M: {formatCents(trend.avg6m)}</span>
                  <span>Este mês: {formatCents(trend.currentMonth)}</span>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
export default TrendsScreen;
