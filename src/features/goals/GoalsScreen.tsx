import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import { useCategoryData } from '@/features/categories/useCategoryData';
import { AddFundsModal } from '@/features/goals/AddFundsModal';
import { GoalModal } from '@/features/goals/GoalModal';
import type { SavingsGoalFormValues } from '@/features/goals/types';
import {
  formatProjectedCompletionLabel,
  getGoalProgress,
  getProjectedCompletionDate,
  toLocalDate,
} from '@/features/goals/utils';
import { useSavingsGoalData } from '@/features/goals/useSavingsGoalData';
import { useAuth } from '@/contexts/AuthContext';
import { formatCents } from '@/lib/utils';
import type { SavingsGoal } from '@/types';

const CELEBRATION_HIDE_DELAY_MS = 3_000;
const TOAST_HIDE_DELAY_MS = 3_000;

function formatDeadline(dateValue: string) {
  return format(toLocalDate(dateValue), 'd MMM yyyy', { locale: pt });
}

function getErrorMessage(error: unknown, fallbackMessage: string) {
  return error instanceof Error && error.message ? error.message : fallbackMessage;
}

function sortActiveGoals(left: SavingsGoal, right: SavingsGoal) {
  const progressDifference = getGoalProgress(right) - getGoalProgress(left);

  if (progressDifference !== 0) {
    return progressDifference;
  }

  return right.created_at.localeCompare(left.created_at);
}

function sortCompletedGoals(left: SavingsGoal, right: SavingsGoal) {
  return right.created_at.localeCompare(left.created_at);
}

