import { useBudgetStore } from '@/store/budgetStore';
import { useCategoryStore } from '@/store/categoryStore';
import { useIncomeSourceStore } from '@/store/incomeSourceStore';
import { useInstalmentStore } from '@/store/instalmentStore';
import { useInvestmentAccountStore } from '@/store/investmentAccountStore';
import { useInvestmentSnapshotStore } from '@/store/investmentSnapshotStore';
import { useMonthlyPlanStore } from '@/store/monthlyPlanStore';
import { useNetWorthItemStore } from '@/store/netWorthItemStore';
import { useNetWorthStore } from '@/store/netWorthStore';
import { useSavingsGoalStore } from '@/store/savingsGoalStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useTransactionStore } from '@/store/transactionStore';

/**
 * Resets all domain stores to their initial empty state.
 * Called before signing out to prevent one user's data leaking into the next session.
 */
export function resetAllStores() {
  useTransactionStore.setState({
    transactions: [],
    trendTransactions: [],
    isLoading: false,
    isLoadingTrendTransactions: false,
    error: null,
  });
  useBudgetStore.setState({ budgets: [], isLoading: false });
  useCategoryStore.setState({ categories: [], isLoading: false });
  useIncomeSourceStore.setState({ sources: [], isLoading: false });
  useInstalmentStore.setState({ instalments: [], isLoading: false });
  useInvestmentAccountStore.setState({ accounts: [], isLoading: false });
  useInvestmentSnapshotStore.setState({ snapshots: [], isLoading: false });
  useMonthlyPlanStore.setState({ plan: null, isLoading: false });
  useNetWorthItemStore.setState({ items: [], isLoading: false });
  useNetWorthStore.setState({ entries: [], isLoading: false });
  useSavingsGoalStore.setState({ goals: [], isLoading: false });
  useSettingsStore.setState({
    settings: { monthStartDay: 1, reminderDaysBefore: 3, autoReportPdf: true, theme: 'system' },
    isLoading: false,
    lastFetchedAt: null,
  });
}
