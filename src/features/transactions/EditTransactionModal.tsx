import { useEffect, useMemo, useRef, useState } from 'react';
import { format } from 'date-fns';
import { pt } from 'date-fns/locale/pt';
import { NumPad } from '@/components/NumPad';
import { IncomeSourceSelector } from '@/features/income-sources/IncomeSourceSelector';
import { useIncomeSourceData } from '@/features/income-sources/useIncomeSourceData';
import { formatCents } from '@/lib/utils';
import { useCategoryStore } from '@/store/categoryStore';
import {
  PAYMENT_METHOD_OPTIONS,
  PAYMENT_METHOD_SHORT_LABELS,
  type Transaction,
} from '@/types';

const MAX_AMOUNT_CENTS = 99_999_999;
const TYPE_LABELS: Record<Transaction['type'], string> = {
  expense: 'Despesa',
  income: 'Receita',
};

const RECURRENCE_OPTIONS: Array<{
  value: NonNullable<Transaction['recurrence_rule']>;
  label: string;
}> = [
  { value: 'weekly', label: 'Semanal' },
  { value: 'monthly', label: 'Mensal' },
  { value: 'yearly', label: 'Anual' },
];

export interface EditTransactionFormValues {
  amount_cents: number;
  type: Transaction['type'];
  category_id: string;
  source_id: string | null;
  payment_method: Transaction['payment_method'];
  note: string | null;
  date: string;
  is_recurring: boolean;
  recurrence_rule: Transaction['recurrence_rule'];
  recurrence_parent_id: string | null;
}

interface EditTransactionModalProps {
  isOpen: boolean;
  transaction: Transaction | null;
  isSubmitting: boolean;
  errorMessage: string | null;
  onClose: () => void;
  onSave: (values: EditTransactionFormValues) => void | Promise<void>;
}

function normalizeAmountInput(value: string) {
  if (!value) {
    return '';
  }

  if (value.includes('.')) {
    const [wholePart = '0', decimalPart = ''] = value.split('.');
    const normalizedWholePart = wholePart.replace(/^0+(?=\d)/, '') || '0';
    return `${normalizedWholePart}.${decimalPart}`;
  }

  return value.replace(/^0+(?=\d)/, '');
}

function parseAmountInputToCents(value: string) {
  if (!value) {
    return 0;
  }

  if (value.includes('.')) {
    const [wholePart = '0', decimalPart = ''] = value.split('.');

    if (!/^\d+$/.test(wholePart) || !/^\d*$/.test(decimalPart)) {
      return 0;
    }

    const cents = Number(wholePart) * 100 + Number((decimalPart + '00').slice(0, 2));
    return Number.isFinite(cents) ? Math.min(cents, MAX_AMOUNT_CENTS) : 0;
  }

  if (!/^\d+$/.test(value)) {
    return 0;
  }

  const cents = Number(value);
  return Number.isFinite(cents) ? Math.min(cents, MAX_AMOUNT_CENTS) : 0;
}

function appendAmountInput(currentValue: string, key: string) {
  if (key === '.') {
    if (currentValue.includes('.')) {
      return currentValue;
    }

    return currentValue ? `${currentValue}.` : '0.';
  }

  if (!/^\d$/.test(key)) {
    return currentValue;
  }

  if (currentValue.includes('.')) {
    const [wholePart, decimalPart = ''] = currentValue.split('.');
    if (decimalPart.length >= 2) {
      return currentValue;
    }

    const nextValue = normalizeAmountInput(`${wholePart}.${decimalPart}${key}`);
    return parseAmountInputToCents(nextValue) > MAX_AMOUNT_CENTS
      ? currentValue
      : nextValue;
  }

  const nextValue = normalizeAmountInput(`${currentValue}${key}`);
  return parseAmountInputToCents(nextValue) > MAX_AMOUNT_CENTS
    ? currentValue
    : nextValue;
}

function backspaceAmountInput(currentValue: string) {
  return normalizeAmountInput(currentValue.slice(0, -1));
}

function formatEntryDate(dateValue: string) {
  return format(new Date(`${dateValue}T12:00:00`), 'd MMM yyyy', { locale: pt });
}

function formatAmountInputFromCents(amountCents: number) {
  const euros = Math.floor(amountCents / 100);
  const cents = amountCents % 100;
  return cents === 0 ? String(euros) : `${euros}.${String(cents).padStart(2, '0')}`;
}

