import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useCategoryStore } from '@/store/categoryStore';
import type { Category } from '@/types';

interface UseCategoryDataResult {
  error: string | null;
}

export function useCategoryData(
  userId: string | null | undefined
): UseCategoryDataResult {
  const setCategories = useCategoryStore((state) => state.setCategories);
  const setLoading = useCategoryStore((state) => state.setLoading);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setCategories([]);
      setLoading(false);
      setError(null);
      return;
    }

    const loadCategories = async () => {
      // Only show loading on first load
      if (useCategoryStore.getState().categories.length === 0) setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('categories')
          .select('*')
          .eq('user_id', userId)
          .order('type', { ascending: true })
          .order('sort_order', { ascending: true });

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive) {
          return;
        }

        setCategories((data ?? []) as Category[]);
      } catch (err) {
        console.error('Erro ao carregar categorias:', err);

        if (!isActive) {
          return;
        }

        setError('Não foi possível carregar as categorias.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadCategories();

    return () => {
      isActive = false;
    };
  }, [setCategories, setLoading, userId]);

  return { error };
}
