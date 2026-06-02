import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useIncomeSourceStore } from '@/store/incomeSourceStore';
import type { IncomeSource } from '@/types';

export interface IncomeSourceFormValues {
  name: string;
  type: IncomeSource['type'];
}

interface UseIncomeSourceDataOptions {
  includeArchived?: boolean;
  enabled?: boolean;
}

interface UseIncomeSourceDataResult {
  sources: IncomeSource[];
  isLoading: boolean;
  error: string | null;
  createSource: (values: IncomeSourceFormValues) => Promise<void>;
  updateSource: (id: string, values: IncomeSourceFormValues) => Promise<void>;
  archiveSource: (id: string, shouldArchive?: boolean) => Promise<void>;
}

export function useIncomeSourceData(
  userId: string | null | undefined,
  options: UseIncomeSourceDataOptions = {}
): UseIncomeSourceDataResult {
  const { includeArchived = false, enabled = true } = options;
  const sources = useIncomeSourceStore((state) => state.sources);
  const isLoading = useIncomeSourceStore((state) => state.isLoading);
  const setSources = useIncomeSourceStore((state) => state.setSources);
  const addSource = useIncomeSourceStore((state) => state.addSource);
  const updateSourceInStore = useIncomeSourceStore((state) => state.updateSource);
  const removeSource = useIncomeSourceStore((state) => state.removeSource);
  const setLoading = useIncomeSourceStore((state) => state.setLoading);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setSources([]);
      setLoading(false);
      setError(null);
      return;
    }

    if (!enabled) {
      setLoading(false);
      setError(null);
      return;
    }

    const loadSources = async () => {
      if (useIncomeSourceStore.getState().sources.length === 0) setLoading(true);
      setError(null);

      try {
        let query = supabase
          .from('income_sources')
          .select('*')
          .eq('user_id', userId)
          .order('is_archived', { ascending: true })
          .order('created_at', { ascending: true });

        if (!includeArchived) {
          query = query.eq('is_archived', false);
        }

        const { data, error: fetchError } = await query;

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive) {
          return;
        }

        setSources((data ?? []) as IncomeSource[]);
      } catch (err) {
        console.error('Erro ao carregar fontes de rendimento:', err);

        if (!isActive) {
          return;
        }

        setSources([]);
        setError('Não foi possível carregar as fontes de rendimento.');
      } finally {
        setLoading(false);
      }
    };

    void loadSources();

    return () => {
      isActive = false;
    };
  }, [enabled, includeArchived, setLoading, setSources, userId]);

  const createSource = useCallback(
    async (values: IncomeSourceFormValues) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousSources = sources;
      const optimisticSource: IncomeSource = {
        id: crypto.randomUUID(),
        user_id: userId,
        name: values.name.trim(),
        type: values.type,
        is_archived: false,
        created_at: new Date().toISOString(),
      };

      setError(null);
      addSource(optimisticSource);

      try {
        const { data, error: insertError } = await supabase
          .from('income_sources')
          .insert({
            id: optimisticSource.id,
            user_id: optimisticSource.user_id,
            name: optimisticSource.name,
            type: optimisticSource.type,
            is_archived: optimisticSource.is_archived,
          })
          .select('*')
          .single();

        if (insertError) {
          throw insertError;
        }

        updateSourceInStore(optimisticSource.id, data as IncomeSource);
      } catch (err) {
        console.error('Erro ao criar fonte de rendimento:', err);
        setSources(previousSources);
        setError('Não foi possível guardar a fonte de rendimento.');
        throw err;
      }
    },
    [addSource, setSources, sources, updateSourceInStore, userId]
  );

  const updateSource = useCallback(
    async (id: string, values: IncomeSourceFormValues) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousSources = sources;
      const updates = {
        name: values.name.trim(),
        type: values.type,
      } satisfies Pick<IncomeSource, 'name' | 'type'>;

      setError(null);
      updateSourceInStore(id, updates);

      try {
        const { error: updateError } = await supabase
          .from('income_sources')
          .update(updates)
          .eq('id', id)
          .eq('user_id', userId);

        if (updateError) {
          throw updateError;
        }
      } catch (err) {
        console.error('Erro ao atualizar fonte de rendimento:', err);
        setSources(previousSources);
        setError('Não foi possível atualizar a fonte de rendimento.');
        throw err;
      }
    },
    [setSources, sources, updateSourceInStore, userId]
  );

  const archiveSource = useCallback(
    async (id: string, shouldArchive = true) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousSources = sources;
      setError(null);

      if (shouldArchive && !includeArchived) {
        removeSource(id);
      } else {
        updateSourceInStore(id, { is_archived: shouldArchive });
      }

      try {
        const { error: updateError } = await supabase
          .from('income_sources')
          .update({ is_archived: shouldArchive })
          .eq('id', id)
          .eq('user_id', userId);

        if (updateError) {
          throw updateError;
        }
      } catch (err) {
        console.error('Erro ao atualizar estado da fonte de rendimento:', err);
        setSources(previousSources);
        setError(
          shouldArchive
            ? 'Não foi possível arquivar a fonte de rendimento.'
            : 'Não foi possível reativar a fonte de rendimento.'
        );
        throw err;
      }
    },
    [includeArchived, removeSource, setSources, sources, updateSourceInStore, userId]
  );

  return {
    sources,
    isLoading,
    error,
    createSource,
    updateSource,
    archiveSource,
  };
}
