import { getPeriodKey, getPreviousPeriod, getPeriodStart } from '@/lib/periodUtils';
import { useSettingsStore } from '@/store/settingsStore';
import type { Category, Transaction } from '@/types';

export interface CategoryTrend {
  categoryId: string;
  avg3m: number;
  avg6m: number;
  currentMonth: number;
  monthlyData: { month: string; amount: number }[];
  insight: 'above' | 'below' | 'normal';
  insightText: string;
}

function getMonthKeysForTrend(referenceDate: Date, count: number, offset: number, monthStartDay: number): string[] {
  let date = getPeriodStart(referenceDate, monthStartDay);
  // Move back by offset periods
  for (let i = 0; i < offset; i++) {
    date = getPreviousPeriod(date, monthStartDay);
  }
  // Now collect `count` periods going further back
  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    keys.unshift(getPeriodKey(date, monthStartDay));
    date = getPreviousPeriod(date, monthStartDay);
  }
  return keys;
}

function calculateAverage(monthTotals: Map<string, number>, monthKeys: string[]) {
  const amounts = monthKeys
    .map((monthKey) => monthTotals.get(monthKey) ?? 0)
    .filter((amount) => amount > 0);

  if (amounts.length === 0) {
    return 0;
  }

  const total = amounts.reduce((sum, amount) => sum + amount, 0);
  return Math.round(total / amounts.length);
}

function getPercentageDelta(currentMonth: number, average: number) {
  if (average <= 0) {
    return currentMonth > 0 ? 100 : 0;
  }

  return Math.round(((currentMonth - average) / average) * 100);
}

function getInsight(currentMonth: number, avg3m: number): Pick<CategoryTrend, 'insight' | 'insightText'> {
  if (avg3m > 0 && currentMonth < avg3m * 0.8) {
    const delta = Math.abs(getPercentageDelta(currentMonth, avg3m));
    return {
      insight: 'below',
      insightText: `Abaixo da média (-${delta}%)`,
    };
  }

  if (currentMonth > avg3m * 1.2) {
    const delta = Math.abs(getPercentageDelta(currentMonth, avg3m));
    return {
      insight: 'above',
      insightText: `Acima da média (+${delta}%)`,
    };
  }

  return {
    insight: 'normal',
    insightText: 'Dentro da média habitual',
  };
}

export function computeCategoryTrends(
  transactions: Transaction[],
  categories: Category[],
  referenceDate = new Date()
): CategoryTrend[] {
  const monthStartDay = useSettingsStore.getState().settings.monthStartDay;
  const chartMonthKeys = getMonthKeysForTrend(referenceDate, 6, 0, monthStartDay);
  const currentMonthKey =
    chartMonthKeys.length > 0
      ? chartMonthKeys[chartMonthKeys.length - 1]!
      : getPeriodKey(referenceDate, monthStartDay);
  const avg3MonthKeys = getMonthKeysForTrend(referenceDate, 3, 1, monthStartDay);
  const avg6MonthKeys = getMonthKeysForTrend(referenceDate, 6, 1, monthStartDay);
  const relevantMonthKeys = new Set([...chartMonthKeys, ...avg6MonthKeys]);
  const totalsByCategory = new Map<string, Map<string, number>>();

  transactions.forEach((transaction) => {
    if (transaction.type !== 'expense') {
      return;
    }

    const txPeriodKey = getPeriodKey(new Date(transaction.date), monthStartDay);

    if (!relevantMonthKeys.has(txPeriodKey)) {
      return;
    }

    const categoryTotals = totalsByCategory.get(transaction.category_id) ?? new Map();
    categoryTotals.set(
      txPeriodKey,
      (categoryTotals.get(txPeriodKey) ?? 0) + transaction.amount_cents
    );
    totalsByCategory.set(transaction.category_id, categoryTotals);
  });

  return categories
    .filter((category) => category.type === 'expense')
    .map((category) => {
      const monthTotals = totalsByCategory.get(category.id);

      if (!monthTotals) {
        return null;
      }

      const monthlyData = chartMonthKeys.map((month) => ({
        month,
        amount: monthTotals.get(month) ?? 0,
      }));
      const hasRecentSpending = monthlyData.some((entry) => entry.amount > 0);

      if (!hasRecentSpending) {
        return null;
      }

      const avg3m = calculateAverage(monthTotals, avg3MonthKeys);
      const avg6m = calculateAverage(monthTotals, avg6MonthKeys);
      const currentMonth = monthTotals.get(currentMonthKey) ?? 0;
      const insight = getInsight(currentMonth, avg3m);

      return {
        categoryId: category.id,
        avg3m,
        avg6m,
        currentMonth,
        monthlyData,
        insight: insight.insight,
        insightText: insight.insightText,
      } satisfies CategoryTrend;
    })
    .filter((trend): trend is CategoryTrend => trend !== null);
}
