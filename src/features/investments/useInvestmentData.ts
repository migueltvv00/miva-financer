import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getPreviousPeriod, getNextPeriod, getPeriodKey } from '@/lib/periodUtils';
import { useInvestmentAccountStore } from '@/store/investmentAccountStore';
import { useInvestmentSnapshotStore } from '@/store/investmentSnapshotStore';
import { useNetWorthStore } from '@/store/netWorthStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { InvestmentAccount, InvestmentSnapshot, NetWorthEntry } from '@/types';
import type { InvestmentAccountFormValues } from './AccountModal';
import { getFriendlyErrorMessage, getMonthKey, getMonthLabel, getMonthStart } from './utils';

export interface UseInvestmentDataResult {
  accounts: InvestmentAccount[];
  snapshots: InvestmentSnapshot[];
  isLoading: boolean;
  error: string | null;
  selectedMonth: Date;
  monthLabel: string;
  monthKey: string;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  createAccount: (data: InvestmentAccountFormValues) => Promise<void>;
  updateAccount: (id: string, data: InvestmentAccountFormValues) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
  saveSnapshot: (accountId: string, valueCents: number, costBasisCents: number) => Promise<void>;
  copyFromLastMonth: () => void;
  syncToNetWorth: () => Promise<void>;
}

function sortSnapshots(snapshots: InvestmentSnapshot[]) {
  return [...snapshots].sort((left, right) => {
    if (left.month !== right.month) {
      return left.month.localeCompare(right.month);
    }

    if (left.account_id !== right.account_id) {
      return left.account_id.localeCompare(right.account_id);
    }

    return left.created_at.localeCompare(right.created_at);
  });
}

