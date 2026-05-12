import { useEffect, useMemo, useRef, useState } from 'react';
import { endOfMonth, format, startOfMonth, subMonths } from 'date-fns';
import { supabase } from '@/lib/supabase';
import { useTransactionStore } from '@/store/transactionStore';
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
  const referenceMonthKey = useMemo(
    () => format(startOfMonth(referenceDate), 'yyyy-MM'),
    [referenceDate]
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
        const currentMonth = startOfMonth(referenceDate);
        const rangeStart = format(startOfMonth(subMonths(currentMonth, 6)), 'yyyy-MM-dd');
        const rangeEnd = format(endOfMonth(currentMonth), 'yyyy-MM-dd');
        const { data, error: fetchError } = await supabase
          .from('transactions')
          .select('*')
          .eq('user_id', userId)
          .eq('type', 'expense')
          .gte('date', rangeStart)
          .lte('date', rangeEnd)
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
