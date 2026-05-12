import { useEffect, useMemo, useState } from 'react';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import type { InstalmentFormData } from './types';
import {
  getCurrentMonthValue,
  parseAmountInputToCents,
} from './utils';

interface InstalmentModalProps {
  isOpen: boolean;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (values: InstalmentFormData) => void | Promise<void>;
}

export function InstalmentModal({
  isOpen,
  isSubmitting,
  errorMessage,
  onClose,
  onSave,
}: InstalmentModalProps) {
  const categories = useCategoryStore((state) => state.categories);
  const expenseCategories = useMemo(
    () => categories.filter((category) => category.type === 'expense'),
    [categories]
  );

  const [name, setName] = useState('');
  const [totalAmountInput, setTotalAmountInput] = useState('');
  const [numInstalments, setNumInstalments] = useState('12');
  const [startMonth, setStartMonth] = useState(getCurrentMonthValue());
  const [categoryId, setCategoryId] = useState('');
  const [note, setNote] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  const totalCents = useMemo(
    () => parseAmountInputToCents(totalAmountInput),
    [totalAmountInput]
  );
  const parsedNumInstalments = useMemo(() => {
    const nextValue = Number.parseInt(numInstalments, 10);
    return Number.isInteger(nextValue) ? nextValue : null;
  }, [numInstalments]);
  const calculatedInstalmentCents = useMemo(() => {
    if (!totalCents || !parsedNumInstalments || parsedNumInstalments < 2) {
      return null;
    }

    return Math.ceil(totalCents / parsedNumInstalments);
  }, [parsedNumInstalments, totalCents]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    setValidationError(null);
    setName('');
    setTotalAmountInput('');
    setNumInstalments('12');
    setStartMonth(getCurrentMonthValue());
    setCategoryId('');
    setNote('');
  }, [isOpen]);

  if (!isOpen) {
    return null;
  }

  const visibleError = validationError ?? errorMessage;

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setValidationError('Indique um nome para o plano de prestações.');
      return;
    }

    if (!totalCents || totalCents <= 0) {
      setValidationError('Introduza um valor total válido.');
      return;
    }

    if (!parsedNumInstalments || parsedNumInstalments < 2 || parsedNumInstalments > 120) {
      setValidationError('Indique um número de prestações entre 2 e 120.');
      return;
    }

    if (!startMonth) {
      setValidationError('Escolha o mês de início.');
      return;
    }

    if (!categoryId) {
      setValidationError('Escolha uma categoria de despesa.');
      return;
    }

    setValidationError(null);
    void onSave({
      name: trimmedName,
      total_cents: totalCents,
      num_instalments: parsedNumInstalments,
      start_month: startMonth,
      category_id: categoryId,
      note: note.trim() ? note.trim() : null,
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
        aria-labelledby="instalment-modal-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg)] shadow-[var(--shadow-md)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-divider)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="instalment-modal-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                Nova prestação
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Crie um plano e gere automaticamente as despesas mensais.
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
              <div>
                <label
                  htmlFor="instalment-name"
                  className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                >
                  Nome
                </label>
                <input
                  id="instalment-name"
                  type="text"
                  value={name}
                  onChange={(event) => {
                    setName(event.target.value);
                    setValidationError(null);
                  }}
                  placeholder="Ex.: MacBook 14 — 12x"
                  autoFocus
                  maxLength={80}
                  className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                />
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="instalment-total"
                    className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                  >
                    Valor total
                  </label>
                  <div className="relative">
                    <input
                      id="instalment-total"
                      type="text"
                      inputMode="decimal"
                      value={totalAmountInput}
                      onChange={(event) => {
                        setTotalAmountInput(
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

                <div>
                  <label
                    htmlFor="instalment-count"
                    className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                  >
                    Número de prestações
                  </label>
                  <input
                    id="instalment-count"
                    type="number"
                    min={2}
                    max={120}
                    value={numInstalments}
                    onChange={(event) => {
                      setNumInstalments(event.target.value);
                      setValidationError(null);
                    }}
                    className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                  />
                </div>
              </div>

              <div className="mt-4 rounded-[var(--radius-md)] bg-[var(--color-accent-light)] px-3 py-3 text-sm text-[var(--color-accent)]">
                <p className="font-medium">Prestação mensal</p>
                <p className="mt-1 text-base font-semibold text-[var(--color-text)]">
                  {calculatedInstalmentCents === null
                    ? 'Preencha o valor total e o número de prestações.'
                    : formatCents(calculatedInstalmentCents)}
                </p>
              </div>
            </section>

            <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="instalment-start-month"
                    className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                  >
                    Mês de início
                  </label>
                  <input
                    id="instalment-start-month"
                    type="month"
                    value={startMonth}
                    onChange={(event) => {
                      setStartMonth(event.target.value);
                      setValidationError(null);
                    }}
                    className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                  />
                </div>

                <div>
                  <label
                    htmlFor="instalment-category"
                    className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                  >
                    Categoria
                  </label>
                  <select
                    id="instalment-category"
                    value={categoryId}
                    onChange={(event) => {
                      setCategoryId(event.target.value);
                      setValidationError(null);
                    }}
                    className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                  >
                    <option value="">Selecione uma categoria</option>
                    {expenseCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.emoji} {category.name}
                      </option>
                    ))}
                  </select>
                  {expenseCategories.length === 0 && (
                    <p className="mt-2 text-xs text-[var(--color-warning)]">
                      Crie primeiro uma categoria de despesa para associar a prestação.
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4">
                <label
                  htmlFor="instalment-note"
                  className="mb-2 block text-sm font-medium text-[var(--color-text)]"
                >
                  Nota
                </label>
                <input
                  id="instalment-note"
                  type="text"
                  value={note}
                  onChange={(event) => {
                    setNote(event.target.value);
                    setValidationError(null);
                  }}
                  maxLength={140}
                  placeholder="Opcional"
                  className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
                />
              </div>
            </section>

            {visibleError && (
              <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
                {visibleError}
              </p>
            )}
          </div>

          <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-divider)] bg-[var(--color-bg)] p-4 sm:flex-row sm:justify-end">
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
              {isSubmitting ? 'A criar…' : 'Criar plano de prestações'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
