import { useCallback, useEffect, useMemo, useState } from 'react';
import { addMonths, format, startOfMonth } from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import { supabase } from '@/lib/supabase';
import { useNetWorthStore } from '@/store/netWorthStore';
import type { NetWorthEntry } from '@/types';

interface NetWorthPrefillData {
  assets: Record<string, number>;
  liabilities: Record<string, number>;
}

interface UseNetWorthDataResult {
  entries: NetWorthEntry[];
  currentEntry: NetWorthEntry | null;
  isLoading: boolean;
  error: string | null;
  selectedMonth: Date;
  monthLabel: string;
  monthKey: string;
  goToPreviousMonth: () => void;
  goToNextMonth: () => void;
  saveEntry: (
    assets: Record<string, number>,
    liabilities: Record<string, number>
  ) => Promise<void>;
  copyFromLastMonth: () => NetWorthPrefillData | null;
  deleteEntry: () => Promise<void>;
}

function getMonthStart(date: Date) {
  return startOfMonth(date);
}

function getMonthKey(date: Date) {
  return format(getMonthStart(date), 'yyyy-MM-dd');
}

function getMonthLabel(date: Date) {
  const label = format(getMonthStart(date), 'LLLL yyyy', { locale: pt });
  return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
}

export function useNetWorthData(
  userId: string | null | undefined
): UseNetWorthDataResult {
  const entries = useNetWorthStore((state) => state.entries);
  const isLoading = useNetWorthStore((state) => state.isLoading);
  const setEntries = useNetWorthStore((state) => state.setEntries);
  const addEntry = useNetWorthStore((state) => state.addEntry);
  const updateEntry = useNetWorthStore((state) => state.updateEntry);
  const removeEntry = useNetWorthStore((state) => state.removeEntry);
  const setLoading = useNetWorthStore((state) => state.setLoading);

  const [selectedMonth, setSelectedMonth] = useState(() => getMonthStart(new Date()));
  const [error, setError] = useState<string | null>(null);

  const monthKey = useMemo(() => getMonthKey(selectedMonth), [selectedMonth]);
  const monthLabel = useMemo(() => getMonthLabel(selectedMonth), [selectedMonth]);
  const currentEntry = useMemo(
    () => entries.find((entry) => entry.month === monthKey) ?? null,
    [entries, monthKey]
  );

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setEntries([]);
      setLoading(false);
      setError(null);
      return;
    }

    const loadEntries = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('net_worth_entries')
          .select('*')
          .eq('user_id', userId)
          .order('month', { ascending: true });

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive) {
          return;
        }

        setEntries((data ?? []) as NetWorthEntry[]);
      } catch (err) {
        console.error('Erro ao carregar património líquido:', err);

        if (!isActive) {
          return;
        }

        setEntries([]);
        setError('Não foi possível carregar os registos de património líquido.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadEntries();

    return () => {
      isActive = false;
    };
  }, [setEntries, setLoading, userId]);

  const goToPreviousMonth = useCallback(() => {
    setError(null);
    setSelectedMonth((currentMonth) => getMonthStart(addMonths(currentMonth, -1)));
  }, []);

  const goToNextMonth = useCallback(() => {
    setError(null);
    setSelectedMonth((currentMonth) => getMonthStart(addMonths(currentMonth, 1)));
  }, []);

  const saveEntry = useCallback(
    async (assets: Record<string, number>, liabilities: Record<string, number>) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousEntries = entries;
      const optimisticEntry: NetWorthEntry = {
        id: currentEntry?.id ?? crypto.randomUUID(),
        user_id: userId,
        month: monthKey,
        assets_json: assets,
        liabilities_json: liabilities,
        created_at: currentEntry?.created_at ?? new Date().toISOString(),
      };

      setError(null);

      if (currentEntry) {
        updateEntry(currentEntry.id, optimisticEntry);
      } else {
        addEntry(optimisticEntry);
      }

      try {
        const { data, error: upsertError } = await supabase
          .from('net_worth_entries')
          .upsert(
            {
              id: optimisticEntry.id,
              user_id: optimisticEntry.user_id,
              month: optimisticEntry.month,
              assets_json: optimisticEntry.assets_json,
              liabilities_json: optimisticEntry.liabilities_json,
            },
            { onConflict: 'user_id,month' }
          )
          .select()
          .single();

        if (upsertError) {
          throw upsertError;
        }

        updateEntry(optimisticEntry.id, data as NetWorthEntry);
      } catch (err) {
        console.error('Erro ao guardar património líquido:', err);
        setEntries(previousEntries);
        const saveError = new Error('Não foi possível guardar o património líquido.');
        setError(saveError.message);
        throw saveError;
      }
    },
    [addEntry, currentEntry, entries, monthKey, setEntries, updateEntry, userId]
  );

  const copyFromLastMonth = useCallback(() => {
    setError(null);
    const previousMonthKey = getMonthKey(addMonths(selectedMonth, -1));
    const previousEntry = entries.find((entry) => entry.month === previousMonthKey);

    if (!previousEntry) {
      return null;
    }

    return {
      assets: previousEntry.assets_json,
      liabilities: previousEntry.liabilities_json,
    };
  }, [entries, selectedMonth]);

  const deleteEntry = useCallback(async () => {
    if (!userId) {
      const sessionError = new Error('Sessão indisponível.');
      setError(sessionError.message);
      throw sessionError;
    }

    if (!currentEntry) {
      return;
    }

    const previousEntries = entries;

    setError(null);
    removeEntry(currentEntry.id);

    try {
      const { error: deleteError } = await supabase
        .from('net_worth_entries')
        .delete()
        .eq('id', currentEntry.id)
        .eq('user_id', userId);

      if (deleteError) {
        throw deleteError;
      }
    } catch (err) {
      console.error('Erro ao eliminar património líquido:', err);
      setEntries(previousEntries);
      const entryDeleteError = new Error(
        'Não foi possível eliminar a entrada de património líquido.'
      );
      setError(entryDeleteError.message);
      throw entryDeleteError;
    }
  }, [currentEntry, entries, removeEntry, setEntries, userId]);

  return {
    entries,
    currentEntry,
    isLoading,
    error,
    selectedMonth,
    monthLabel,
    monthKey,
    goToPreviousMonth,
    goToNextMonth,
    saveEntry,
    copyFromLastMonth,
    deleteEntry,
  };
}
