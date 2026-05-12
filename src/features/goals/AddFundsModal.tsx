import { useEffect, useMemo, useState } from 'react';
import { formatCents } from '@/lib/utils';
import type { SavingsGoal } from '@/types';
import { getGoalProgress, parseInputToCents } from './utils';

interface AddFundsModalProps {
  isOpen: boolean;
  goal: SavingsGoal | null;
  onClose: () => void;
  onAddFunds: (amountCents: number) => void | Promise<void>;
  isSubmitting: boolean;
}

export function AddFundsModal({
  isOpen,
  goal,
  onClose,
  onAddFunds,
  isSubmitting,
}: AddFundsModalProps) {
  const [amountInput, setAmountInput] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setAmountInput('');
    setValidationError(null);
  }, [goal, isOpen]);

  const progress = useMemo(() => (goal ? getGoalProgress(goal) : 0), [goal]);

  if (!isOpen || !goal) {
    return null;
  }

  const remainingCents = Math.max(goal.target_cents - goal.current_cents, 0);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const amountCents = parseInputToCents(amountInput);
    if (amountCents === null || amountCents <= 0) {
      setValidationError('Introduza um montante válido para adicionar.');
      return;
    }

    setValidationError(null);
    void onAddFunds(amountCents);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
      onClick={() => {
        if (!isSubmitting) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-funds-title"
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg)] shadow-[var(--shadow-md)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-divider)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="add-funds-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                Adicionar fundos
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {goal.emoji} {goal.name}
              </p>
            </div>

            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] text-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
              aria-label="Fechar modal"
            >
              ✕
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-4 overflow-y-auto bg-[var(--color-bg-secondary)] p-4 sm:p-5">
            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-medium text-[var(--color-text)]">Progresso atual</p>
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {Math.round(progress * 100)}%
                </span>
              </div>
              <div className="mt-3 h-3 overflow-hidden rounded-full bg-[var(--color-bg-tertiary)]">
                <div
                  className="h-full rounded-full transition-[width] duration-300"
                  style={{ width: `${progress * 100}%`, backgroundColor: goal.color }}
                />
              </div>
              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-[var(--color-text-secondary)]">
                <span>{formatCents(goal.current_cents)} poupados</span>
                <span>Faltam {formatCents(remainingCents)}</span>
              </div>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
              <label
                htmlFor="goal-add-funds"
                className="mb-2 block text-sm font-medium text-[var(--color-text)]"
              >
                Montante a adicionar
              </label>
              <div className="relative">
                <input
                  id="goal-add-funds"
                  type="text"
                  inputMode="decimal"
                  value={amountInput}
                  onChange={(event) => {
                    setAmountInput(event.target.value.replace(/[^\d,.\s€]/g, ''));
                    setValidationError(null);
                  }}
                  placeholder="0,00"
                  autoFocus
                  className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 pr-10 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]"
                />
                <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--color-text-secondary)]">
                  €
                </span>
              </div>
            </section>

            {validationError && (
              <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
                {validationError}
              </p>
            )}
          </div>

          <div className="border-t border-[var(--color-divider)] bg-[var(--color-bg)] p-4 sm:p-5">
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={onClose}
                disabled={isSubmitting}
                className="min-h-[44px] rounded-[var(--radius-md)] border border-[var(--color-border)] px-4 py-2.5 text-sm font-medium text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
              >
                {isSubmitting ? 'A adicionar…' : 'Adicionar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