export function useInvestmentData(
  userId: string | null | undefined
): UseInvestmentDataResult {
  const accounts = useInvestmentAccountStore((state) => state.accounts);
  const accountsLoading = useInvestmentAccountStore((state) => state.isLoading);
  const setAccounts = useInvestmentAccountStore((state) => state.setAccounts);
  const addAccount = useInvestmentAccountStore((state) => state.addAccount);
  const updateStoredAccount = useInvestmentAccountStore((state) => state.updateAccount);
  const removeStoredAccount = useInvestmentAccountStore((state) => state.removeAccount);
  const setAccountsLoading = useInvestmentAccountStore((state) => state.setLoading);

  const storedSnapshots = useInvestmentSnapshotStore((state) => state.snapshots);
  const snapshotsLoading = useInvestmentSnapshotStore((state) => state.isLoading);
  const setStoredSnapshots = useInvestmentSnapshotStore((state) => state.setSnapshots);
  const addStoredSnapshot = useInvestmentSnapshotStore((state) => state.addSnapshot);
  const updateStoredSnapshot = useInvestmentSnapshotStore((state) => state.updateSnapshot);
  const setSnapshotsLoading = useInvestmentSnapshotStore((state) => state.setLoading);

  const [selectedMonth, setSelectedMonth] = useState(() => getMonthStart(new Date()));
  const [error, setError] = useState<string | null>(null);
  const [prefilledSnapshots, setPrefilledSnapshots] = useState<InvestmentSnapshot[]>([]);

  const monthKey = useMemo(() => getMonthKey(selectedMonth), [selectedMonth]);
  const monthLabel = useMemo(() => getMonthLabel(selectedMonth), [selectedMonth]);
  const isLoading = accountsLoading || snapshotsLoading;

  useEffect(() => {
    setPrefilledSnapshots([]);
  }, [monthKey]);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setAccounts([]);
      setStoredSnapshots([]);
      setAccountsLoading(false);
      setSnapshotsLoading(false);
      setError(null);
      setPrefilledSnapshots([]);
      return;
    }

    const loadData = async () => {
      setAccountsLoading(true);
      setSnapshotsLoading(true);
      setError(null);

      try {
        const [accountsResult, snapshotsResult] = await Promise.all([
          supabase
            .from('investment_accounts')
            .select('*')
            .eq('user_id', userId)
            .order('name', { ascending: true }),
          supabase
            .from('investment_snapshots')
            .select('*')
            .eq('user_id', userId)
            .order('month', { ascending: true }),
        ]);

        if (accountsResult.error) {
          throw accountsResult.error;
        }

        if (snapshotsResult.error) {
          throw snapshotsResult.error;
        }

        if (!isActive) {
          return;
        }

        setAccounts((accountsResult.data ?? []) as InvestmentAccount[]);
        setStoredSnapshots((snapshotsResult.data ?? []) as InvestmentSnapshot[]);
      } catch (loadError) {
        console.error('Erro ao carregar portfólio de investimentos:', loadError);

        if (!isActive) {
          return;
        }

        setAccounts([]);
        setStoredSnapshots([]);
        setError('Não foi possível carregar os dados de investimentos.');
      } finally {
        setAccountsLoading(false);
        setSnapshotsLoading(false);
      }
    };

    void loadData();

    return () => {
      isActive = false;
    };
  }, [setAccounts, setAccountsLoading, setSnapshotsLoading, setStoredSnapshots, userId]);

  const snapshots = useMemo(() => {
    const snapshotMap = new Map<string, InvestmentSnapshot>();

    for (const snapshot of storedSnapshots) {
      snapshotMap.set(`${snapshot.account_id}:${snapshot.month}`, snapshot);
    }

    for (const snapshot of prefilledSnapshots) {
      snapshotMap.set(`${snapshot.account_id}:${snapshot.month}`, snapshot);
    }

    return sortSnapshots([...snapshotMap.values()]);
  }, [prefilledSnapshots, storedSnapshots]);

  const goToPreviousMonth = useCallback(() => {
    const monthStartDay = useSettingsStore.getState().settings.monthStartDay;
    setError(null);
    setSelectedMonth((currentMonth) => getPreviousPeriod(currentMonth, monthStartDay));
  }, []);

  const goToNextMonth = useCallback(() => {
    const monthStartDay = useSettingsStore.getState().settings.monthStartDay;
    setError(null);
    setSelectedMonth((currentMonth) => getNextPeriod(currentMonth, monthStartDay));
  }, []);

  const createAccount = useCallback(
    async (data: InvestmentAccountFormValues) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousAccounts = accounts;
      const optimisticAccount: InvestmentAccount = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: data.name.trim(),
        type: data.type,
        color: data.color,
        created_at: new Date().toISOString(),
      };

      setError(null);
      addAccount(optimisticAccount);

      try {
        const { data: createdAccount, error: createError } = await supabase
          .from('investment_accounts')
          .insert(optimisticAccount)
          .select()
          .single();

        if (createError) {
          throw createError;
        }

        updateStoredAccount(optimisticAccount.id, createdAccount as InvestmentAccount);
      } catch (createAccountError) {
        console.error('Erro ao criar conta de investimento:', createAccountError);
        setAccounts(previousAccounts);
        const message = getFriendlyErrorMessage(
          createAccountError,
          'Não foi possível criar a conta de investimento.'
        );
        setError(message);
        throw new Error(message);
      }
    },
    [accounts, addAccount, setAccounts, updateStoredAccount, userId]
  );

  const updateAccount = useCallback(
    async (id: string, data: InvestmentAccountFormValues) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousAccounts = accounts;
      const updates: Partial<InvestmentAccount> = {
        name: data.name.trim(),
        type: data.type,
        color: data.color,
      };

      setError(null);
      updateStoredAccount(id, updates);

      try {
        const { data: updatedAccount, error: updateError } = await supabase
          .from('investment_accounts')
          .update(updates)
          .eq('id', id)
          .eq('user_id', userId)
          .select()
          .single();

        if (updateError) {
          throw updateError;
        }

        updateStoredAccount(id, updatedAccount as InvestmentAccount);
      } catch (updateAccountError) {
        console.error('Erro ao atualizar conta de investimento:', updateAccountError);
        setAccounts(previousAccounts);
        const message = getFriendlyErrorMessage(
          updateAccountError,
          'Não foi possível atualizar a conta de investimento.'
        );
        setError(message);
        throw new Error(message);
      }
    },
    [accounts, setAccounts, updateStoredAccount, userId]
  );

  const deleteAccount = useCallback(
    async (id: string) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousAccounts = accounts;
      const previousSnapshots = storedSnapshots;

      setError(null);
      removeStoredAccount(id);
      setStoredSnapshots(previousSnapshots.filter((snapshot) => snapshot.account_id !== id));
      setPrefilledSnapshots((currentSnapshots) =>
        currentSnapshots.filter((snapshot) => snapshot.account_id !== id)
      );

      try {
        const { error: deleteError } = await supabase
          .from('investment_accounts')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);

        if (deleteError) {
          throw deleteError;
        }
      } catch (deleteAccountError) {
        console.error('Erro ao eliminar conta de investimento:', deleteAccountError);
        setAccounts(previousAccounts);
        setStoredSnapshots(previousSnapshots);
        const message = getFriendlyErrorMessage(
          deleteAccountError,
          'Não foi possível eliminar a conta de investimento.'
        );
        setError(message);
        throw new Error(message);
      }
    },
    [accounts, removeStoredAccount, setAccounts, setStoredSnapshots, storedSnapshots, userId]
  );

  const saveSnapshot = useCallback(
    async (accountId: string, valueCents: number, costBasisCents: number) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      if (valueCents < 0 || costBasisCents < 0) {
        const validationError = new Error('Introduza apenas valores positivos.');
        setError(validationError.message);
        throw validationError;
      }

      const previousSnapshots = storedSnapshots;
      const currentSnapshot = storedSnapshots.find(
        (snapshot) => snapshot.account_id === accountId && snapshot.month === monthKey
      );
      const optimisticSnapshot: InvestmentSnapshot = {
        id: currentSnapshot?.id ?? crypto.randomUUID(),
        user_id: userId,
        account_id: accountId,
        month: monthKey,
        value_cents: valueCents,
        cost_basis_cents: costBasisCents,
        created_at: currentSnapshot?.created_at ?? new Date().toISOString(),
      };

      setError(null);

      if (currentSnapshot) {
        updateStoredSnapshot(currentSnapshot.id, optimisticSnapshot);
      } else {
        addStoredSnapshot(optimisticSnapshot);
      }

      try {
        const { data: savedSnapshot, error: upsertError } = await supabase
          .from('investment_snapshots')
          .upsert(optimisticSnapshot, { onConflict: 'account_id,month' })
          .select()
          .single();

        if (upsertError) {
          throw upsertError;
        }

        updateStoredSnapshot(optimisticSnapshot.id, savedSnapshot as InvestmentSnapshot);
        setPrefilledSnapshots((currentSnapshots) =>
          currentSnapshots.filter(
            (snapshot) =>
              !(snapshot.account_id === accountId && snapshot.month === optimisticSnapshot.month)
          )
        );

        // Sync to net_worth_items
        try {
          const account = accounts.find((a) => a.id === accountId);
          const { data: nwItem } = await supabase
            .from('net_worth_items')
            .select('id')
            .eq('user_id', userId)
            .eq('source', 'investment')
            .eq('source_id', accountId)
            .maybeSingle();

          if (nwItem) {
            await supabase
              .from('net_worth_items')
              .update({ value_cents: valueCents, updated_at: new Date().toISOString() })
              .eq('id', nwItem.id);
          } else {
            await supabase.from('net_worth_items').insert({
              user_id: userId,
              name: account?.name ?? 'Investimento',
              type: 'asset',
              value_cents: valueCents,
              source: 'investment',
              source_id: accountId,
              emoji: '📈',
            });
          }
        } catch {
          // Non-critical
        }
      } catch (saveSnapshotError) {
        console.error('Erro ao guardar registo de investimento:', saveSnapshotError);
        setStoredSnapshots(previousSnapshots);
        const message = getFriendlyErrorMessage(
          saveSnapshotError,
          'Não foi possível guardar o valor mensal da conta.'
        );
        setError(message);
        throw new Error(message);
      }
    },
    [accounts, addStoredSnapshot, monthKey, setStoredSnapshots, storedSnapshots, updateStoredSnapshot, userId]
  );

  const copyFromLastMonth = useCallback(() => {
    const monthStartDay = useSettingsStore.getState().settings.monthStartDay;
    const previousMonthKey = getPeriodKey(getPreviousPeriod(selectedMonth, monthStartDay), monthStartDay);
    const previousMonthSnapshots = storedSnapshots.filter(
      (snapshot) => snapshot.month === previousMonthKey
    );

    if (previousMonthSnapshots.length === 0) {
      const copyError = new Error('Não existem dados no mês anterior para copiar.');
      setError(copyError.message);
      throw copyError;
    }

    const currentMonthSnapshotIds = new Set(
      storedSnapshots
        .filter((snapshot) => snapshot.month === monthKey)
        .map((snapshot) => snapshot.account_id)
    );

    const snapshotsToCopy = previousMonthSnapshots.filter(
      (snapshot) => !currentMonthSnapshotIds.has(snapshot.account_id)
    );

    if (snapshotsToCopy.length === 0) {
      const copyError = new Error('Todas as contas já têm dados neste mês.');
      setError(copyError.message);
      throw copyError;
    }

    setError(null);
    setPrefilledSnapshots(
      snapshotsToCopy.map((snapshot) => ({
        ...snapshot,
        id: crypto.randomUUID(),
        month: monthKey,
        created_at: new Date().toISOString(),
      }))
    );
  }, [monthKey, selectedMonth, storedSnapshots]);

  const syncToNetWorth = useCallback(async () => {
    if (!userId) {
      const sessionError = new Error('Sessão indisponível.');
      setError(sessionError.message);
      throw sessionError;
    }

    const currentMonthSnapshots = snapshots.filter((snapshot) => snapshot.month === monthKey);

    if (currentMonthSnapshots.length === 0) {
      const syncError = new Error('Não existem valores de investimento neste mês para sincronizar.');
      setError(syncError.message);
      throw syncError;
    }

    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const investmentAssets = currentMonthSnapshots.reduce<Record<string, number>>(
      (assets, snapshot) => {
        const account = accountById.get(snapshot.account_id);

        if (!account) {
          return assets;
        }

        assets[account.name] = snapshot.value_cents;
        return assets;
      },
      {}
    );

    if (Object.keys(investmentAssets).length === 0) {
      const syncError = new Error('Crie pelo menos uma conta com valores registados para sincronizar.');
      setError(syncError.message);
      throw syncError;
    }

    setError(null);

    try {
      const { data: existingEntry, error: fetchError } = await supabase
        .from('net_worth_entries')
        .select('*')
        .eq('user_id', userId)
        .eq('month', monthKey)
        .maybeSingle();

      if (fetchError) {
        throw fetchError;
      }

      const localEntry = useNetWorthStore
        .getState()
        .entries.find((entry) => entry.month === monthKey);
      const optimisticEntry: NetWorthEntry = {
        id: existingEntry?.id ?? localEntry?.id ?? crypto.randomUUID(),
        user_id: userId,
        month: monthKey,
        assets_json: {
          ...(existingEntry?.assets_json ?? localEntry?.assets_json ?? {}),
          ...investmentAssets,
        },
        liabilities_json: existingEntry?.liabilities_json ?? localEntry?.liabilities_json ?? {},
        created_at:
          existingEntry?.created_at ?? localEntry?.created_at ?? new Date().toISOString(),
      };

      const { data: syncedEntry, error: upsertError } = await supabase
        .from('net_worth_entries')
        .upsert(optimisticEntry, { onConflict: 'user_id,month' })
        .select()
        .single();

      if (upsertError) {
        throw upsertError;
      }

      const netWorthStore = useNetWorthStore.getState();
      const existingLocalEntry = netWorthStore.entries.find(
        (entry) => entry.month === monthKey
      );

      if (existingLocalEntry) {
        netWorthStore.updateEntry(existingLocalEntry.id, syncedEntry as NetWorthEntry);
      } else {
        netWorthStore.addEntry(syncedEntry as NetWorthEntry);
      }
    } catch (syncError) {
      console.error('Erro ao sincronizar investimentos com património líquido:', syncError);
      const message = getFriendlyErrorMessage(
        syncError,
        'Não foi possível sincronizar com o património líquido.'
      );
      setError(message);
      throw new Error(message);
    }
  }, [accounts, monthKey, snapshots, userId]);

  return {
    accounts,
    snapshots,
    isLoading,
    error,
    selectedMonth,
    monthLabel,
    monthKey,
    goToPreviousMonth,
    goToNextMonth,
    createAccount,
    updateAccount,
    deleteAccount,
    saveSnapshot,
    copyFromLastMonth,
    syncToNetWorth,
  };
}
