import { useCallback, useEffect, useRef, useState } from 'react';
import { getPeriodRange } from '@/lib/periodUtils';
import { supabase } from '@/lib/supabase';
import { useSettingsStore } from '@/store/settingsStore';
import { useTransactionStore } from '@/store/transactionStore';
import type { Transaction } from '@/types';

interface UseTransactionDataResult {
  error: string | null;
  isRefreshing: boolean;
  refreshTransactions: () => Promise<void>;
}

export function useTransactionData(
  userId: string | null | undefined,
  selectedMonth: Date
): UseTransactionDataResult {
  const setTransactions = useTransactionStore((state) => state.setTransactions);
  const setLoading = useTransactionStore((state) => state.setLoading);
  const [error, setError] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const isMountedRef = useRef(true);
  const requestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const loadTransactions = useCallback(
    async (options?: { silent?: boolean }) => {
      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;

      if (!userId) {
        setTransactions([]);
        setLoading(false);
        setError(null);
        setIsRefreshing(false);
        return;
      }

      const isSilent = options?.silent ?? false;
      const monthStartDay = useSettingsStore.getState().settings.monthStartDay;
      const { periodStart, periodEnd } = getPeriodRange(selectedMonth, monthStartDay);

      if (isSilent) {
        setIsRefreshing(true);
      } else {
        setLoading(true);
      }

      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .gte('date', periodStart)
          .lt('date', periodEnd)
          .order('date', { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setTransactions((data ?? []) as Transaction[]);
      } catch (err) {
        console.error('Erro ao carregar transações:', err);

        if (!isMountedRef.current || requestId !== requestIdRef.current) {
          return;
        }

        setError('Não foi possível carregar as transações.');
      } finally {
        const shouldUpdateState =
          isMountedRef.current && requestId === requestIdRef.current;

        if (shouldUpdateState) {
          setLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [selectedMonth, setLoading, setTransactions, userId]
  );

  useEffect(() => {
    void loadTransactions();
  }, [loadTransactions]);

  const refreshTransactions = useCallback(async () => {
    await loadTransactions({ silent: true });
  }, [loadTransactions]);

  return {
    error,
    isRefreshing,
    refreshTransactions,
  };
}
