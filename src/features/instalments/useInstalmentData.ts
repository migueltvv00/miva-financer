import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useInstalmentStore } from '@/store/instalmentStore';
import type { Instalment, Transaction } from '@/types';
import type { InstalmentFormData } from './types';
import {
  getInstalmentAmountForIndex,
  getInstalmentStartMonth,
  getInstalmentTransactionDate,
} from './utils';

interface UseInstalmentDataResult {
  instalments: Instalment[];
  isLoading: boolean;
  error: string | null;
  createInstalment: (data: InstalmentFormData) => Promise<void>;
  deleteInstalment: (id: string) => Promise<void>;
}

type RealtimeInstalmentPayload = {
  new: Partial<Instalment> & { id?: string };
  old: Partial<Instalment> & { id?: string };
};

type NewTransactionRecord = Pick<
  Transaction,
  | 'id'
  | 'user_id'
  | 'amount_cents'
  | 'type'
  | 'category_id'
  | 'source_id'
  | 'goal_id'
  | 'import_session_id'
  | 'instalment_id'
  | 'note'
  | 'date'
  | 'is_recurring'
  | 'recurrence_rule'
  | 'recurrence_parent_id'
>;

function getInstalmentRecordId(payload: RealtimeInstalmentPayload): string | null {
  return payload.new.id ?? payload.old.id ?? null;
}

export function useInstalmentData(
  userId: string | null | undefined
): UseInstalmentDataResult {
  const instalments = useInstalmentStore((state) => state.instalments);
  const isLoading = useInstalmentStore((state) => state.isLoading);
  const setInstalments = useInstalmentStore((state) => state.setInstalments);
  const addInstalment = useInstalmentStore((state) => state.addInstalment);
  const removeInstalment = useInstalmentStore((state) => state.removeInstalment);
  const setLoading = useInstalmentStore((state) => state.setLoading);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    if (!userId) {
      setInstalments([]);
      setLoading(false);
      setError(null);
      return;
    }

    const loadInstalments = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from('instalments')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (fetchError) {
          throw fetchError;
        }

        if (!isActive) {
          return;
        }

        setInstalments((data ?? []) as Instalment[]);
      } catch (err) {
        console.error('Erro ao carregar prestações:', err);

        if (!isActive) {
          return;
        }

        setInstalments([]);
        setError('Não foi possível carregar as prestações.');
      } finally {
        if (isActive) {
          setLoading(false);
        }
      }
    };

    void loadInstalments();

    return () => {
      isActive = false;
    };
  }, [setInstalments, setLoading, userId]);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`instalments:${userId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'instalments',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const recordId = getInstalmentRecordId(
            payload as { new: Record<string, unknown>; old: Record<string, unknown> }
          );

          if (!recordId) {
            return;
          }

          if (payload.eventType === 'DELETE') {
            useInstalmentStore.getState().removeInstalment(recordId);
            return;
          }

          useInstalmentStore.getState().addInstalment(payload.new as Instalment);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const createInstalment = useCallback(
    async (data: InstalmentFormData) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const trimmedName = data.name.trim();
      if (!trimmedName) {
        const validationError = new Error('Indique um nome para a prestação.');
        setError(validationError.message);
        throw validationError;
      }

      if (data.total_cents <= 0) {
        const validationError = new Error('Introduza um valor total válido.');
        setError(validationError.message);
        throw validationError;
      }

      if (data.num_instalments < 2) {
        const validationError = new Error('O plano deve ter pelo menos 2 prestações.');
        setError(validationError.message);
        throw validationError;
      }

      if (!data.category_id) {
        const validationError = new Error('Escolha uma categoria para a prestação.');
        setError(validationError.message);
        throw validationError;
      }

      const previousInstalments = instalments;
      const instalmentId = crypto.randomUUID();
      const startMonth = getInstalmentStartMonth(data.start_month);
      const instalmentCents = Math.ceil(data.total_cents / data.num_instalments);
      const note = data.note?.trim() ? data.note.trim() : null;

      setError(null);

      try {
        const { data: insertedInstalment, error: insertError } = await supabase
          .from('instalments')
          .insert({
            id: instalmentId,
            user_id: userId,
            name: trimmedName,
            total_cents: data.total_cents,
            instalment_cents: instalmentCents,
            num_instalments: data.num_instalments,
            paid_instalments: 0,
            start_month: startMonth,
            category_id: data.category_id,
            note,
          })
          .select('*')
          .single();

        if (insertError) {
          throw insertError;
        }

        const transactionsToInsert: NewTransactionRecord[] = Array.from(
          { length: data.num_instalments },
          (_, index) => ({
            id: crypto.randomUUID(),
            user_id: userId,
            amount_cents: getInstalmentAmountForIndex(
              data.total_cents,
              instalmentCents,
              data.num_instalments,
              index
            ),
            type: 'expense',
            category_id: data.category_id,
            source_id: null,
            goal_id: null,
            import_session_id: null,
            instalment_id: instalmentId,
            note: `${trimmedName} (${index + 1}/${data.num_instalments})`,
            date: getInstalmentTransactionDate(startMonth, index),
            is_recurring: false,
            recurrence_rule: null,
            recurrence_parent_id: null,
          })
        );

        const { error: transactionInsertError } = await supabase
          .from('transactions')
          .insert(transactionsToInsert);

        if (transactionInsertError) {
          const { error: rollbackError } = await supabase
            .from('instalments')
            .delete()
            .eq('id', instalmentId)
            .eq('user_id', userId);

          if (rollbackError) {
            console.error('Erro ao reverter prestação após falha nas transações:', rollbackError);
          }

          throw transactionInsertError;
        }

        addInstalment(insertedInstalment as Instalment);
      } catch (err) {
        console.error('Erro ao criar plano de prestações:', err);
        setInstalments(previousInstalments);
        setError('Não foi possível criar o plano de prestações.');
        throw err;
      }
    },
    [addInstalment, instalments, setInstalments, userId]
  );

  const deleteInstalment = useCallback(
    async (id: string) => {
      if (!userId) {
        const sessionError = new Error('Sessão indisponível.');
        setError(sessionError.message);
        throw sessionError;
      }

      const previousInstalments = instalments;

      setError(null);
      removeInstalment(id);

      try {
        const { error: deleteError } = await supabase
          .from('instalments')
          .delete()
          .eq('id', id)
          .eq('user_id', userId);

        if (deleteError) {
          throw deleteError;
        }
      } catch (err) {
        console.error('Erro ao eliminar plano de prestações:', err);
        setInstalments(previousInstalments);
        setError('Não foi possível eliminar o plano de prestações.');
        throw err;
      }
    },
    [instalments, removeInstalment, setInstalments, userId]
  );

  return {
    instalments,
    isLoading,
    error,
    createInstalment,
    deleteInstalment,
  };
}
