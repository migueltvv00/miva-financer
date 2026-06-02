import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getPeriodKey, getPeriodRange, getPreviousPeriod, getPeriodStart } from '@/lib/periodUtils';
import { useTransactionStore } from '@/store/transactionStore';
import { useSettingsStore } from '@/store/settingsStore';
import type { Transaction } from '@/types';

interface UseTrendTransactionDataResult {
  error: string | null;
}

export function useTrendTransactionData(
  userId: string | null | undefined,
  referenceDate: Date
): UseTrendTransactionDataResult {
  const setTrendTransactions = useTransactionStore(
    (state) => state.setTrendTransactions
  );
  const setTrendTransactionsLoading = useTransactionStore(
    (state) => state.setTrendTransactionsLoading
  );
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const monthStartDay = useSettingsStore((state) => state.settings.monthStartDay);
  const referenceMonthKey = useMemo(
    () => getPeriodKey(referenceDate, monthStartDay),
    [referenceDate, monthStartDay]
  );

  useEffect(() => {
    let isActive = true;
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (!userId) {
      setTrendTransactions([]);
      setTrendTransactionsLoading(false);
      setError(null);
      return () => {
        isActive = false;
      };
    }

    const loadTrendTransactions = async () => {
      setTrendTransactionsLoading(true);
      setError(null);

      try {
        // Get range covering 7 periods back from reference (6 previous + current)
        let rangeStartDate = getPeriodStart(referenceDate, monthStartDay);
        for (let i = 0; i < 6; i++) {
          rangeStartDate = getPreviousPeriod(rangeStartDate, monthStartDay);
        }
        const { periodEnd } = getPeriodRange(referenceDate, monthStartDay);
        const rangeStart = getPeriodKey(rangeStartDate, monthStartDay);

        const { data, error: fetchError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('type', 'expense')
          .gte('date', rangeStart)
          .lt('date', periodEnd)
          .order('date', { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive || requestId !== requestIdRef.current) {
          return;
        }

        setTrendTransactions((data ?? []) as Transaction[]);
      } catch (loadError) {
        console.error('Erro ao carregar tendências de despesa:', loadError);

        if (!isActive || requestId !== requestIdRef.current) {
          return;
        }

        setTrendTransactions([]);
        setError('Não foi possível carregar as tendências de despesa.');
      } finally {
        if (isActive && requestId === requestIdRef.current) {
          setTrendTransactionsLoading(false);
        }
      }
    };

    void loadTrendTransactions();

    return () => {
      isActive = false;
    };
  }, [
    monthStartDay,
    referenceDate,
    referenceMonthKey,
    setTrendTransactions,
    setTrendTransactionsLoading,
    userId,
  ]);

  return {
    error,
  };
}