export function GoalsScreen() {
  const { user } = useAuth();
  const { error: categoryError } = useCategoryData(user?.id);
  const { goals, isLoading, error, createGoal, updateGoal, deleteGoal, addFunds } =
    useSavingsGoalData(user?.id);

  const [isGoalModalOpen, setIsGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<SavingsGoal | null>(null);
  const [goalForFunds, setGoalForFunds] = useState<SavingsGoal | null>(null);
  const [isSavingGoal, setIsSavingGoal] = useState(false);
  const [isAddingFunds, setIsAddingFunds] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [showCompletedGoals, setShowCompletedGoals] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!celebrationMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setCelebrationMessage(null);
    }, CELEBRATION_HIDE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [celebrationMessage]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setToastMessage(null);
    }, TOAST_HIDE_DELAY_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [toastMessage]);

  const activeGoals = useMemo(
    () => goals.filter((goal) => !goal.is_complete).sort(sortActiveGoals),
    [goals]
  );
  const completedGoals = useMemo(
    () => goals.filter((goal) => goal.is_complete).sort(sortCompletedGoals),
    [goals]
  );
  const messages = [categoryError, error].filter(
    (message): message is string => Boolean(message)
  );

  const handleOpenCreate = () => {
    setEditingGoal(null);
    setIsGoalModalOpen(true);
  };

  const handleOpenEdit = (goal: SavingsGoal) => {
    setEditingGoal(goal);
    setIsGoalModalOpen(true);
  };

  const handleCloseGoalModal = () => {
    if (isSavingGoal) {
      return;
    }

    setIsGoalModalOpen(false);
    setEditingGoal(null);
  };

  const handleCloseAddFundsModal = () => {
    if (isAddingFunds) {
      return;
    }

    setGoalForFunds(null);
  };

  const handleSaveGoal = async (values: SavingsGoalFormValues) => {
    setIsSavingGoal(true);

    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, values);
      } else {
        await createGoal(values);
      }

      setIsGoalModalOpen(false);
      setEditingGoal(null);
    } catch (saveError) {
      console.error('Erro ao guardar objetivo:', saveError);
      setToastMessage(
        getErrorMessage(saveError, 'Não foi possível guardar o objetivo de poupança.')
      );
    } finally {
      setIsSavingGoal(false);
    }
  };

  const handleAddFunds = async (amountCents: number) => {
    if (!goalForFunds) {
      return;
    }

    setIsAddingFunds(true);

    try {
      const completedNow = await addFunds(goalForFunds.id, amountCents);

      if (completedNow) {
        setCelebrationMessage(`🎉 Objetivo alcançado: ${goalForFunds.name}!`);
      }

      setGoalForFunds(null);
    } catch (addFundsError) {
      console.error('Erro ao adicionar fundos ao objetivo:', addFundsError);
      setToastMessage(
        getErrorMessage(
          addFundsError,
          'Não foi possível adicionar fundos ao objetivo.'
        )
      );
    } finally {
      setIsAddingFunds(false);
    }
  };

  const handleDeleteGoal = async (goal: SavingsGoal) => {
    const confirmed = window.confirm(
      `Tem a certeza que quer eliminar o objetivo “${goal.name}”?`
    );

    if (!confirmed) {
      return;
    }

    setPendingDeleteId(goal.id);

    try {
      await deleteGoal(goal.id);

      if (editingGoal?.id === goal.id) {
        setIsGoalModalOpen(false);
        setEditingGoal(null);
      }

      if (goalForFunds?.id === goal.id) {
        setGoalForFunds(null);
      }
    } catch (deleteError) {
      console.error('Erro ao eliminar objetivo:', deleteError);
      setToastMessage(
        getErrorMessage(deleteError, 'Não foi possível eliminar o objetivo de poupança.')
      );
    } finally {
      setPendingDeleteId(null);
    }
  };

  return (
    <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-4 bg-[var(--color-bg-secondary)] p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Objetivos de Poupança
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Acompanhe os seus objetivos e contribua para alcançá-los.
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="flex min-h-[44px] items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)]"
        >
          Novo objetivo
        </button>
      </div>

      {celebrationMessage && (
        <div
          className="animate-pulse rounded-[var(--radius-md)] border border-[var(--color-success)] bg-[var(--color-accent-light)] px-4 py-3 text-sm font-semibold text-[var(--color-accent)] shadow-[var(--shadow-sm)]"
          aria-live="polite"
        >
          {celebrationMessage}
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex flex-col gap-3">
          {messages.map((message) => (
            <p
              key={message}
              className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]"
            >
              {message}
            </p>
          ))}
        </div>
      )}

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
        <div className="border-b border-[var(--color-divider)] pb-4">
          <h2 className="text-base font-semibold text-[var(--color-text)]">
            Objetivos ativos
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
            Veja o progresso, previsão e próximos passos de cada objetivo.
          </p>
        </div>

        {isLoading ? (
          <div className="flex min-h-[180px] items-center justify-center text-sm text-[var(--color-text-secondary)]">
            A carregar objetivos…
          </div>
        ) : activeGoals.length === 0 ? (
          <div className="mt-4 rounded-[var(--radius-md)] border border-dashed border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-6 text-sm text-[var(--color-text-secondary)]">
            Ainda não tem objetivos ativos. Crie o primeiro para começar a poupar com intenção.
          </div>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            {activeGoals.map((goal) => {
              const progress = getGoalProgress(goal);
              const projectedCompletionDate = getProjectedCompletionDate(goal);
              const deadlineDate = goal.deadline ? toLocalDate(goal.deadline) : null;
              const exceedsDeadline = Boolean(
                projectedCompletionDate && deadlineDate && projectedCompletionDate > deadlineDate
              );

              return (
                <article
                  key={goal.id}
                  className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 shadow-[var(--shadow-sm)]"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg)] text-2xl shadow-[var(--shadow-sm)]">
                        {goal.emoji}
                      </div>
                      <div className="min-w-0">
                        <h3 className="truncate text-base font-semibold text-[var(--color-text)]">
                          {goal.name}
                        </h3>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          {formatCents(goal.current_cents)} / {formatCents(goal.target_cents)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(goal)}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-base transition-colors hover:bg-[var(--color-bg-hover)]"
                        aria-label={`Editar objetivo ${goal.name}`}
                      >
                        ✏️
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDeleteGoal(goal);
                        }}
                        disabled={pendingDeleteId === goal.id}
                        className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] text-base transition-colors hover:bg-[var(--color-bg-hover)] disabled:opacity-50"
                        aria-label={`Eliminar objetivo ${goal.name}`}
                      >
                        🗑️
                      </button>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="font-medium text-[var(--color-text)]">Progresso</span>
                      <span className="font-semibold text-[var(--color-text)]">
                        {Math.round(progress * 100)}%
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{ width: `${progress * 100}%`, backgroundColor: goal.color }}
                      />
                    </div>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-[var(--color-text-secondary)]">
                    {goal.monthly_contribution_cents > 0 && (
                      <p>
                        Contribuição mensal:{' '}
                        <span className="font-medium text-[var(--color-text)]">
                          {formatCents(goal.monthly_contribution_cents)}
                        </span>
                      </p>
                    )}

                    {projectedCompletionDate && (
                      <p>
                        Previsão:{' '}
                        <span className="font-medium text-[var(--color-text)]">
                          {formatProjectedCompletionLabel(projectedCompletionDate)}
                        </span>
                      </p>
                    )}

                    {goal.deadline && (
                      <p>
                        Data limite:{' '}
                        <span className="font-medium text-[var(--color-text)]">
                          {formatDeadline(goal.deadline)}
                        </span>
                      </p>
                    )}

                    {exceedsDeadline && (
                      <p className="font-medium text-[var(--color-warning)]">
                        ⚠️ Poderá não atingir até à data limite
                      </p>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => setGoalForFunds(goal)}
                    className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)]"
                  >
                    Adicionar fundos
                  </button>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
        <button
          type="button"
          onClick={() => setShowCompletedGoals((currentValue) => !currentValue)}
          aria-expanded={showCompletedGoals}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left"
        >
          <div>
            <h2 className="text-base font-semibold text-[var(--color-text)]">
              Objetivos concluídos
            </h2>
            <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
              {completedGoals.length === 0
                ? 'Sem objetivos concluídos por agora.'
                : `${completedGoals.length} objetivo${completedGoals.length === 1 ? '' : 's'} alcançado${completedGoals.length === 1 ? '' : 's'}.`}
            </p>
          </div>
          <span className="text-lg text-[var(--color-text-secondary)]">
            {showCompletedGoals ? '▾' : '▸'}
          </span>
        </button>

        {showCompletedGoals && (
          <div className="mt-4 border-t border-[var(--color-divider)] pt-4">
            {completedGoals.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Ainda não concluiu nenhum objetivo.
              </p>
            ) : (
              <ul className="space-y-3">
                {completedGoals.map((goal) => (
                  <li
                    key={goal.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-4 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--color-bg)] text-xl shadow-[var(--shadow-sm)]">
                        {goal.emoji}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[var(--color-text)]">
                          {goal.name}
                        </p>
                        <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                          {formatCents(goal.target_cents)}
                        </p>
                      </div>
                    </div>

                    <span className="rounded-full border border-[var(--color-success)] bg-[var(--color-accent-light)] px-3 py-1 text-xs font-semibold text-[var(--color-accent)]">
                      ✅ Concluído
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      <GoalModal
        isOpen={isGoalModalOpen}
        goal={editingGoal}
        onClose={handleCloseGoalModal}
        onSave={handleSaveGoal}
        isSubmitting={isSavingGoal}
      />

      <AddFundsModal
        isOpen={goalForFunds !== null}
        goal={goalForFunds}
        onClose={handleCloseAddFundsModal}
        onAddFunds={handleAddFunds}
        isSubmitting={isAddingFunds}
      />

      {toastMessage && (
        <div className="fixed bottom-24 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-[var(--radius-md)] bg-[var(--color-danger)] px-4 py-3 text-sm font-medium text-[var(--color-text-inverse)] shadow-[var(--shadow-md)] md:bottom-6">
          {toastMessage}
        </div>
      )}
    </div>
  );
}
export default GoalsScreen;
