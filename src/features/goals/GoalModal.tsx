import { useEffect, useState } from 'react';
import type { SavingsGoal } from '@/types';
import type { SavingsGoalFormValues } from './types';
import {
  GOAL_COLORS,
  GOAL_EMOJIS,
  formatEditableCents,
  parseInputToCents,
} from './utils';

interface GoalModalProps {
  isOpen: boolean;
  goal: SavingsGoal | null;
  onClose: () => void;
  onSave: (values: SavingsGoalFormValues) => void | Promise<void>;
  isSubmitting: boolean;
}

export function GoalModal({
  isOpen,
  goal,
  onClose,
  onSave,
  isSubmitting,
}: GoalModalProps) {
  const [name, setName] = useState('');
  const [targetAmountInput, setTargetAmountInput] = useState('');
  const [monthlyContributionInput, setMonthlyContributionInput] = useState('');
  const [deadline, setDeadline] = useState('');
  const [emoji, setEmoji] = useState<string>(GOAL_EMOJIS[0]);
  const [color, setColor] = useState<string>(GOAL_COLORS[0]);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValidationError(null);
    setName(goal?.name ?? '');
    setTargetAmountInput(goal ? formatEditableCents(goal.target_cents) : '');
    setMonthlyContributionInput(
      goal && goal.monthly_contribution_cents > 0
        ? formatEditableCents(goal.monthly_contribution_cents)
        : ''
    );
    setDeadline(goal?.deadline ?? '');
    setEmoji(goal?.emoji ?? GOAL_EMOJIS[0]);
    setColor(goal?.color ?? GOAL_COLORS[0]);
  }, [goal, isOpen]);

  if (!isOpen) {
    return null;
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Indique um nome para o objetivo.');
      return;
    }

    const targetCents = parseInputToCents(targetAmountInput);
    if (targetCents === null || targetCents <= 0) {
      setValidationError('Introduza um valor válido para o objetivo.');
      return;
    }

    const monthlyContributionValue = monthlyContributionInput.trim();
    const monthlyContributionCents = monthlyContributionValue
      ? parseInputToCents(monthlyContributionValue)
      : 0;

    if (
      monthlyContributionValue &&
      (monthlyContributionCents === null || monthlyContributionCents <= 0)
    ) {
      setValidationError('Introduza uma contribuição mensal válida.');
      return;
    }

    setValidationError(null);
    void onSave({
      name: trimmedName,
      target_cents: targetCents,
      monthly_contribution_cents: monthlyContributionCents ?? 0,
      deadline: deadline || null,
      color,
      emoji,
    });
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
        aria-labelledby="goal-modal-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg)] shadow-[var(--shadow-md)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-divider)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="goal-modal-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                {goal ? 'Editar objetivo' : 'Novo objetivo'}
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                {goal
                  ? 'Atualize o nome, valor e prazo do seu objetivo.'
                  : 'Defina um novo objetivo de poupança para acompanhar o progresso.'}
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
              <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                Emoji
              </span>
              <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
                {GOAL_EMOJIS.map((option) => {
                  const isSelected = emoji === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setEmoji(option);
                        setValidationError(null);
                      }}
                      aria-pressed={isSelected}
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border text-xl transition-colors ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                          : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-secondary)]'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
              <div>
                <label
                  htmlFor="goal-name"
                  className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                >
                  Nome
                </label>
                <input
                  id="goal-name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setValidationError(null);
                  }}
                  placeholder="Ex.: Fundo para casa"
                  autoFocus
                  maxLength={60}
                  className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="goal-target"
                    className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                  >
                    Valor objetivo
                  </label>
                  <div className="relative">
                    <input
                      id="goal-target"
                      type="text"
                      inputMode="decimal"
                      value={targetAmountInput}
                      onChange={(event) => {
                        setTargetAmountInput(event.target.value.replace(/[^\d,.\s€]/g, ''));
                        setValidationError(null);
                      }}
                      placeholder="0,00"
                      className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 pr-10 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--color-text-secondary)]">
                      €
                    </span>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="goal-monthly"
                    className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                  >
                    Contribuição mensal (opcional)
                  </label>
                  <div className="relative">
                    <input
                      id="goal-monthly"
                      type="text"
                      inputMode="decimal"
                      value={monthlyContributionInput}
                      onChange={(event) => {
                        setMonthlyContributionInput(
                          event.target.value.replace(/[^\d,.\s€]/g, '')
                        );
                        setValidationError(null);
                      }}
                      placeholder="0,00"
                      className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 pr-10 text-sm text-[var(--color-text)] outline-none transition-colors placeholder:text-[var(--color-text-secondary)] focus:border-[var(--color-accent)]"
                    />
                    <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-[var(--color-text-secondary)]">
                      €
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="goal-deadline"
                  className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                >
                  Data limite (opcional)
                </label>
                <input
                  id="goal-deadline"
                  type="date"
                  value={deadline}
                  onChange={(event) => {
                    setDeadline(event.target.value);
                    setValidationError(null);
                  }}
                  className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                />
              </div>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
              <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
                Cor
              </span>
              <div className="grid grid-cols-5 gap-2">
                {GOAL_COLORS.map((option) => {
                  const isSelected = color === option;

                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setColor(option);
                        setValidationError(null);
                      }}
                      aria-pressed={isSelected}
                      className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--radius-md)] border transition-colors ${
                        isSelected
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                          : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-secondary)]'
                      }`}
                    >
                      <span
                        className="h-6 w-6 rounded-full border border-[var(--color-border)]"
                        style={{ backgroundColor: option }}
                      />
                    </button>
                  );
                })}
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
                {isSubmitting ? 'A guardar…' : 'Guardar objetivo'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
