import { useEffect, useMemo, useRef, useState, type TouchEvent } from 'react';
import {
  addMonths,
  format,
  isSameMonth,
  isSameYear,
  isToday,
  isYesterday,
  subMonths,
} from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import { useCategoryData } from '@/features/categories/useCategoryData';
import {
  EditTransactionModal,
  type EditTransactionFormValues,
} from '@/features/transactions/EditTransactionModal';
import { useTransactionData } from '@/features/transactions/useTransactionData';
import { useAuth } from '@/hooks/useAuth';
import { getRecurringOccurrenceDate } from '@/lib/recurringEngine';
import { supabase } from '@/lib/supabase';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import { useTransactionStore } from '@/store/transactionStore';
import type { Category, Transaction } from '@/types';

const PULL_REFRESH_THRESHOLD = 72;

type TransactionGroup = {
  date: string;
  items: Transaction[];
};

type SwipeGesture = {
  id: string | null;
  startX: number;
  startY: number;
};

type PullGesture = {
  active: boolean;
  startX: number;
  startY: number;
};

type DeleteScope = 'single' | 'future' | null;

function toLocalDate(dateValue: string) {
  return new Date(`${dateValue}T12:00:00`);
}

function capitalizeLabel(value: string) {
  if (!value) {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function getMonthLabel(date: Date) {
  return capitalizeLabel(format(date, 'MMMM yyyy', { locale: pt }));
}

function getTransactionGroupLabel(dateValue: string) {
  const date = toLocalDate(dateValue);

  if (isToday(date)) {
    return 'Hoje';
  }

  if (isYesterday(date)) {
    return 'Ontem';
  }

  return format(
    date,
    isSameYear(date, new Date()) ? "d 'de' MMMM" : "d 'de' MMMM 'de' yyyy",
    { locale: pt }
  );
}

function sortTransactions(transactions: Transaction[]) {
  return [...transactions].sort(
    (left, right) =>
      right.date.localeCompare(left.date) ||
      right.created_at.localeCompare(left.created_at) ||
      right.id.localeCompare(left.id)
  );
}

function getTransactionCategory(
  categoryMap: Map<string, Category>,
  transaction: Transaction
) {
  return categoryMap.get(transaction.category_id) ?? null;
}

function isRecurringParent(transaction: Transaction) {
  return transaction.is_recurring && transaction.recurrence_parent_id === null;
}

function isRecurringTransaction(transaction: Transaction) {
  return transaction.is_recurring || transaction.recurrence_parent_id !== null;
}

async function deleteTransaction(userId: string, transactionId: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', transactionId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

async function deleteSingleRecurringParent(userId: string, transaction: Transaction) {
  if (!isRecurringParent(transaction)) {
    await deleteTransaction(userId, transaction.id);
    return;
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', userId)
    .eq('recurrence_parent_id', transaction.id)
    .gt('date', transaction.date)
    .order('date', { ascending: true });

  if (error) {
    throw error;
  }

  const futureChildren = (data ?? []) as Transaction[];

  if (futureChildren.length === 0) {
    if (!transaction.recurrence_rule) {
      throw new Error('A transação recorrente não tem frequência definida.');
    }

    const { error: updateError } = await supabase
      .from('transactions')
      .update({
        date: getRecurringOccurrenceDate(transaction.date, transaction.recurrence_rule),
        updated_at: new Date().toISOString(),
      })
      .eq('id', transaction.id)
      .eq('user_id', userId);

    if (updateError) {
      throw updateError;
    }

    return;
  }

  const [nextParent, ...remainingChildren] = futureChildren;

  if (!nextParent) {
    throw new Error('Não foi possível encontrar a próxima ocorrência recorrente.');
  }

  if (!transaction.recurrence_rule) {
    throw new Error('A transação recorrente não tem frequência definida.');
  }

  const timestamp = new Date().toISOString();

  if (remainingChildren.length > 0) {
    const { error: reparentError } = await supabase
      .from('transactions')
      .update({
        recurrence_parent_id: nextParent.id,
        updated_at: timestamp,
      })
      .in(
        'id',
        remainingChildren.map((child) => child.id)
      )
      .eq('user_id', userId);

    if (reparentError) {
      throw reparentError;
    }
  }

  const { error: promoteError } = await supabase
    .from('transactions')
    .update({
      is_recurring: true,
      recurrence_rule: transaction.recurrence_rule,
      recurrence_parent_id: null,
      updated_at: timestamp,
    })
    .eq('id', nextParent.id)
    .eq('user_id', userId);

  if (promoteError) {
    throw promoteError;
  }

  await deleteTransaction(userId, transaction.id);
}

async function deleteRecurringParentAndFuture(userId: string, transaction: Transaction) {
  const timestamp = new Date().toISOString();

  const { error: stopError } = await supabase
    .from('transactions')
    .update({
      is_recurring: false,
      recurrence_rule: null,
      updated_at: timestamp,
    })
    .eq('id', transaction.id)
    .eq('user_id', userId);

  if (stopError) {
    throw stopError;
  }

  const { error: childDeleteError } = await supabase
    .from('transactions')
    .delete()
    .eq('user_id', userId)
    .eq('recurrence_parent_id', transaction.id)
    .gte('date', transaction.date);

  if (childDeleteError) {
    throw childDeleteError;
  }

  await deleteTransaction(userId, transaction.id);
}

export function TransactionListScreen() {
  const { user } = useAuth();
  const categories = useCategoryStore((state) => state.categories);
  const isLoadingCategories = useCategoryStore((state) => state.isLoading);
  const transactions = useTransactionStore((state) => state.transactions);
  const isLoadingTransactions = useTransactionStore((state) => state.isLoading);
  const setTransactions = useTransactionStore((state) => state.setTransactions);

  const [selectedMonth, setSelectedMonth] = useState(() => new Date());
  const [selectedCategoryIds, setSelectedCategoryIds] = useState<string[]>([]);
  const [openDeleteActionId, setOpenDeleteActionId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [deleteScope, setDeleteScope] = useState<DeleteScope>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pullDistance, setPullDistance] = useState(0);

  const screenRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLElement | null>(null);
  const swipeGestureRef = useRef<SwipeGesture>({ id: null, startX: 0, startY: 0 });
  const pullGestureRef = useRef<PullGesture>({
    active: false,
    startX: 0,
    startY: 0,
  });
  const suppressRowClickRef = useRef(false);

  const { error: categoryError } = useCategoryData(user?.id);
  const {
    error: transactionError,
    isRefreshing,
    refreshTransactions,
  } = useTransactionData(user?.id, selectedMonth);

  const categoryMap = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories]
  );

  const filteredTransactions = useMemo(() => {
    const activeCategoryIds = new Set(selectedCategoryIds);
    return sortTransactions(transactions).filter((transaction) => {
      if (activeCategoryIds.size === 0) {
        return true;
      }

      return activeCategoryIds.has(transaction.category_id);
    });
  }, [selectedCategoryIds, transactions]);

  const groupedTransactions = useMemo<TransactionGroup[]>(() => {
    const groups: TransactionGroup[] = [];

    filteredTransactions.forEach((transaction) => {
      const currentGroup = groups[groups.length - 1];

      if (!currentGroup || currentGroup.date !== transaction.date) {
        groups.push({ date: transaction.date, items: [transaction] });
        return;
      }

      currentGroup.items.push(transaction);
    });

    return groups;
  }, [filteredTransactions]);

  const pullHint = isRefreshing
    ? 'A atualizar…'
    : pullDistance >= PULL_REFRESH_THRESHOLD
      ? 'Largue para atualizar'
      : 'Puxe para atualizar';

  useEffect(() => {
    scrollContainerRef.current = screenRef.current?.parentElement ?? null;
  }, []);

  useEffect(() => {
    setSelectedCategoryIds((currentValue) =>
      currentValue.filter((categoryId) => categoryMap.has(categoryId))
    );
  }, [categoryMap]);

  useEffect(() => {
    setOpenDeleteActionId(null);
    setDeleteScope(null);
    setPendingDelete(null);
  }, [selectedMonth, selectedCategoryIds]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, 3500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const handleToggleCategory = (categoryId: string) => {
    setSelectedCategoryIds((currentValue) =>
      currentValue.includes(categoryId)
        ? currentValue.filter((value) => value !== categoryId)
        : [...currentValue, categoryId]
    );
    setOpenDeleteActionId(null);
  };

  const handleRowPress = (transaction: Transaction) => {
    if (suppressRowClickRef.current) {
      suppressRowClickRef.current = false;
      return;
    }

    if (openDeleteActionId === transaction.id) {
      setOpenDeleteActionId(null);
      return;
    }

    setEditError(null);
    setEditingTransaction(transaction);
  };

  const handleDeleteRequest = (transaction: Transaction) => {
    setDeleteError(null);
    setOpenDeleteActionId(null);
    setDeleteScope(isRecurringParent(transaction) ? null : 'single');
    setPendingDelete(transaction);
  };

  const handleConfirmDelete = async () => {
    if (!user || !pendingDelete || !deleteScope || isDeleting) {
      return;
    }

    const previousTransactions = transactions;
    const nextTransactions = previousTransactions.filter((transaction) => {
      if (deleteScope === 'future' && pendingDelete.id === transaction.recurrence_parent_id) {
        return false;
      }

      return transaction.id !== pendingDelete.id;
    });

    setDeleteError(null);
    setIsDeleting(true);
    setTransactions(nextTransactions);

    try {
      if (isRecurringParent(pendingDelete)) {
        if (deleteScope === 'future') {
          await deleteRecurringParentAndFuture(user.id, pendingDelete);
        } else {
          await deleteSingleRecurringParent(user.id, pendingDelete);
        }
      } else {
        await deleteTransaction(user.id, pendingDelete.id);
      }

      if (editingTransaction?.id === pendingDelete.id) {
        setEditingTransaction(null);
      }

      setPendingDelete(null);
      setDeleteScope(null);
      await refreshTransactions();
    } catch (error) {
      console.error('Erro ao eliminar transação:', error);
      setTransactions(previousTransactions);
      setDeleteError('Não foi possível eliminar a transação. Tente novamente.');
      setToastMessage('Não foi possível eliminar a transação.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleSaveEdit = async (values: EditTransactionFormValues) => {
    if (!user || !editingTransaction || isSavingEdit) {
      return;
    }

    const previousTransactions = transactions;
    const updatedAt = new Date().toISOString();
    const updatedTransaction: Transaction = {
      ...editingTransaction,
      ...values,
      updated_at: updatedAt,
    };

    const staysInSelectedMonth = isSameMonth(
      toLocalDate(updatedTransaction.date),
      selectedMonth
    );

    const nextTransactions = staysInSelectedMonth
      ? sortTransactions(
          previousTransactions.map((transaction) =>
            transaction.id === updatedTransaction.id ? updatedTransaction : transaction
          )
        )
      : previousTransactions.filter(
          (transaction) => transaction.id !== updatedTransaction.id
        );

    setEditError(null);
    setIsSavingEdit(true);
    setTransactions(nextTransactions);

    try {
      const { error } = await supabase
        .from('transactions')
        .update({
          amount_cents: values.amount_cents,
          type: values.type,
          category_id: values.category_id,
          note: values.note,
          date: values.date,
          is_recurring: values.is_recurring,
          recurrence_rule: values.recurrence_rule,
          recurrence_parent_id: values.recurrence_parent_id,
          updated_at: updatedAt,
        })
        .eq('id', editingTransaction.id)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      setEditingTransaction(null);
    } catch (error) {
      console.error('Erro ao guardar alterações da transação:', error);
      setTransactions(previousTransactions);
      setEditError('Não foi possível guardar as alterações. Tente novamente.');
      setToastMessage('Não foi possível guardar as alterações.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleRootTouchStart = (event: TouchEvent<HTMLDivElement>) => {
    if (isRefreshing || event.touches.length !== 1) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container || container.scrollTop > 0) {
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    pullGestureRef.current = {
      active: true,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  };

  const handleRootTouchMove = (event: TouchEvent<HTMLDivElement>) => {
    if (!pullGestureRef.current.active || event.touches.length !== 1) {
      return;
    }

    const container = scrollContainerRef.current;
    if (!container || container.scrollTop > 0) {
      pullGestureRef.current.active = false;
      setPullDistance(0);
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - pullGestureRef.current.startX;
    const deltaY = touch.clientY - pullGestureRef.current.startY;

    if (deltaY <= 0) {
      setPullDistance(0);
      return;
    }

    if (Math.abs(deltaX) > deltaY) {
      pullGestureRef.current.active = false;
      setPullDistance(0);
      return;
    }

    const nextDistance = Math.min(deltaY * 0.45, 96);
    setPullDistance(nextDistance);

    if (event.cancelable) {
      event.preventDefault();
    }
  };

  const finishPullGesture = () => {
    const shouldRefresh =
      pullGestureRef.current.active && pullDistance >= PULL_REFRESH_THRESHOLD;

    pullGestureRef.current.active = false;
    setPullDistance(0);

    if (shouldRefresh) {
      void refreshTransactions();
    }
  };

  const handleRowTouchStart =
    (transactionId: string) => (event: TouchEvent<HTMLButtonElement>) => {
      if (event.touches.length !== 1) {
        return;
      }

      const touch = event.touches[0];
      if (!touch) {
        return;
      }

      swipeGestureRef.current = {
        id: transactionId,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    };

  const handleRowTouchEnd =
    (transactionId: string) => (event: TouchEvent<HTMLButtonElement>) => {
      if (swipeGestureRef.current.id !== transactionId) {
        return;
      }

      const touch = event.changedTouches[0];
      if (!touch) {
        return;
      }

      const deltaX = touch.clientX - swipeGestureRef.current.startX;
      const deltaY = touch.clientY - swipeGestureRef.current.startY;

      swipeGestureRef.current = { id: null, startX: 0, startY: 0 };

      if (Math.abs(deltaX) <= Math.abs(deltaY)) {
        return;
      }

      if (deltaX <= -48) {
        suppressRowClickRef.current = true;
        setOpenDeleteActionId(transactionId);
        return;
      }

      if (deltaX >= 48 && openDeleteActionId === transactionId) {
        suppressRowClickRef.current = true;
        setOpenDeleteActionId(null);
      }
    };

  const handleCloseDeleteDialog = () => {
    if (isDeleting) {
      return;
    }

    setDeleteError(null);
    setDeleteScope(null);
    setPendingDelete(null);
  };

  const isPendingDeleteRecurringParent = pendingDelete
    ? isRecurringParent(pendingDelete)
    : false;

  return (
    <div
      ref={screenRef}
      className="mx-auto flex min-h-full w-full max-w-3xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6"
      onTouchStart={handleRootTouchStart}
      onTouchMove={handleRootTouchMove}
      onTouchEnd={finishPullGesture}
      onTouchCancel={finishPullGesture}
      style={{ transform: pullDistance > 0 ? `translateY(${pullDistance}px)` : undefined }}
    >
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-[var(--color-text)]">
              Transações
            </h1>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              Veja e edite os seus movimentos por mês.
            </p>
          </div>

          {isRefreshing && (
            <div className="rounded-full bg-[var(--color-bg)] px-3 py-1 text-xs font-medium text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
              A atualizar…
            </div>
          )}
        </div>

        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-2 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSelectedMonth((currentValue) => subMonths(currentValue, 1))}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-xl text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)]"
              aria-label="Mês anterior"
            >
              ←
            </button>

            <div className="flex-1 text-center">
              <p className="text-lg font-semibold text-[var(--color-text)]">
                {getMonthLabel(selectedMonth)}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">{pullHint}</p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedMonth((currentValue) => addMonths(currentValue, 1))}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] text-xl text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)]"
              aria-label="Mês seguinte"
            >
              →
            </button>
          </div>
        </div>

        <div className="space-y-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-3 shadow-[var(--shadow-sm)]">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-medium text-[var(--color-text)]">Categorias</h2>
            <span className="text-xs text-[var(--color-text-secondary)]">
              Pode selecionar várias
            </span>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1">
            <button
              type="button"
              onClick={() => setSelectedCategoryIds([])}
              aria-pressed={selectedCategoryIds.length === 0}
              className={`flex min-h-[44px] shrink-0 items-center justify-center rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                selectedCategoryIds.length === 0
                  ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
                  : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
              }`}
            >
              Todas
            </button>

            {categories.map((category) => {
              const isSelected = selectedCategoryIds.includes(category.id);

              return (
                <button
                  key={category.id}
                  type="button"
                  onClick={() => handleToggleCategory(category.id)}
                  aria-pressed={isSelected}
                  className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                  }`}
                >
                  <span aria-hidden="true">{category.emoji}</span>
                  <span>{category.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {(categoryError || transactionError) && (
          <div className="space-y-2">
            {categoryError && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
                {categoryError}
              </div>
            )}
            {transactionError && (
              <div className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
                {transactionError}
              </div>
            )}
          </div>
        )}
      </div>

      {isLoadingTransactions || isLoadingCategories ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-6 text-center text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-sm)]">
          A carregar transações…
        </div>
      ) : groupedTransactions.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-10 text-center shadow-[var(--shadow-sm)]">
          <p className="text-base font-medium text-[var(--color-text)]">
            Sem transações este mês
          </p>
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            Ajuste os filtros ou adicione um novo movimento.
          </p>
        </div>
      ) : (
        <div className="space-y-4 pb-4">
          {groupedTransactions.map((group) => (
            <section key={group.date} className="space-y-2">
              <div className="px-1">
                <h2 className="text-sm font-semibold text-[var(--color-text-secondary)]">
                  {capitalizeLabel(getTransactionGroupLabel(group.date))}
                </h2>
              </div>

              <div className="space-y-2">
                {group.items.map((transaction) => {
                  const category = getTransactionCategory(categoryMap, transaction);
                  const isDeleteOpen = openDeleteActionId === transaction.id;

                  return (
                    <div
                      key={transaction.id}
                      className="relative overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] shadow-[var(--shadow-sm)]"
                    >
                      <button
                        type="button"
                        onClick={() => handleDeleteRequest(transaction)}
                        tabIndex={isDeleteOpen ? 0 : -1}
                        className="absolute inset-y-0 right-0 flex w-24 items-center justify-center bg-[var(--color-danger)] px-4 text-sm font-semibold text-[var(--color-text-inverse)]"
                        aria-label="Eliminar transação"
                      >
                        Eliminar
                      </button>

                      <button
                        type="button"
                        onClick={() => handleRowPress(transaction)}
                        onTouchStart={handleRowTouchStart(transaction.id)}
                        onTouchEnd={handleRowTouchEnd(transaction.id)}
                        className={`relative flex w-full items-center gap-3 bg-[var(--color-bg)] px-4 py-3 text-left transition-transform duration-200 ${
                          isDeleteOpen ? '-translate-x-24' : 'translate-x-0'
                        }`}
                      >
                        <div
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg shadow-[var(--shadow-sm)]"
                          style={{
                            backgroundColor: category?.color ?? 'var(--color-bg-secondary)',
                          }}
                          aria-hidden="true"
                        >
                          {category?.emoji ?? '❔'}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate text-sm font-semibold text-[var(--color-text)]">
                              {category?.name ?? 'Categoria removida'}
                            </span>
                            {isRecurringTransaction(transaction) && (
                              <span
                                className="shrink-0 text-sm text-[var(--color-text-secondary)]"
                                aria-label="Transação recorrente"
                                title="Transação recorrente"
                              >
                                🔁
                              </span>
                            )}
                          </div>

                          {transaction.note && (
                            <p className="mt-1 truncate text-sm text-[var(--color-text-secondary)]">
                              {transaction.note}
                            </p>
                          )}
                        </div>

                        <div className="shrink-0 text-right">
                          <p
                            className={`text-sm font-semibold tabular-nums ${
                              transaction.type === 'expense'
                                ? 'text-[var(--color-danger)]'
                                : 'text-[var(--color-success)]'
                            }`}
                          >
                            {transaction.type === 'expense' ? '-' : '+'}
                            {formatCents(transaction.amount_cents)}
                          </p>
                        </div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <EditTransactionModal
        isOpen={editingTransaction !== null}
        transaction={editingTransaction}
        isSubmitting={isSavingEdit}
        errorMessage={editError}
        onClose={() => {
          if (!isSavingEdit) {
            setEditError(null);
            setEditingTransaction(null);
          }
        }}
        onSave={handleSaveEdit}
      />

      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-md rounded-[var(--radius-lg)] bg-[var(--color-bg)] p-5 shadow-[var(--shadow-md)]">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">
              {isPendingDeleteRecurringParent && deleteScope === null
                ? 'Eliminar transação recorrente'
                : 'Confirmar eliminação'}
            </h3>
            <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
              {isPendingDeleteRecurringParent && deleteScope === null
                ? 'Escolha o que pretende eliminar nesta série recorrente.'
                : deleteScope === 'future'
                  ? 'Esta ação elimina esta transação e todas as ocorrências futuras.'
                  : isPendingDeleteRecurringParent
                    ? 'Esta ação elimina apenas esta ocorrência e mantém as futuras.'
                    : 'Eliminar esta transação?'}
            </p>
            <p className="mt-1 text-sm font-medium text-[var(--color-text)]">
              {formatCents(pendingDelete.amount_cents)} ·{' '}
              {categoryMap.get(pendingDelete.category_id)?.name ?? 'Categoria removida'}
            </p>

            {deleteError && (
              <p className="mt-4 rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-red-50 px-3 py-2 text-sm text-[var(--color-danger)]">
                {deleteError}
              </p>
            )}

            {isPendingDeleteRecurringParent && deleteScope === null ? (
              <div className="mt-5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => setDeleteScope('single')}
                  disabled={isDeleting}
                  className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
                >
                  Eliminar apenas esta
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteScope('future')}
                  disabled={isDeleting}
                  className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors disabled:opacity-50"
                >
                  Eliminar esta e todas as futuras
                </button>
                <button
                  type="button"
                  onClick={handleCloseDeleteDialog}
                  disabled={isDeleting}
                  className="min-h-[44px] rounded-[var(--radius-md)] px-4 py-2.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={handleCloseDeleteDialog}
                  disabled={isDeleting}
                  className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
                >
                  Cancelar
                </button>
                {isPendingDeleteRecurringParent && (
                  <button
                    type="button"
                    onClick={() => {
                      if (!isDeleting) {
                        setDeleteError(null);
                        setDeleteScope(null);
                      }
                    }}
                    disabled={isDeleting}
                    className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
                  >
                    Voltar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void handleConfirmDelete();
                  }}
                  disabled={isDeleting}
                  className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors disabled:opacity-50"
                >
                  {isDeleting ? 'A eliminar…' : 'Confirmar'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-3 text-sm font-medium text-[var(--color-text-inverse)] shadow-[var(--shadow-md)] md:bottom-6">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
