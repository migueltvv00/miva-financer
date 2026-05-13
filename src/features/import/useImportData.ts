import { useCallback, useEffect, useState } from 'react';
import { BANK_LABELS, type BankId, type ParsedTransaction } from '@/features/import/csvParsers';
import { supabase } from '@/lib/supabase';
import type { ImportSession, Transaction } from '@/types';

export interface ImportSessionSummary extends ImportSession {
  canUndo: boolean;
}

export interface ImportTransactionInput extends ParsedTransaction {
  category_id: string;
}

interface ImportedTransactionRow extends Transaction {
  import_session_id: string;
}

interface UseImportDataResult {
  sessions: ImportSessionSummary[];
  isLoading: boolean;
  isImporting: boolean;
  undoingSessionId: string | null;
  error: string | null;
  importTransactions: (
    bank: BankId,
    filename: string,
    transactions: ImportTransactionInput[],
    rowCount?: number
  ) => Promise<ImportSessionSummary>;
  undoImport: (sessionId: string) => Promise<void>;
  refreshSessions: () => Promise<void>;
}

function wasTransactionEdited(transaction: Pick<Transaction, 'created_at' | 'updated_at'>) {
  return new Date(transaction.updated_at).getTime() > new Date(transaction.created_at).getTime() + 1000;
}

export function useImportData(
  userId: string | null | undefined
): UseImportDataResult {
  const [sessions, setSessions] = useState<ImportSessionSummary[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [undoingSessionId, setUndoingSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshSessions = useCallback(async () => {
    if (!userId) {
      setSessions([]);
      setError(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('import_sessions')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (sessionError) {
        throw sessionError;
      }

      const typedSessions = (sessionData ?? []) as ImportSession[];
      const sessionIds = typedSessions.map((session) => session.id);

      if (sessionIds.length === 0) {
        setSessions([]);
        return;
      }

      const { data: transactionData, error: transactionError } = await supabase
        .from('transactions')
        .select('id, import_session_id, created_at, updated_at')
        .eq('user_id', userId)
        .in('import_session_id', sessionIds);

      if (transactionError) {
        throw transactionError;
      }

      const editedSessionIds = new Set(
        ((transactionData ?? []) as Array<Pick<Transaction, 'id' | 'import_session_id' | 'created_at' | 'updated_at'>>)
          .filter(
            (transaction) =>
              transaction.import_session_id !== null && wasTransactionEdited(transaction)
          )
          .map((transaction) => transaction.import_session_id as string)
      );

      setSessions(
        typedSessions.map((session) => ({
          ...session,
          canUndo: !editedSessionIds.has(session.id),
        }))
      );
    } catch (fetchError) {
      console.error('Erro ao carregar importações:', fetchError);
      setError('Não foi possível carregar o histórico de importações.');
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void refreshSessions();
  }, [refreshSessions]);

  const importTransactions = useCallback(
    async (
      bank: BankId,
      filename: string,
      transactions: ImportTransactionInput[],
      rowCount = transactions.length
    ) => {
      if (!userId) {
        throw new Error('Sessão indisponível.');
      }

      setIsImporting(true);
      setError(null);

      let createdSessionId: string | null = null;

      try {
        const { data: sessionData, error: sessionError } = await supabase
          .from('import_sessions')
          .insert({
            user_id: userId,
            bank: BANK_LABELS[bank],
            filename,
            row_count: rowCount,
            imported_count: transactions.length,
          })
          .select()
          .single();

        if (sessionError) {
          throw sessionError;
        }

        const session = sessionData as ImportSession;
        createdSessionId = session.id;

        const timestamp = new Date().toISOString();
        const rows: ImportedTransactionRow[] = transactions.map((transaction) => ({
          id: crypto.randomUUID(),
          user_id: userId,
          amount_cents: transaction.amount_cents,
          type: transaction.type,
          category_id: transaction.category_id,
          source_id: null,
          goal_id: null,
          import_session_id: session.id,
          instalment_id: null,
          note: transaction.description.trim() || null,
          date: transaction.date,
          is_recurring: false,
          recurrence_rule: null,
          recurrence_parent_id: null,
          created_at: timestamp,
          updated_at: timestamp,
          payment_method: null,
        }));

        const { error: insertError } = await supabase.from('transactions').insert(rows);

        if (insertError) {
          throw insertError;
        }

        const sessionSummary: ImportSessionSummary = {
          ...session,
          canUndo: true,
        };

        setSessions((currentSessions) => [sessionSummary, ...currentSessions]);
        return sessionSummary;
      } catch (importError) {
        console.error('Erro ao importar transações:', importError);

        if (createdSessionId) {
          await supabase
            .from('import_sessions')
            .delete()
            .eq('id', createdSessionId)
            .eq('user_id', userId);
        }

        setError('Não foi possível importar o extrato.');
        throw importError;
      } finally {
        setIsImporting(false);
      }
    },
    [userId]
  );

  const undoImport = useCallback(
    async (sessionId: string) => {
      if (!userId) {
        throw new Error('Sessão indisponível.');
      }

      setUndoingSessionId(sessionId);
      setError(null);

      try {
        const { error: deleteTransactionsError } = await supabase
          .from('transactions')
          .delete()
          .eq('user_id', userId)
          .eq('import_session_id', sessionId);

        if (deleteTransactionsError) {
          throw deleteTransactionsError;
        }

        const { error: deleteSessionError } = await supabase
          .from('import_sessions')
          .delete()
          .eq('id', sessionId)
          .eq('user_id', userId);

        if (deleteSessionError) {
          throw deleteSessionError;
        }

        setSessions((currentSessions) =>
          currentSessions.filter((session) => session.id !== sessionId)
        );
      } catch (undoError) {
        console.error('Erro ao anular importação:', undoError);
        setError('Não foi possível anular a importação.');
        throw undoError;
      } finally {
        setUndoingSessionId(null);
      }
    },
    [userId]
  );

  return {
    sessions,
    isLoading,
    isImporting,
    undoingSessionId,
    error,
    importTransactions,
    undoImport,
    refreshSessions,
  };
}
