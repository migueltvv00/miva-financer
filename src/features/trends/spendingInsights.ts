import { getPeriodKey, getPreviousPeriod, getPeriodStart } from '@/lib/periodUtils';
import type { Category, Transaction } from '@/types';

export interface SpendingInsight {
  categoryId: string;
  emoji: string;
  name: string;
  currentCents: number;
  previousCents: number;
  deltaPct: number;
}

export interface SpendingInsightsSummary {
  totalCurrentCents: number;
  totalPreviousCents: number;
  totalDeltaPct: number;
  topChanges: SpendingInsight[];
  hasPreviousData: boolean;
}

function getDeltaPct(currentCents: number, previousCents: number) {
  if (previousCents <= 0) {
    return currentCents > 0 ? 100 : 0;
  }

  return ((currentCents - previousCents) / previousCents) * 100;
}

export function computeSpendingInsights(
  transactions: Transaction[],
  trendTransactions: Transaction[],
  categories: Category[],
  referenceDate: Date,
  monthStartDay: number
): SpendingInsightsSummary {
  const currentKey = getPeriodKey(referenceDate, monthStartDay);
  const previousDate = getPreviousPeriod(
    getPeriodStart(referenceDate, monthStartDay),
    monthStartDay
  );
  const previousKey = getPeriodKey(previousDate, monthStartDay);
  const currentByCategory = new Map<string, number>();
  const previousByCategory = new Map<string, number>();
  const categoryMap = new Map(categories.map((category) => [category.id, category]));
  const uniqueTransactions = new Map<string, Transaction>();

  [...transactions, ...trendTransactions].forEach((transaction) => {
    uniqueTransactions.set(transaction.id, transaction);
  });

  uniqueTransactions.forEach((transaction) => {
    if (transaction.type !== 'expense') {
      return;
    }

    const date = new Date(`${transaction.date}T12:00:00`);
    if (isNaN(date.getTime())) {
      return;
    }

    const periodKey = getPeriodKey(date, monthStartDay);

    if (periodKey === currentKey) {
      currentByCategory.set(
        transaction.category_id,
        (currentByCategory.get(transaction.category_id) ?? 0) + transaction.amount_cents
      );
      return;
    }

    if (periodKey === previousKey) {
      previousByCategory.set(
        transaction.category_id,
        (previousByCategory.get(transaction.category_id) ?? 0) + transaction.amount_cents
      );
    }
  });

  const totalCurrentCents = Array.from(currentByCategory.values()).reduce(
    (sum, amount) => sum + amount,
    0
  );
  const totalPreviousCents = Array.from(previousByCategory.values()).reduce(
    (sum, amount) => sum + amount,
    0
  );
  const hasPreviousData = totalPreviousCents > 0;
  const categoryIds = new Set([
    ...currentByCategory.keys(),
    ...previousByCategory.keys(),
  ]);

  const topChanges = Array.from(categoryIds)
    .map((categoryId) => {
      const category = categoryMap.get(categoryId);
      const currentCents = currentByCategory.get(categoryId) ?? 0;
      const previousCents = previousByCategory.get(categoryId) ?? 0;

      return {
        categoryId,
        emoji: category?.emoji ?? '🏷️',
        name: category?.name ?? 'Categoria removida',
        currentCents,
        previousCents,
        deltaPct: getDeltaPct(currentCents, previousCents),
      } satisfies SpendingInsight;
    })
    .filter((insight) => insight.currentCents !== insight.previousCents)
    .sort((left, right) => {
      const leftDelta = Math.abs(left.currentCents - left.previousCents);
      const rightDelta = Math.abs(right.currentCents - right.previousCents);

      if (rightDelta !== leftDelta) {
        return rightDelta - leftDelta;
      }

      return left.name.localeCompare(right.name, 'pt-PT');
    })
    .slice(0, 5);

  return {
    totalCurrentCents,
    totalPreviousCents,
    totalDeltaPct: getDeltaPct(totalCurrentCents, totalPreviousCents),
    topChanges,
    hasPreviousData,
  };
}