export function EditTransactionModal({
  isOpen,
  transaction,
  isSubmitting,
  errorMessage,
  onClose,
  onSave,
}: EditTransactionModalProps) {
  const categories = useCategoryStore((state) => state.categories);
  const [type, setType] = useState<Transaction['type']>('expense');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<Transaction['payment_method']>(null);
  const [amountInput, setAmountInput] = useState('');
  const [note, setNote] = useState('');
  const [date, setDate] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceRule, setRecurrenceRule] = useState<
    NonNullable<Transaction['recurrence_rule']>
  >('monthly');
  const [validationError, setValidationError] = useState<string | null>(null);

  const numPadRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);

  const amountCents = useMemo(
    () => parseAmountInputToCents(amountInput),
    [amountInput]
  );

  const filteredCategories = useMemo(
    () => categories.filter((category) => category.type === type),
    [categories, type]
  );
  const { error: incomeSourceError } = useIncomeSourceData(transaction?.user_id, {
    enabled: isOpen && type === 'income',
    includeArchived: true,
  });

  useEffect(() => {
    if (!isOpen || !transaction) {
      return;
    }

    setValidationError(null);
    setType(transaction.type);
    setSelectedCategoryId(transaction.category_id);
    setSelectedSourceId(transaction.source_id);
    setPaymentMethod(transaction.payment_method);
    setAmountInput(formatAmountInputFromCents(transaction.amount_cents));
    setNote(transaction.note ?? '');
    setDate(transaction.date);
    setIsRecurring(transaction.is_recurring);
    setRecurrenceRule(transaction.recurrence_rule ?? 'monthly');
  }, [isOpen, transaction]);

  useEffect(() => {
    if (!selectedCategoryId) {
      return;
    }

    const categoryExists = filteredCategories.some(
      (category) => category.id === selectedCategoryId
    );

    if (!categoryExists) {
      setSelectedCategoryId(null);
    }
  }, [filteredCategories, selectedCategoryId]);

  useEffect(() => {
    if (type !== 'income') {
      setSelectedSourceId(null);
    }
  }, [type]);

  if (!isOpen || !transaction) {
    return null;
  }

  const visibleError = validationError ?? errorMessage ?? incomeSourceError;

  const handleAmountDisplayPress = () => {
    numPadRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  };

  const handleDatePickerOpen = () => {
    const input = dateInputRef.current as (HTMLInputElement & {
      showPicker?: () => void;
    }) | null;

    if (!input) {
      return;
    }

    if (typeof input.showPicker === 'function') {
      input.showPicker();
      return;
    }

    input.focus();
    input.click();
  };

  const handleSubmit = () => {
    if (amountCents <= 0) {
      setValidationError('Indique um montante válido.');
      return;
    }

    if (!selectedCategoryId) {
      setValidationError('Escolha uma categoria.');
      return;
    }

    setValidationError(null);
    void onSave({
      amount_cents: amountCents,
      type,
      category_id: selectedCategoryId,
      source_id: type === 'income' ? selectedSourceId : null,
      payment_method: paymentMethod,
      note: note.trim() ? note.trim() : null,
      date,
      is_recurring: isRecurring,
      recurrence_rule: isRecurring ? recurrenceRule : null,
      recurrence_parent_id: isRecurring ? null : (transaction.recurrence_parent_id ?? null),
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
        aria-labelledby="edit-transaction-title"
        className="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-[var(--radius-lg)] bg-[var(--color-bg)] shadow-[var(--shadow-md)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-[var(--color-divider)] p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3
                id="edit-transaction-title"
                className="text-lg font-semibold text-[var(--color-text)]"
              >
                Editar transação
              </h3>
              <p className="mt-1 text-sm text-[var(--color-text-secondary)]">
                Atualize montante, categoria, nota e data.
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

        <div className="flex-1 space-y-4 overflow-y-auto bg-[var(--color-bg-secondary)] p-4 sm:p-5">
          <button
            type="button"
            onClick={handleAmountDisplayPress}
            className="w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 text-left shadow-[var(--shadow-sm)] transition-colors hover:bg-[var(--color-bg-secondary)]"
          >
            <span className="text-sm font-medium text-[var(--color-text-secondary)]">
              Montante
            </span>
            <span className="mt-2 block text-4xl font-semibold tabular-nums text-[var(--color-text)] sm:text-5xl">
              {formatCents(amountCents)}
            </span>
          </button>

          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map((option) => {
              const isActive = type === option;

              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setType(option)}
                  aria-pressed={isActive}
                  className={`min-h-[44px] rounded-[var(--radius-md)] border px-4 py-3 text-sm font-semibold transition-colors ${
                    isActive
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-text-inverse)]'
                      : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                  }`}
                >
                  {TYPE_LABELS[option]}
                </button>
              );
            })}
          </div>

          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-[var(--color-text)]">Categoria</h4>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Escolha uma categoria de {TYPE_LABELS[type].toLowerCase()}.
                </p>
              </div>
              {filteredCategories.length > 0 && (
                <span className="text-xs text-[var(--color-text-tertiary)]">
                  Deslize para ver mais
                </span>
              )}
            </div>

            {filteredCategories.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">
                Não existem categorias disponíveis para {TYPE_LABELS[type].toLowerCase()}.
              </p>
            ) : (
              <div className="overflow-x-auto pb-1">
                <div className="grid auto-cols-[84px] grid-flow-col grid-rows-2 gap-3">
                  {filteredCategories.map((category) => {
                    const isActive = category.id === selectedCategoryId;

                    return (
                      <button
                        key={category.id}
                        type="button"
                        onClick={() => {
                          setSelectedCategoryId(category.id);
                          setValidationError(null);
                        }}
                        aria-pressed={isActive}
                        className={`flex min-h-[76px] w-[84px] flex-col items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 py-3 text-center transition-colors ${
                          isActive
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)]'
                            : 'border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-bg-secondary)]'
                        }`}
                      >
                        <span className="text-2xl" aria-hidden="true">
                          {category.emoji}
                        </span>
                        <span
                          className={`w-full truncate text-xs font-medium ${
                            isActive
                              ? 'text-[var(--color-accent)]'
                              : 'text-[var(--color-text-secondary)]'
                          }`}
                        >
                          {category.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {type === 'income' && (
            <IncomeSourceSelector
              selectedSourceId={selectedSourceId}
              onSelect={(sourceId) => {
                setSelectedSourceId(sourceId);
                setValidationError(null);
              }}
              disabled={isSubmitting}
            />
          )}

          <section className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h4 className="text-sm font-medium text-[var(--color-text)]">Como pagaste?</h4>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Atualize o método de pagamento desta transação.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPaymentMethod(null);
                  setValidationError(null);
                }}
                className="min-h-[44px] rounded-[var(--radius-md)] px-3 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-secondary)]"
              >
                Saltar
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHOD_OPTIONS.map((option) => {
                const isActive = paymentMethod === option.value;

                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => {
                      setPaymentMethod(option.value);
                      setValidationError(null);
                    }}
                    aria-pressed={isActive}
                    className={`flex min-h-[44px] items-center gap-2 rounded-full border px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                    }`}
                  >
                    <span aria-hidden="true">{option.emoji}</span>
                    <span>{PAYMENT_METHOD_SHORT_LABELS[option.value]}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
            <label
              htmlFor="edit-transaction-note"
              className="mb-2 block text-sm font-medium text-[var(--color-text)]"
            >
              Nota (opcional)
            </label>
            <input
              id="edit-transaction-note"
              type="text"
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setValidationError(null);
              }}
              placeholder="Adicionar nota"
              maxLength={120}
              className="min-h-[44px] w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)] outline-none transition-colors focus:border-[var(--color-accent)]"
            />

            <div className="mt-4 space-y-3 border-t border-[var(--color-divider)] pt-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">Recorrente</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Crie repetições automáticas desta transação.
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isRecurring}
                  onClick={() => {
                    setIsRecurring((currentValue) => {
                      const nextValue = !currentValue;
                      if (nextValue) {
                        setRecurrenceRule('monthly');
                      }
                      return nextValue;
                    });
                    setValidationError(null);
                  }}
                  className={`relative flex min-h-[44px] min-w-[44px] items-center rounded-full p-1 transition-colors ${
                    isRecurring
                      ? 'bg-[var(--color-accent)]'
                      : 'bg-[var(--color-bg-tertiary)]'
                  }`}
                >
                  <span
                    className={`h-5 w-5 rounded-full bg-[var(--color-bg)] shadow-[var(--shadow-sm)] transition-transform ${
                      isRecurring ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                  <span className="sr-only">Ativar transação recorrente</span>
                </button>
              </div>

              {isRecurring && (
                <div className="flex flex-wrap gap-2">
                  {RECURRENCE_OPTIONS.map((option) => {
                    const isActive = recurrenceRule === option.value;

                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => {
                          setRecurrenceRule(option.value);
                          setValidationError(null);
                        }}
                        aria-pressed={isActive}
                        className={`min-h-[44px] rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                          isActive
                            ? 'border-[var(--color-accent)] bg-[var(--color-accent-light)] text-[var(--color-accent)]'
                            : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)]'
                        }`}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
            <span className="mb-2 block text-sm font-medium text-[var(--color-text)]">
              Data
            </span>
            <div className="relative">
              <button
                type="button"
                onClick={handleDatePickerOpen}
                className="flex min-h-[44px] w-full items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-left text-sm text-[var(--color-text)] transition-colors hover:bg-[var(--color-bg-secondary)]"
              >
                <span>{formatEntryDate(date)}</span>
                <span className="text-lg text-[var(--color-text-secondary)]">📅</span>
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Selecionar data"
              />
            </div>
          </div>

          {visibleError && (
            <p className="rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-danger)]">
              {visibleError}
            </p>
          )}

          <div ref={numPadRef} className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg)] p-4 shadow-[var(--shadow-sm)]">
            <NumPad
              onKeyPress={(key) => {
                setAmountInput((currentValue) => appendAmountInput(currentValue, key));
                setValidationError(null);
              }}
              onBackspace={() => {
                setAmountInput((currentValue) => backspaceAmountInput(currentValue));
                setValidationError(null);
              }}
              disableDecimal={amountInput.includes('.')}
              disabled={isSubmitting}
            />
          </div>
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
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="min-h-[44px] rounded-[var(--radius-md)] bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text-inverse)] transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
            >
              {isSubmitting ? 'A guardar…' : 'Guardar alterações'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
